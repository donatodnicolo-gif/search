import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { ActivityType, DeliveryStatus, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';

const DELIVERY_INCLUDE = {
  partner: { select: { id: true, insegna: true } },
  valet: { select: { id: true, firstName: true, lastName: true } },
  serviceType: { select: { id: true, name: true, pricingModel: true } },
  customer: { select: { id: true, firstName: true, lastName: true } },
  products: { include: { product: { select: { id: true, name: true, price: true } } } },
  pickups: true,
} as const;

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtro di visibilita' in base al ruolo. */
  private roleFilter(user: JwtUser) {
    if (user.role === Role.PARTNER) return { partnerId: user.partnerId ?? '-' };
    if (user.role === Role.VALET) return { valetId: user.valetId ?? '-' };
    if (user.role === Role.PROJECT_MANAGER) {
      // Il PM non gestisce consegne: nessun accesso
      throw new ForbiddenException('Il project manager non accede alle consegne');
    }
    return {};
  }

  async findAll(
    user: JwtUser,
    query: { date?: string; status?: string; partnerId?: string; valetId?: string },
  ) {
    const where: any = { ...this.roleFilter(user) };
    if (query.status) where.status = query.status;
    if (query.partnerId && user.role !== Role.PARTNER) where.partnerId = query.partnerId;
    if (query.valetId && user.role !== Role.VALET) where.valetId = query.valetId;
    if (query.date) {
      const day = new Date(query.date);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      where.date = { gte: day, lt: next };
    }
    const deliveries = await this.prisma.delivery.findMany({
      where,
      include: DELIVERY_INCLUDE,
      orderBy: [{ date: 'desc' }, { code: 'desc' }],
    });
    return deliveries.map((d) => this.hideInternalNotes(d, user));
  }

  async findOne(id: string, user: JwtUser) {
    const delivery = await this.prisma.delivery.findFirst({
      where: { id, ...this.roleFilter(user) },
      include: { ...DELIVERY_INCLUDE, activities: true, logs: true },
    });
    if (!delivery) throw new NotFoundException('Consegna non trovata');
    return this.hideInternalNotes(delivery, user);
  }

  async create(dto: CreateDeliveryDto, user: JwtUser) {
    // Il partner crea solo per se stesso
    const partnerId =
      user.role === Role.PARTNER ? user.partnerId : dto.partnerId;
    if (!partnerId) throw new BadRequestException('partnerId obbligatorio');

    const serviceType = await this.prisma.serviceType.findUnique({
      where: { id: dto.serviceTypeId },
    });
    if (!serviceType) throw new BadRequestException('Tipo di servizio inesistente');

    // Prezzo per partner e paga valet dal matching servizio/salario
    const partnerService = await this.prisma.partnerService.findUnique({
      where: {
        partnerId_serviceTypeId: { partnerId, serviceTypeId: dto.serviceTypeId },
      },
    });

    const hours = dto.hours ?? 1;
    let price = partnerService?.price ?? serviceType.basePrice ?? 0;
    if (serviceType.pricingModel === 'A_ORA') price = price * Math.max(hours, 1);

    // Extra KM / extra fuori citta' (in prod: distanza calcolata via API mappe)
    const distanceKm = dto.distanceKm ?? null;
    let extraKm = 0;
    if (distanceKm != null && partnerService && distanceKm > partnerService.includedKm) {
      extraKm = distanceKm - partnerService.includedKm;
      price += extraKm * partnerService.extraKmPrice;
    }

    const { products, pickups, partnerId: _p, ...scalar } = dto;

    const last = await this.prisma.delivery.aggregate({ _max: { code: true } });

    const delivery = await this.prisma.delivery.create({
      data: {
        ...scalar,
        code: (last._max.code ?? 0) + 1,
        date: new Date(dto.date),
        partnerId,
        price,
        distanceKm,
        extraKm,
        status: dto.valetId ? DeliveryStatus.ASSIGNED : DeliveryStatus.CREATED,
        products: products?.length
          ? {
              create: products.map((p) => ({
                productId: p.productId,
                quantity: p.quantity ?? 1,
                fieldValues: p.fieldValues,
              })),
            }
          : undefined,
        pickups: pickups?.length ? { create: pickups } : undefined,
        // Ogni consegna genera attivita' di ritiro + consegna
        activities: {
          create: [
            {
              type: ActivityType.PICKUP,
              valetId: dto.valetId,
              timeFrom: dto.pickupTimeFrom,
              timeTo: dto.pickupTimeTo,
              address: dto.pickupAddress,
              scheduledAt: new Date(dto.date),
              sortOrder: 0,
            },
            {
              type: ActivityType.DELIVERY,
              valetId: dto.valetId,
              address: dto.recipientAddress,
              scheduledAt: new Date(dto.date),
              sortOrder: 1,
            },
          ],
        },
        logs: {
          create: {
            type: 'created',
            message: 'Consegna inserita',
            userId: user.sub,
          },
        },
      },
      include: DELIVERY_INCLUDE,
    });
    return delivery;
  }

  async update(id: string, dto: UpdateDeliveryDto, user: JwtUser) {
    await this.findOne(id, user);
    const { products, pickups, partnerId, date, ...scalar } = dto;
    return this.prisma.delivery.update({
      where: { id },
      data: {
        ...scalar,
        ...(date ? { date: new Date(date) } : {}),
      },
      include: DELIVERY_INCLUDE,
    });
  }

  async updateStatus(id: string, status: DeliveryStatus, user: JwtUser) {
    const delivery = await this.findOne(id, user);

    // Il partner puo' solo richiedere la cancellazione
    if (
      user.role === Role.PARTNER &&
      status !== DeliveryStatus.CANCELLATION_REQUESTED
    ) {
      throw new ForbiddenException(
        'Il partner puo solo richiedere la cancellazione',
      );
    }

    const logType =
      status === DeliveryStatus.IN_DELIVERY
        ? 'departed'
        : status === DeliveryStatus.DELIVERED
          ? 'delivered'
          : 'status_change';

    return this.prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status,
        logs: {
          create: {
            type: logType,
            message: `Stato: ${delivery.status} -> ${status}`,
            userId: user.sub,
          },
        },
      },
      include: DELIVERY_INCLUDE,
    });
  }

  async assignValet(id: string, valetId: string, user: JwtUser) {
    const delivery = await this.findOne(id, user);
    const valet = await this.prisma.valet.findUnique({ where: { id: valetId } });
    if (!valet) throw new BadRequestException('Valet inesistente');

    // Paga del valet dal matching salario/servizio (stesso pricingModel)
    const valetService = await this.prisma.valetService.findUnique({
      where: {
        valetId_serviceTypeId: { valetId, serviceTypeId: delivery.serviceTypeId },
      },
    });
    const valetSalary =
      valetService != null
        ? valetService.salary * (delivery.hours ?? 1)
        : null;

    await this.prisma.activity.updateMany({
      where: { deliveryId: id },
      data: { valetId },
    });

    return this.prisma.delivery.update({
      where: { id },
      data: {
        valetId,
        valetSalary,
        status: DeliveryStatus.ASSIGNED,
        logs: {
          create: {
            type: 'status_change',
            message: `Assegnata al valet ${valet.firstName} ${valet.lastName}`,
            userId: user.sub,
          },
        },
      },
      include: DELIVERY_INCLUDE,
    });
  }

  async remove(id: string, user: JwtUser) {
    await this.findOne(id, user);
    await this.prisma.delivery.delete({ where: { id } });
    return { deleted: true };
  }

  /** Le note interne sono visibili solo ad admin/operation/valet. */
  private hideInternalNotes<T extends { internalNotes?: string | null }>(
    delivery: T,
    user: JwtUser,
  ): T {
    if (user.role === Role.PARTNER) {
      return { ...delivery, internalNotes: null } as T;
    }
    return delivery;
  }
}
