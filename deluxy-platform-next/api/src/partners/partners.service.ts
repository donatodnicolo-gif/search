import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/create-partner.dto';

const PARTNER_INCLUDE = {
  provinces: { include: { province: true } },
  services: { include: { serviceType: true } },
  categories: { include: { category: true } },
  openingHours: true,
} as const;

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  findAll() {
    return this.prisma.partner.findMany({
      include: PARTNER_INCLUDE,
      orderBy: { insegna: 'asc' },
    });
  }

  async findOne(id: string, user?: JwtUser) {
    // Il partner vede solo se stesso
    if (user?.role === Role.PARTNER && user.partnerId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: PARTNER_INCLUDE,
    });
    if (!partner) throw new NotFoundException('Partner non trovato');
    return partner;
  }

  async create(dto: CreatePartnerDto, actor?: JwtUser) {
    const { provinceIds, categoryIds, services, openingHours, pickupAddresses, ...scalar } = dto;
    const partner = await this.prisma.partner.create({
      data: {
        ...scalar,
        contractStart: scalar.contractStart ? new Date(scalar.contractStart) : undefined,
        contractEnd: scalar.contractEnd ? new Date(scalar.contractEnd) : undefined,
        pickupAddresses: pickupAddresses?.length ? JSON.stringify(pickupAddresses) : undefined,
        provinces: provinceIds?.length
          ? { create: provinceIds.map((provinceId) => ({ provinceId })) }
          : undefined,
        categories: categoryIds?.length
          ? {
              create: categoryIds.map((categoryId, index) => ({
                categoryId,
                priority: index,
              })),
            }
          : undefined,
        services: services?.length ? { create: services } : undefined,
        openingHours: openingHours?.length ? { create: openingHours } : undefined,
      },
      include: PARTNER_INCLUDE,
    });
    // Un gesto solo: crea l'utente PARTNER collegato (invitato). Gestione
    // dell'invito dalla pagina Utenti.
    await this.users.provisionForAnagrafica(
      {
        email: partner.email,
        firstName: partner.contactName || partner.insegna,
        lastName: partner.contactSurname || '',
        role: Role.PARTNER,
        partnerId: partner.id,
      },
      actor,
    );
    return partner;
  }

  async update(id: string, dto: UpdatePartnerDto, user: JwtUser) {
    if (user.role === Role.PARTNER && user.partnerId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    await this.findOne(id);
    const { provinceIds, categoryIds, services, openingHours, pickupAddresses, ...rest } = dto;
    const scalar = {
      ...rest,
      ...(rest.contractStart ? { contractStart: new Date(rest.contractStart) } : {}),
      ...(rest.contractEnd ? { contractEnd: new Date(rest.contractEnd) } : {}),
      ...(pickupAddresses ? { pickupAddresses: JSON.stringify(pickupAddresses) } : {}),
    };

    // Il partner puo' modificare solo alcuni campi propri (es. orari apertura)
    if (user.role === Role.PARTNER) {
      const allowed: any = {};
      if (scalar.phone !== undefined) allowed.phone = scalar.phone;
      if (scalar.contactName !== undefined) allowed.contactName = scalar.contactName;
      if (scalar.notes !== undefined) allowed.notes = scalar.notes;
      return this.prisma.partner.update({
        where: { id },
        data: {
          ...allowed,
          ...(openingHours
            ? { openingHours: { deleteMany: {}, create: openingHours } }
            : {}),
        },
        include: PARTNER_INCLUDE,
      });
    }

    return this.prisma.partner.update({
      where: { id },
      data: {
        ...scalar,
        ...(provinceIds
          ? {
              provinces: {
                deleteMany: {},
                create: provinceIds.map((provinceId) => ({ provinceId })),
              },
            }
          : {}),
        ...(categoryIds
          ? {
              categories: {
                deleteMany: {},
                create: categoryIds.map((categoryId, index) => ({
                  categoryId,
                  priority: index,
                })),
              },
            }
          : {}),
        ...(services ? { services: { deleteMany: {}, create: services } } : {}),
        ...(openingHours
          ? { openingHours: { deleteMany: {}, create: openingHours } }
          : {}),
      },
      include: PARTNER_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.partner.update({ where: { id }, data: { active: false } });
    return { deactivated: true };
  }

  // --- Eccezioni per data (chiusure straordinarie / orari speciali) ---

  /** Il partner gestisce solo le proprie eccezioni; admin/operation/PM tutte. */
  private assertCanManage(partnerId: string, user: JwtUser): void {
    if (user.role === Role.PARTNER && user.partnerId !== partnerId) {
      throw new ForbiddenException('Accesso non consentito');
    }
  }

  async getDayExceptions(partnerId: string, user: JwtUser, from?: string, to?: string) {
    this.assertCanManage(partnerId, user);
    const where: any = { partnerId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) { const t = new Date(to); t.setDate(t.getDate() + 1); where.date.lt = t; }
    }
    const rows = await this.prisma.partnerDayException.findMany({ where, orderBy: { date: 'asc' } });
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      closed: r.closed,
      openTime: r.openTime,
      closeTime: r.closeTime,
      note: r.note,
    }));
  }

  /** Crea/aggiorna l'eccezione per una data (upsert su partnerId+date). */
  async upsertDayException(
    partnerId: string,
    user: JwtUser,
    dto: { date: string; closed?: boolean; openTime?: string; closeTime?: string; note?: string },
  ) {
    this.assertCanManage(partnerId, user);
    const date = new Date(dto.date + 'T00:00:00.000Z');
    const data = {
      closed: dto.closed ?? false,
      openTime: dto.closed ? null : (dto.openTime || null),
      closeTime: dto.closed ? null : (dto.closeTime || null),
      note: dto.note || null,
    };
    const row = await this.prisma.partnerDayException.upsert({
      where: { partnerId_date: { partnerId, date } },
      update: data,
      create: { partnerId, date, ...data },
    });
    return { date: row.date.toISOString().slice(0, 10), ...data };
  }

  async removeDayException(partnerId: string, user: JwtUser, dateStr: string) {
    this.assertCanManage(partnerId, user);
    const date = new Date(dateStr + 'T00:00:00.000Z');
    await this.prisma.partnerDayException.deleteMany({ where: { partnerId, date } });
    return { deleted: true };
  }
}
