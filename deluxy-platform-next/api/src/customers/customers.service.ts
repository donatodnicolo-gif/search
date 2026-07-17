import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtUser) {
    const where =
      user.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {};
    return this.prisma.customer.findMany({
      where,
      include: { partner: { select: { id: true, insegna: true } } },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string, user: JwtUser) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        partner: { select: { id: true, insegna: true } },
        // Consegne del cliente, mostrate nella scheda cliente
        deliveries: {
          select: { id: true, code: true, date: true, status: true },
          orderBy: { date: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente non trovato');
    if (user.role === Role.PARTNER && customer.partnerId !== user.partnerId) {
      throw new ForbiddenException('Accesso non consentito');
    }
    return customer;
  }

  create(dto: CreateCustomerDto, user: JwtUser) {
    const partnerId =
      user.role === Role.PARTNER ? user.partnerId : dto.partnerId;
    return this.prisma.customer.create({
      data: { ...dto, partnerId },
    });
  }

  async update(id: string, dto: UpdateCustomerDto, user: JwtUser) {
    await this.findOne(id, user);
    const { partnerId, ...scalar } = dto;
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...scalar,
        ...(user.role !== Role.PARTNER && partnerId !== undefined
          ? { partnerId }
          : {}),
      },
    });
  }

  async remove(id: string, user: JwtUser) {
    await this.findOne(id, user);
    await this.prisma.customer.delete({ where: { id } });
    return { deleted: true };
  }
}
