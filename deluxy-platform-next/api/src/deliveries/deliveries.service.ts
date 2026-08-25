import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { JwtUser } from '../common/decorators';
import { tariffaAllaData } from '../common/tariffe-valet';
import {
  ActivityType,
  DeliveryStatus,
  NotificationType,
  PricingModel,
  Role,
  DELIVERY_CLOSED_STATUSES,
} from '../common/enums';
import { NotificationsService } from '../notifications/notifications.module';
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

/**
 * Che cosa serve all'ELENCO — non tutto quello che una consegna sa.
 *
 * ⚠️ Il modello ha 119 colonne, e mandarle tutte faceva 250 KB per venti righe:
 * 12,5 KB a consegna per riempire una tabella che ne mostra otto. Il contratto
 * del frontend (`core/models.ts`, interfaccia `Delivery`) ne dichiara venti, e
 * il calendario ne usa ancora meno: sono quelle.
 *
 * Il DETTAGLIO continua a caricare tutto (`DELIVERY_INCLUDE` sotto): li' le
 * colonne servono davvero, ed e' una consegna sola.
 */
const DELIVERY_LIST_SELECT = {
  id: true, code: true, date: true, status: true,
  deliveryTimeFrom: true, deliveryTimeTo: true, deliveryFlexible: true,
  pickupTimeFrom: true, pickupTimeTo: true, pickupFlexible: true,
  recipientFirstName: true, recipientLastName: true, recipientAddress: true,
  paymentOnDelivery: true, paymentAmount: true, price: true,
  partner: { select: { id: true, insegna: true } },
  valet: { select: { id: true, firstName: true, lastName: true } },
  serviceType: { select: { id: true, name: true, pricingModel: true } },
} as const;

/**
 * IL RITIRO E' NELLA CITTA' DI CONSEGNA — partner "locali" (25/08/2026).
 *
 * Per un partner come «Artista Locale» il fornitore sta, per definizione, dove
 * abita chi riceve: non esiste un magazzino da cui partire. Quando il ritiro
 * arriva come etichetta generica («Milano») la distanza viene calcolata da
 * quel punto, e su 1.561 consegne di quel partner risultavano 312 km di media
 * — Milano→Firenze per una consegna dentro Firenze.
 *
 * ⚠️ NON e' un difetto estetico: la paga del valet fuori citta' e'
 * `extraOutOfCityPrice x distanceKm` (calculations.fixedPrice) — la distanza
 * INTERA, non l'eccedenza. Con la tariffa di 1 EUR/km, ogni chilometro
 * sbagliato e' un euro pagato in piu': una consegna Roma→Fiumicino di 25 km
 * ne ha pagati 615,86.
 *
 * Qui il ritiro si FORZA alla citta' del destinatario, e la distanza ereditata
 * si azzera: era misurata da un'altra origine, tenerla vorrebbe dire lasciare
 * in piedi proprio il numero che sbaglia la paga. Chi conosce la distanza vera
 * la riscrive dalla consegna.
 */
// ⚠️ UN SOLO partner, non una categoria: la regola vale per ARTISTA LOCALE e
// basta. Aggiungerne un altro e' una decisione di business (vuol dire dire che
// quel fornitore non ha un magazzino), non una riga da allungare di passaggio.
const PARTNER_RITIRO_IN_CITTA = 'artista locale';

/**
 * Oltre questa distanza, per un fornitore LOCALE, il numero non e' una
 * consegna lunga: e' una distanza misurata dall'origine sbagliata. Il campione
 * lo dice — le consegne di Artista Locale col ritiro «Milano» hanno 312 km di
 * media, e il valet quel giorno lavorava dentro Firenze.
 *
 * ⚠️ La soglia serve perche' la paga fuori citta' e' `extraOutOfCityPrice x
 * distanceKm` sulla distanza INTERA (calculations.fixedPrice): con la tariffa
 * di 1 EUR/km un chilometro sbagliato e' un euro pagato in piu'.
 */
const KM_MASSIMI_IN_CITTA = 50;

/**
 * La citta' dentro un indirizzo, nei formati che il campo contiene davvero
 * (misurati sulle 2.568 consegne del partner, 99,6% riconosciute):
 *   «Lungarno Cristoforo Colombo, 22/a, 50136 Firenze FI, Italia» -> Firenze
 *   «Via di Belvedere 33, 50125, Firenze, FI, Italy»              -> Firenze
 *   «Milano MI, Italia»                                           -> Milano
 * Se non combacia torna null: un ritiro sbagliato e' meglio di un ritiro
 * inventato, e chi chiama lascia le cose come stanno. Restano fuori gli
 * indirizzi degeneri («Milano» secco, «35030 PD, Italia» senza citta').
 */
export function cittaDaIndirizzo(indirizzo: string | null | undefined): string | null {
  if (!indirizzo) return null;
  const parti = indirizzo.split(',').map((x) => x.trim()).filter(Boolean);
  while (parti.length && /^(italia|italy)$/i.test(parti[parti.length - 1])) parti.pop();
  if (!parti.length) return null;
  const ultima = parti[parti.length - 1];
  // «…, Firenze, FI»: la sigla di provincia sta da sola in coda.
  if (/^[A-Z]{2}$/.test(ultima) && parti.length >= 2) {
    const citta = parti[parti.length - 2].replace(/^\d{5}\s*/, '').trim();
    return citta || null;
  }
  // «…, 50136 Firenze FI» oppure «Milano MI».
  const conCap = ultima.match(/^\d{5}\s+(.+?)\s+[A-Z]{2}$/);
  if (conCap) return conCap[1].trim();
  const senzaCap = ultima.match(/^(.+?)\s+[A-Z]{2}$/);
  if (senzaCap) return senzaCap[1].replace(/^\d{5}\s*/, '').trim() || null;
  return null;
}

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
    private readonly notifications: NotificationsService,
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
  /**
   * Come si ordina la lista consegne.
   *
   * Di default per ORARIO DI CONSEGNA crescente dentro il giorno: la lista si
   * legge dall'alto nell'ordine in cui le cose vanno fatte.
   *
   * Due dettagli che altrimenti mordono:
   *  - le 1.787 consegne SENZA orario vanno in fondo (`nulls: 'last'`), non in
   *    cima: un orario che manca non e' mezzanotte;
   *  - c'e' sempre un ultimo criterio (`code`), perche' con `skip`/`take` due
   *    righe a pari merito possono altrimenti scambiarsi di posto fra una
   *    pagina e l'altra, e una riga comparire due volte o sparire.
   */
  private ordinamento(query: DeliveryListQueryDto) {
    const scelto = buildOrderBy(query, DeliveriesService.SORT_FIELDS, []);
    const base = Array.isArray(scelto) ? scelto : [scelto];
    if (!base.length) {
      return [
        // La data resta DECRESCENTE: con la data crescente in cima finivano le
        // consegne con anno 0202 e 0206 (date impossibili, gia' segnalate dalla
        // lista). L'orario sale DENTRO il giorno, che e' quello che serve.
        { date: 'desc' as const },
        { deliveryTimeFrom: { sort: 'asc' as const, nulls: 'last' as const } },
        { code: 'asc' as const },
      ] as any;
    }
    return [...base, { code: 'asc' as const }] as any;
  }

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
    // Vista Attive / Storico. Uno stato esplicito VINCE sulla vista: se si
    // chiede "consegnate" si vogliono quelle, in qualunque tab ci si trovi.
    else if (query.view === 'storico') scope.status = { in: DELIVERY_CLOSED_STATUSES };
    else if (query.view === 'attive') scope.status = { notIn: DELIVERY_CLOSED_STATUSES };
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
        select: DELIVERY_LIST_SELECT,
        orderBy: this.ordinamento(query),
        skip,
        take,
      }),
      this.prisma.delivery.count({ where }),
    ]);
    // Le note interne non si nascondono piu' dopo averle lette: l'elenco non
    // le seleziona affatto. E' la stessa protezione, un passo prima — un campo
    // che non esce dal database non puo' finire in un carico per sbaglio.
    return { items: rows, total, page, pageSize };
  }

  /**
   * Calendario: conteggio consegne per giorno (e per stato) in un intervallo,
   * filtrato per ruolo (il partner vede solo le proprie). Serve alla vista
   * mensile: ogni giorno con ordini viene marcato.
   */
  async calendar(user: JwtUser, from?: string, to?: string, partnerId?: string, valetId?: string) {
    const scope: any = { ...this.roleFilter(user) };
    // Admin/Operation possono filtrare per partner o valet (partner/valet restano ai propri).
    if (partnerId && user.role !== Role.PARTNER) scope.partnerId = partnerId;
    if (valetId && user.role !== Role.VALET) scope.valetId = valetId;
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
    // Vista Attive / Storico. Uno stato esplicito VINCE sulla vista: se si
    // chiede "consegnate" si vogliono quelle, in qualunque tab ci si trovi.
    else if (query.view === 'storico') scope.status = { in: DELIVERY_CLOSED_STATUSES };
    else if (query.view === 'attive') scope.status = { notIn: DELIVERY_CLOSED_STATUSES };
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
      include: { ...DELIVERY_INCLUDE, activities: true, logs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!delivery) throw new NotFoundException('Consegna non trovata');

    // Lo storico porta solo lo userId, e per le 17.680 righe importate il
    // messaggio è un rimando («legacy#15957») che non dice niente: il legacy
    // registrava CHI ha toccato la consegna e QUANDO, non che cosa ha fatto.
    // Il nome dell'utente è l'unica informazione vera che abbiamo: si allega.
    const idUtenti = [...new Set(delivery.logs.map((l) => l.userId).filter(Boolean))] as string[];
    const utenti = idUtenti.length
      ? new Map((await this.prisma.user.findMany({
          where: { id: { in: idUtenti } },
          select: { id: true, firstName: true, lastName: true },
        })).map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
      : new Map<string, string>();
    const logs = delivery.logs.map((l) => ({
      ...l,
      userName: l.userId ? utenti.get(l.userId) ?? null : null,
    }));

    return this.hideInternalNotes({ ...delivery, logs }, user);
  }


  /**
   * La fotografia dei prodotti al momento in cui entrano in una consegna.
   *
   * ⚠️ La riga di consegna non è un puntatore al catalogo: è la stampa di uno
   * stato di fatto. Va scritta ADESSO, perché il catalogo cambia — un prodotto
   * rinominato l'anno prossimo riscriverebbe che cosa è stato portato oggi, e
   * un prodotto cancellato lascerebbe una riga senza nome.
   */
  private async fotografaProdotti(
    righe: { productId: string; quantity?: number; price?: number; flexiblePrice?: boolean; fieldValues?: string; productVariantId?: string }[],
  ) {
    const prodotti = new Map(
      (await this.prisma.product.findMany({
        where: { id: { in: righe.map((r) => r.productId) } },
        select: { id: true, name: true, sku: true },
      })).map((x) => [x.id, x]),
    );
    const idVarianti = righe.map((r) => r.productVariantId).filter(Boolean) as string[];
    const varianti = idVarianti.length
      ? new Map((await this.prisma.productVariant.findMany({
          where: { id: { in: idVarianti } }, select: { id: true, name: true },
        })).map((x) => [x.id, x.name]))
      : new Map<string, string>();
    return righe.map((r) => ({
      productId: r.productId,
      productName: prodotti.get(r.productId)?.name ?? null,
      productSku: prodotti.get(r.productId)?.sku ?? null,
      variantName: r.productVariantId ? varianti.get(r.productVariantId) ?? null : null,
      productVariantId: r.productVariantId,
      quantity: r.quantity ?? 1,
      price: r.price,
      flexiblePrice: r.flexiblePrice ?? false,
      fieldValues: r.fieldValues,
    }));
  }

  /**
   * Se il partner e' fra quelli che ritirano SEMPRE in citta'
   * (PARTNER_RITIRO_IN_CITTA), riscrive il ritiro con la citta' del
   * destinatario e butta via la distanza ereditata. Torna null quando non c'e'
   * niente da forzare: il chiamante non tocca nulla.
   */
  private async ritiroInCittaDiConsegna(
    partnerId: string,
    recipientAddress: string | null | undefined,
    distanceKm?: number | null,
  ): Promise<{ pickupAddress: string; distanceKm: null; kmScartati: number | null } | null> {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { insegna: true },
    });
    const insegna = (partner?.insegna ?? '').trim().toLowerCase();
    if (insegna !== PARTNER_RITIRO_IN_CITTA) return null;
    const citta = cittaDaIndirizzo(recipientAddress);
    if (!citta) return null;
    // La distanza si butta SEMPRE quando era misurata da un'altra origine, ma
    // si DICHIARA quando era anche esagerata: un valore sopra la soglia e' la
    // firma dell'errore, e chi rilegge la consegna deve poterla riconoscere.
    const kmScartati = distanceKm != null && distanceKm > KM_MASSIMI_IN_CITTA ? distanceKm : null;
    return { pickupAddress: citta, distanceKm: null, kmScartati };
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

    // ⚠️ Prima del prezzo: il calcolo qui sotto usa la distanza, e per un
    // partner "locale" quella ereditata e' misurata dall'origine sbagliata.
    const inCitta = await this.ritiroInCittaDiConsegna(
      partnerId,
      dto.recipientAddress,
      dto.distanceKm,
    );
    if (inCitta) {
      dto.pickupAddress = inCitta.pickupAddress;
      dto.distanceKm = undefined;
    }

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
              create: await this.fotografaProdotti(products as any),
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
          // Il ritiro forzato non e' un dettaglio tecnico: cambia la paga del
          // valet. Se resta solo nel codice, fra un mese nessuno sa perche'
          // quella consegna dice «Firenze» invece di «Milano».
          create: [
            {
              type: 'created',
              message: 'Consegna inserita',
              userId: user.sub,
            },
            ...(inCitta
              ? [
                  {
                    type: 'ritiro-forzato',
                    message:
                      `Ritiro impostato sulla città di consegna (${inCitta.pickupAddress}): il fornitore è locale.` +
                      (inCitta.kmScartati != null
                        ? ` Scartata la distanza di ${inCitta.kmScartati} km, misurata da un'altra origine (soglia ${KM_MASSIMI_IN_CITTA} km).`
                        : ''),
                    userId: user.sub,
                  },
                ]
              : []),
          ],
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
    // Stessa regola della creazione: per un partner "locale" il ritiro segue il
    // destinatario, anche quando la modifica arriva a mano dal pannello.
    const partnerDaUsare = partnerId ?? delivery.partnerId;
    const inCitta =
      partnerDaUsare && (dto.recipientAddress || dto.pickupAddress != null)
        ? await this.ritiroInCittaDiConsegna(
            partnerDaUsare,
            dto.recipientAddress ?? delivery.recipientAddress,
            dto.distanceKm ?? delivery.distanceKm,
          )
        : null;
    // ⚠️ `distanceKm: null` esplicito, non `undefined`: in Prisma undefined vuol
    // dire «non toccare», e la distanza vecchia — misurata dall'origine
    // sbagliata — sopravviverebbe alla correzione del ritiro.
    const forzatura = inCitta
      ? { pickupAddress: inCitta.pickupAddress, distanceKm: null, extraKm: 0 }
      : {};
    // Se l'indirizzo destinatario cambia, rigeocodifica le coordinate della mappa.
    const reGeocode =
      dto.recipientAddress && dto.recipientAddress !== delivery.recipientAddress
        ? await this.settings.geocodeCoords(dto.recipientAddress)
        : undefined;
    return this.prisma.delivery.update({
      where: { id },
      data: {
        ...scalar,
        ...forzatura,
        ...(date ? { date: new Date(date) } : {}),
        ...(reGeocode !== undefined
          ? { latitude: reGeocode?.lat ?? null, longitude: reGeocode?.lng ?? null }
          : {}),
        // Righe prodotto: sostituite in blocco (come nei form di modifica)
        ...(products
          ? {
              products: {
                deleteMany: {},
                create: await this.fotografaProdotti(products as any),
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

    const updated = await this.prisma.delivery.update({
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

    await this.notifyStatusChange(updated, status, user);
    return updated;
  }

  /**
   * Avvisa Admin e Operation sui tre momenti del processo di consegna
   * (§5 di COME-FUNZIONA-APP-DELUXY.md: ritiro / consegnato / non consegnato).
   * Chi ha fatto l'azione non riceve la notifica del proprio gesto.
   */
  private async notifyStatusChange(
    delivery: { id: string; code: number; partner: { insegna: string } | null },
    status: DeliveryStatus,
    user: JwtUser,
  ): Promise<void> {
    const byStatus: Partial<Record<DeliveryStatus, { type: NotificationType; title: string }>> = {
      [DeliveryStatus.IN_DELIVERY]: {
        type: NotificationType.DELIVERY_IN_DELIVERY,
        title: 'Consegna ritirata',
      },
      [DeliveryStatus.DELIVERED]: {
        type: NotificationType.DELIVERY_DELIVERED,
        title: 'Consegna completata',
      },
      [DeliveryStatus.NOT_DELIVERED]: {
        type: NotificationType.DELIVERY_NOT_DELIVERED,
        title: 'Consegna NON riuscita',
      },
    };
    const event = byStatus[status];
    if (!event) return;

    const riferimento = `#${delivery.code}`;
    const partner = delivery.partner?.insegna ? ` — ${delivery.partner.insegna}` : '';
    const recipients = await this.notifications.adminAndOperationIds(user.sub);
    await this.notifications.notifyUsers(recipients, {
      type: event.type,
      title: event.title,
      body: `Consegna ${riferimento}${partner}`,
      entityType: 'delivery',
      entityId: delivery.id,
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

  /**
   * Conferma di consegna dal link pubblico "consegnata" (senza login): imposta
   * lo stato a "delivered" e registra chi ha ritirato. Idempotente.
   */
  async confirmDeliveredByToken(token: string, receivedBy?: string) {
    const delivery = await this.prisma.delivery.findFirst({ where: { trackingToken: token } });
    if (!delivery) throw new NotFoundException('Consegna non trovata');
    if (delivery.status === 'delivered' || delivery.status === 'delivered_time_approved') {
      return { esito: 'gia_consegnata', code: delivery.code };
    }
    await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: 'delivered',
        receivedBy: receivedBy?.trim() || null,
        logs: {
          create: {
            type: 'delivered',
            message: receivedBy?.trim()
              ? `Consegna confermata — ricevuta da ${receivedBy.trim()}`
              : 'Consegna confermata',
          },
        },
      },
    });
    return { esito: 'confermata', code: delivery.code };
  }

  async assignValet(id: string, valetId: string, user: JwtUser) {
    const delivery = await this.findOne(id, user);
    const valet = await this.prisma.valet.findUnique({ where: { id: valetId } });
    if (!valet) throw new BadRequestException('Valet inesistente');

    // Paga del valet dal listino, preso ALLA DATA della consegna.
    //
    // ⚠️ Dal 25/08/2026 un valet puo' avere piu' righe per lo stesso servizio,
    // una per periodo: la tariffa cambia nel tempo (SERGIO DE ROSA e' passato da
    // 7,20 a 8,00 €) e prendere sempre quella di oggi vorrebbe dire pagare una
    // consegna vecchia con un listino che allora non esisteva. Per questo non
    // c'e' piu' un `findUnique` su (valet, servizio): quella chiave non e' piu'
    // unica, ed e' giusto cosi'.
    const tariffe = await this.prisma.valetService.findMany({
      where: { valetId, serviceTypeId: delivery.serviceTypeId },
    });
    const valetService = tariffaAllaData(tariffe, delivery.date ?? new Date());
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
