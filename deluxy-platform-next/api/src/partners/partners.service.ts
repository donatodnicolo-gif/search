import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/create-partner.dto';

const PARTNER_INCLUDE = {
  provinces: { include: { province: true } },
  services: { include: { serviceType: true } },
  categories: { include: { category: true } },
  openingHours: true,
} as const;

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

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

  create(dto: CreatePartnerDto) {
    const { provinceIds, categoryIds, services, openingHours, ...scalar } = dto;
    return this.prisma.partner.create({
      data: {
        ...scalar,
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
  }

  async update(id: string, dto: UpdatePartnerDto, user: JwtUser) {
    if (user.role === Role.PARTNER && user.partnerId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    await this.findOne(id);
    const { provinceIds, categoryIds, services, openingHours, ...scalar } = dto;

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
}
