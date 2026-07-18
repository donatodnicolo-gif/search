import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateValetDto, UpdateValetDto } from './dto/create-valet.dto';

const VALET_INCLUDE = {
  provinces: { include: { province: true } },
  services: { include: { serviceType: true } },
} as const;

@Injectable()
export class ValetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  findAll() {
    return this.prisma.valet.findMany({
      include: VALET_INCLUDE,
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string, user?: JwtUser) {
    if (user?.role === Role.VALET && user.valetId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    const valet = await this.prisma.valet.findUnique({
      where: { id },
      include: VALET_INCLUDE,
    });
    if (!valet) throw new NotFoundException('Valet non trovato');
    return valet;
  }

  async create(dto: CreateValetDto, actor?: JwtUser) {
    const {
      provinceIds, services, birthDate,
      teamLeaderProvinceIds, teamLeaderPartnerIds, teamLeaderExcludedPartnerIds, ...scalar
    } = dto;
    const valet = await this.prisma.valet.create({
      data: {
        ...scalar,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        teamLeaderProvinces: teamLeaderProvinceIds?.length
          ? JSON.stringify(teamLeaderProvinceIds)
          : undefined,
        teamLeaderPartners: teamLeaderPartnerIds?.length
          ? JSON.stringify(teamLeaderPartnerIds)
          : undefined,
        teamLeaderExcludedPartners: teamLeaderExcludedPartnerIds?.length
          ? JSON.stringify(teamLeaderExcludedPartnerIds)
          : undefined,
        provinces: provinceIds?.length
          ? { create: provinceIds.map((provinceId) => ({ provinceId })) }
          : undefined,
        services: services?.length ? { create: services } : undefined,
      },
      include: VALET_INCLUDE,
    });
    // Un gesto solo: crea l'utente VALET collegato (invitato).
    await this.users.provisionForAnagrafica(
      {
        email: valet.email,
        firstName: valet.firstName,
        lastName: valet.lastName,
        role: Role.VALET,
        valetId: valet.id,
      },
      actor,
    );
    return valet;
  }

  async update(id: string, dto: UpdateValetDto) {
    await this.findOne(id);
    const {
      provinceIds, services, birthDate,
      teamLeaderProvinceIds, teamLeaderPartnerIds, teamLeaderExcludedPartnerIds, ...scalar
    } = dto;
    return this.prisma.valet.update({
      where: { id },
      data: {
        ...scalar,
        ...(birthDate ? { birthDate: new Date(birthDate) } : {}),
        ...(teamLeaderProvinceIds
          ? { teamLeaderProvinces: JSON.stringify(teamLeaderProvinceIds) }
          : {}),
        ...(teamLeaderPartnerIds
          ? { teamLeaderPartners: JSON.stringify(teamLeaderPartnerIds) }
          : {}),
        ...(teamLeaderExcludedPartnerIds
          ? { teamLeaderExcludedPartners: JSON.stringify(teamLeaderExcludedPartnerIds) }
          : {}),
        ...(provinceIds
          ? {
              provinces: {
                deleteMany: {},
                create: provinceIds.map((provinceId) => ({ provinceId })),
              },
            }
          : {}),
        ...(services ? { services: { deleteMany: {}, create: services } } : {}),
      },
      include: VALET_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.valet.update({ where: { id }, data: { active: false } });
    return { deactivated: true };
  }

  // --- Disponibilità per data (impostata dal valet dal calendario) ---

  /** Il valet gestisce solo la propria disponibilità; admin/operation/PM tutte. */
  private assertCanManage(valetId: string, user: JwtUser): void {
    if (user.role === Role.VALET && user.valetId !== valetId) {
      throw new ForbiddenException('Accesso non consentito');
    }
  }

  async getAvailability(valetId: string, user: JwtUser, from?: string, to?: string) {
    this.assertCanManage(valetId, user);
    const where: any = { valetId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) { const t = new Date(to); t.setDate(t.getDate() + 1); where.date.lt = t; }
    }
    const rows = await this.prisma.valetAvailability.findMany({ where, orderBy: { date: 'asc' } });
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      available: r.available,
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
      note: r.note,
    }));
  }

  /** Crea/aggiorna la disponibilità per una data (upsert su valetId+date). */
  async setAvailability(
    valetId: string,
    user: JwtUser,
    body: { date: string; available?: boolean; timeFrom?: string; timeTo?: string; note?: string },
  ) {
    this.assertCanManage(valetId, user);
    const date = new Date(body.date + 'T00:00:00.000Z');
    const available = body.available ?? true;
    const data = {
      available,
      timeFrom: available ? (body.timeFrom || null) : null,
      timeTo: available ? (body.timeTo || null) : null,
      note: body.note || null,
    };
    const row = await this.prisma.valetAvailability.upsert({
      where: { valetId_date: { valetId, date } },
      update: data,
      create: { valetId, date, ...data },
    });
    return { date: row.date.toISOString().slice(0, 10), ...data };
  }

  async removeAvailability(valetId: string, user: JwtUser, dateStr: string) {
    this.assertCanManage(valetId, user);
    const date = new Date(dateStr + 'T00:00:00.000Z');
    await this.prisma.valetAvailability.deleteMany({ where: { valetId, date } });
    return { deleted: true };
  }
}
