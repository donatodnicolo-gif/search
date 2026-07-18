import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { JwtUser } from '../common/decorators';
import { ActivityType, DeliveryStatus, PricingModel, Role } from '../common/enums';
import {
  PagedResult,
  buildOrderBy,
  dateRange,
  paginate,
  textSearch,
} from '../common/list-query';
import { DeliveryListQueryDto } from './dto/delivery-list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.module';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

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

  /** Campi testuali coperti dalla ricerca globale `q`. */
  private static readonly SEARCH_FIELDS = [
    'recipientFirstName',
    'recipientLastName',
    'recipientAddress',
    'recipientPhone',
    'recipientEmail',
    'senderFirstName',
    'senderLastName',
    'ddtNumber',
    'notes',
    'partner.insegna',
    'valet.firstName',
    'valet.lastName',
    'serviceType.name',
  ];

  /** Campi ordinabili (whitelist). */
  private static readonly SORT_FIELDS = [
    'code',
    'date',
    'status',
    'price',
    'deliveryTimeFrom',
    'pickupTimeFrom',
    'recipientLastName',
    'partner.insegna',
    'serviceType.name',
  ];

  /**
   * Lista consegne: filtri specifici (stato/partner/valet/data) + ricerca
   * globale, ordinamento e paginazione dal contratto comune.
   */
  async findAll(
    user: JwtUser,
    query: DeliveryListQueryDto,
  ): Promise<PagedResult<unknown>> {
    const scope: any = { ...this.roleFilter(user) };
    if (query.status) scope.status = query.status;
    if (query.partnerId && user.role !== Role.PARTNER) scope.partnerId = query.partnerId;
    if (query.valetId && user.role !== Role.VALET) scope.valetId = query.valetId;
    // `date` = giorno singolo (retrocompatibile); dateFrom/dateTo = intervallo
    if (query.date) {
      const day = new Date(query.date);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      scope.date = { gte: day, lt: next };
    } else {
      const range = dateRange(query, 'date');
      if (range) Object.assign(scope, range);
    }

    const search = textSearch(query.q, DeliveriesService.SEARCH_FIELDS);
    const where = search ? { AND: [scope, search] } : scope;
    const { skip, take, page, pageSize } = paginate(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where,
        include: DELIVERY_INCLUDE,
        orderBy: buildOrderBy(query, DeliveriesService.SORT_FIELDS, [
          { date: 'desc' },
          { code: 'desc' },
        ]) as any,
        skip,
        take,
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return {
      items: rows.map((d) => this.hideInternalNotes(d, user)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Calendario: conteggio consegne per giorno (e per stato) in un intervallo,
   * filtrato per ruolo (il partner vede solo le proprie). Serve alla vista
   * mensile: ogni giorno con ordini viene marcato.
   */
  async calendar(user: JwtUser, from?: string, to?: string) {
    const scope: any = { ...this.roleFilter(user) };
    if (from || to) {
      scope.date = {};
      if (from) scope.date.gte = new Date(from);
      if (to) { const t = new Date(to); t.setDate(t.getDate() + 1); scope.date.lt = t; }
    }
    const rows = await this.prisma.delivery.findMany({
      where: scope,
      select: { date: true, status: true },
      take: 10000,
    });
    const byDay = new Map<string, { date: string; total: number; byStatus: Record<string, number> }>();
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      const entry = byDay.get(key) ?? { date: key, total: 0, byStatus: {} };
      entry.total++;
      entry.byStatus[r.status] = (entry.byStatus[r.status] ?? 0) + 1;
      byDay.set(key, entry);
    }
    return { days: [...byDay.values()] };
  }

  /**
   * Punti per la mappa consegne: solo consegne con coordinate, filtrate come la
   * lista (stato, intervallo date). Proiezione leggera, risultati limitati.
   * Riservato ad Admin/Operation (gate nel controller).
   */
  async mapPoints(user: JwtUser, query: DeliveryListQueryDto) {
    const scope: any = { ...this.roleFilter(user) };
    if (query.status) scope.status = query.status;
    if (query.partnerId && user.role !== Role.PARTNER) scope.partnerId = query.partnerId;
    if (query.valetId && user.role !== Role.VALET) scope.valetId = query.valetId;
    if (query.date) {
      const day = new Date(query.date);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      scope.date = { gte: day, lt: next };
    } else {
      const range = dateRange(query, 'date');
      if (range) Object.assign(scope, range);
    }
    scope.latitude = { not: null };

    const rows = await this.prisma.delivery.findMany({
      where: scope,
      select: {
        id: true,
        code: true,
        status: true,
        date: true,
        latitude: true,
        longitude: true,
        recipientFirstName: true,
        recipientLastName: true,
        recipientAddress: true,
        deliveryTimeFrom: true,
        deliveryTimeTo: true,
        partner: { select: { insegna: true } },
        valet: { select: { firstName: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
      take: 3000, // cap di sicurezza: oltre serve un altro approccio (tiles/heatmap)
    });
    return { points: rows, capped: rows.length === 3000 };
  }

  /**
   * Backfill: geocodifica le consegne senza coordinate (una tantum, throttlato).
   * Elabora al massimo `limit` consegne per chiamata per non sforare la quota.
   */
  async geocodeMissing(limit = 50) {
    const pending = await this.prisma.delivery.findMany({
      where: { latitude: null, recipientAddress: { not: '' } },
      select: { id: true, recipientAddress: true },
      take: Math.min(Math.max(limit, 1), 200),
    });
    let updated = 0;
    for (const d of pending) {
      const coords = await this.settings.geocodeCoords(d.recipientAddress);
      if (coords) {
        await this.prisma.delivery.update({
          where: { id: d.id },
          data: { latitude: coords.lat, longitude: coords.lng },
        });
        updated++;
      }
    }
    const remaining = await this.prisma.delivery.count({ where: { latitude: null } });
    return { processed: pending.length, updated, remaining };
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

    // Coordinate per la mappa: geocodifica una volta l'indirizzo (chiave server).
    const coords = await this.settings.geocodeCoords(dto.recipientAddress);

    const delivery = await this.prisma.delivery.create({
      data: {
        ...scalar,
        code: (last._max.code ?? 0) + 1,
        date: new Date(dto.date),
        partnerId,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        // Prezzo: se impostato manualmente (LISTINO) vince, altrimenti calcolo automatico
        price: dto.price != null ? dto.price : price,
        distanceKm,
        extraKm,
        // Stato: se impostato manualmente vince, altrimenti in base all'assegnazione valet
        status: dto.status ?? (dto.valetId ? DeliveryStatus.ASSIGNED : DeliveryStatus.CREATED),
        products: products?.length
          ? {
              create: products.map((p) => ({
                productId: p.productId,
                quantity: p.quantity ?? 1,
                price: p.price,
                flexiblePrice: p.flexiblePrice ?? false,
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
    const delivery = await this.findOne(id, user);
    // Regola di business: il partner puo' modificare la consegna solo finche' e'
    // "da gestire" (created = il rosso della legenda) e solo se il tipo di
    // servizio non e' VENDITA. Admin/Operation non hanno limiti.
    if (user.role === Role.PARTNER) {
      if (delivery.status !== DeliveryStatus.CREATED) {
        throw new ForbiddenException(
          "Puoi modificare la consegna solo finché è da gestire",
        );
      }
      if (delivery.serviceType?.pricingModel === PricingModel.VENDITA) {
        throw new ForbiddenException(
          'Le consegne con servizio di tipo Vendita non sono modificabili dal partner',
        );
      }
    }
    const { products, pickups, partnerId, date, ...scalar } = dto;
    // Se l'indirizzo destinatario cambia, rigeocodifica le coordinate della mappa.
    const reGeocode =
      dto.recipientAddress && dto.recipientAddress !== delivery.recipientAddress
        ? await this.settings.geocodeCoords(dto.recipientAddress)
        : undefined;
    return this.prisma.delivery.update({
      where: { id },
      data: {
        ...scalar,
        ...(date ? { date: new Date(date) } : {}),
        ...(reGeocode !== undefined
          ? { latitude: reGeocode?.lat ?? null, longitude: reGeocode?.lng ?? null }
          : {}),
        // Righe prodotto: sostituite in blocco (come nei form di modifica)
        ...(products
          ? {
              products: {
                deleteMany: {},
                create: products.map((p) => ({
                  productId: p.productId,
                  quantity: p.quantity ?? 1,
                  price: p.price,
                  flexiblePrice: p.flexiblePrice ?? false,
                  fieldValues: p.fieldValues,
                })),
              },
            }
          : {}),
        // Indirizzi di ritiro multipli
        ...(pickups
          ? { pickups: { deleteMany: {}, create: pickups } }
          : {}),
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

  /**
   * Restituisce (creandolo se assente) il token del link pubblico di
   * monitoraggio della consegna. Token opaco: non deducibile dall'id.
   */
  async getTrackingToken(id: string, user: JwtUser) {
    const delivery = await this.findOne(id, user);
    if (delivery.trackingToken) return { token: delivery.trackingToken };
    const token = randomBytes(24).toString('hex');
    await this.prisma.delivery.update({ where: { id }, data: { trackingToken: token } });
    return { token };
  }

  /**
   * Vista pubblica della consegna (link MONITORARE, senza login).
   * Espone solo lo stretto necessario al monitoraggio: niente contatti,
   * niente note, niente economics, niente indirizzo completo.
   */
  async findByTrackingToken(token: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: { trackingToken: token },
      include: {
        partner: { select: { insegna: true } },
        valet: { select: { firstName: true } },
        logs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!delivery) throw new NotFoundException('Consegna non trovata');
    return {
      code: delivery.code,
      status: delivery.status,
      date: delivery.date,
      deliveryTimeFrom: delivery.deliveryTimeFrom,
      deliveryTimeTo: delivery.deliveryTimeTo,
      // Solo il nome di battesimo del destinatario e la citta', per riconoscere
      // la consegna senza esporre dati personali completi.
      recipientFirstName: delivery.recipientFirstName,
      partner: delivery.partner?.insegna ?? null,
      valetFirstName: delivery.valet?.firstName ?? null,
      logs: delivery.logs.map((l) => ({ type: l.type, message: l.message, createdAt: l.createdAt })),
    };
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
