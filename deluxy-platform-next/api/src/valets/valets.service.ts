import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateValetDto, UpdateValetDto } from './dto/create-valet.dto';

const VALET_INCLUDE = {
  provinces: { include: { province: true } },
  services: { include: { serviceType: true } },
} as const;

@Injectable()
export class ValetsService {
  constructor(private readonly prisma: PrismaService) {}

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

  create(dto: CreateValetDto) {
    const {
      provinceIds, services, birthDate,
      teamLeaderProvinceIds, teamLeaderPartnerIds, teamLeaderExcludedPartnerIds, ...scalar
    } = dto;
    return this.prisma.valet.create({
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

  /** Disponibilita' del valet. */
  setAvailability(
    valetId: string,
    body: { date: string; timeFrom?: string; timeTo?: string; available?: boolean },
  ) {
    return this.prisma.valetAvailability.create({
      data: {
        valetId,
        date: new Date(body.date),
        timeFrom: body.timeFrom,
        timeTo: body.timeTo,
        available: body.available ?? true,
      },
    });
  }

  getAvailability(valetId: string) {
    return this.prisma.valetAvailability.findMany({
      where: { valetId },
      orderBy: { date: 'asc' },
    });
  }
}
