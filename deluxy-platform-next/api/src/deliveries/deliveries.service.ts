import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { JwtUser } from '../common/decorators';
import { perimetroProdottiPartner } from '../common/perimetro-prodotti';
import { regoleApplicabili, RegolaCarnet, ConsegnaPerRegola } from '../common/regola-carnet';
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
import { ambitoTeamLeader, filtroDaAmbito } from '../common/team-leader';
import { DeliveryListQueryDto } from './dto/delivery-list-query.dto';
import { conIva, soloIva } from '../common/iva';
import { valoreProdotti } from '../common/valore-prodotti';
import { PrismaService } from '../prisma/prisma.service';
// La formula della paga valet vive in salaries: importarla evita la trappola
// della regola ricopiata in due posti (il preventivo deve dire la STESSA paga).
import { pagaConsegna } from '../salaries/salaries.module';
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
  pickupTimeFrom: true, pickupTimeTo: true, pickupFlexible: true, pickupAddress: true,
  recipientFirstName: true, recipientLastName: true, recipientAddress: true,
  paymentOnDelivery: true, paymentAmount: true, price: true,
  partner: { select: { id: true, insegna: true } },
  valet: { select: { id: true, firstName: true, lastName: true } },
  serviceType: { select: { id: true, name: true, pricingModel: true, scope: true } },
  // ⚠️ La PROVINCIA SALVATA (geocodificata dal server): l'assegnazione la usa
  // per filtrare i valet. Ri-dedurla dalla stringa dell'indirizzo lato client
  // sbaglia — «Piazza Duca d'Aosta» a Milano veniva letta come provincia AOSTA
  // e non compariva nessun valet.
  province: { select: { id: true, code: true, name: true } },
  // Regola carnet applicata: serve alla lista per segnalare le consegne che
  // seguono una regola (prezzo azzerato / rettificato dal carnet).
  deliveryRuleId: true,
  deliveryRule: { select: { name: true } },
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
  // Provincia salvata: l'assegnazione la usa senza ri-dedurla dalla stringa.
  province: { select: { id: true, code: true, name: true } },
  customer: { select: { id: true, firstName: true, lastName: true } },
  // ⚠️ Serve anche la VARIANTE: la riga di consegna può puntare a una taglia
  // (es. Cappelliera M: partner 215, pubblico 300) e mostrarle il prezzo del
  // prodotto base (110) fa sembrare sbagliato un numero giusto.
  products: {
    include: {
      // imageUrl: al click sul nome la scheda mostra la FOTO (28/08, parita'
      // con l'app attuale chiesta dall'utente).
      product: { select: { id: true, name: true, price: true, publicPrice: true, imageUrl: true } },
      productVariant: { select: { id: true, name: true, price: true, publicPrice: true } },
    },
  },
  pickups: true,
} as const;

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Le consegne VIVE: quelle non cancellate logicamente.
   *
   * ⚠️ Va messa negli ELENCHI (lista, calendario, mappa), non dentro
   * `roleFilter`: quella la usa anche `findOne`, e infilandola lì la scheda di
   * una consegna cancellata darebbe 404 — nessun admin potrebbe più aprirla per
   * capire che cos'era o ripararla.
   *
   * Perché serve: 431 consegne importate dal legacy hanno `deletedAt`
   * valorizzato e sono TUTTE in stato `created`, che non è fra gli stati
   * chiusi. Finivano quindi nella vista «Attive» — il contatore delle cose da
   * fare diceva 2.122 invece di 1.691, gonfio del 20% — e nel conteggio del
   * calendario. Nel resto dell'API il filtro c'è dappertutto (Finanza,
   * Fatturazione, Stipendi, orders-sync, tracking pubblico): erano questi tre
   * elenchi gli unici a dimenticarselo, e lo `@@index([deletedAt, date])` dello
   * schema — creato apposta per «la lettura di sempre: le consegne vive» —
   * restava ornamentale, perché nessuna query lo usava davvero.
   *
   * ⚠️ NON si è messo un filtro globale sul client Prisma: `finance.module.ts`
   * interroga anche in SQL raw, che un'estensione non tocca — sarebbe stata la
   * garanzia falsa di «un posto solo».
   */
  private static readonly VIVE = { deletedAt: null } as const;

  /**
   * Filtro di visibilità in base al ruolo, TEAM LEADER compreso.
   *
   * ⚠️ È `async` perché per un team leader bisogna leggere la sua squadra dal
   * database. Prima era sincrono e il team leader vedeva solo le proprie
   * consegne: la sua configurazione (province di responsabilità, partner,
   * partner esclusi) era scritta e non la leggeva nessuno.
   */
  private async filtroRuolo(user: JwtUser): Promise<Record<string, unknown>> {
    if (user.role !== Role.VALET) return this.roleFilter(user);
    const valet = await this.prisma.valet.findUnique({
      where: { id: user.valetId ?? '-' },
      select: {
        id: true, isTeamLeader: true,
        teamLeaderProvinces: true, teamLeaderPartners: true, teamLeaderExcludedPartners: true,
        provinces: { select: { provinceId: true } },
      },
    });
    const ambito = await ambitoTeamLeader(valet, (provinceIds) =>
      this.prisma.valet.findMany({
        where: { provinces: { some: { provinceId: { in: provinceIds } } } },
        select: { id: true },
      }),
    );
    if (!ambito) return { valetId: user.valetId ?? '-' };
    // La regola sta in `filtroDaAmbito`, condivisa con le attività: qui si usa,
    // non si riscrive.
    return filtroDaAmbito(ambito);
  }

  /**
   * Filtro di visibilità in base al ruolo.
   *
   * ⚠️ 27/08/2026 — SI ELENCA CHI PUÒ VEDERE TUTTO, non chi non può.
   *
   * Prima finiva con `return {}`, cioè «nessun filtro», per ogni ruolo non
   * nominato. L'enum ne ha sei e qui se ne nominavano tre: **CUSTOMER cadeva
   * nel ramo aperto** — tutte le consegne di tutti, con indirizzi, telefoni e
   * note. In archivio ci sono **4.512 utenti CUSTOMER**, e almeno uno è attivo
   * con una password: misurato, `GET /deliveries` gli rispondeva 200 con le
   * consegne di partner diversi. È la trappola della regola scritta su N
   * valori: un elenco di eccezioni non risponde «e se non è nessuno di
   * questi?».
   *
   * Adesso l'elenco è quello di chi vede tutto. Un ruolo nuovo, o uno
   * dimenticato, finisce nel ramo che NEGA — e lo dice.
   */
  private roleFilter(user: JwtUser) {
    if (user.role === Role.ADMIN || user.role === Role.OPERATION) return {};
    if (user.role === Role.PARTNER) return { partnerId: user.partnerId ?? '-' };
    if (user.role === Role.VALET) return { valetId: user.valetId ?? '-' };
    if (user.role === Role.PROJECT_MANAGER) {
      // Il PM non gestisce consegne: nessun accesso
      throw new ForbiddenException('Il project manager non accede alle consegne');
    }
    throw new ForbiddenException('Questo ruolo non ha accesso alle consegne');
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
    // Le altre grafie del numero d'ordine: sono TESTO, quindi il `contains` va.
    // Il numero della consegna (`code`) e' un Int e ha un ramo suo, sotto.
    'realOrderNumber',
    'legacySaleId',
    'identifier',
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
    const scope: any = { ...DeliveriesService.VIVE, ...(await this.filtroRuolo(user)) };
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
    // ⭐⭐ IL NUMERO DELLA CONSEGNA (26/08/2026). Fino a ieri cercare «62637»
    // — il numero che l'app stampa dappertutto e manda perfino nelle notifiche
    // — rispondeva 200 con ZERO righe: `code` e' un `Int` e `textSearch` sa
    // fare solo `contains`, quindi non poteva starci. Un vuoto che sembra una
    // risposta: chi cerca conclude che la consegna non esiste.
    //
    // ⚠️ Il ramo numerico deve stare FUORI da `textSearch`: `contains` +
    // `mode: 'insensitive'` su un Int alza `PrismaClientValidationError` a
    // runtime, e il TypeScript NON lo ferma perche' `scope` e' `any` (quindi
    // typecheck e build passerebbero, e la lista morirebbe in produzione al
    // primo carattere). Provato davvero, non dedotto.
    //
    // ⚠️ Solo cifre pure e al massimo nove: `code` e' un Int32 e un id ordine
    // Shopify (12-13 cifre) lo sfonderebbe. Quelli restano coperti dai campi di
    // TESTO qui sopra (`realOrderNumber`, `legacySaleId`), col loro `contains`.
    //
    // Il `push` resta DENTRO l'OR della ricerca, che e' sempre in AND con lo
    // scope di ruolo: un partner che digita il numero di una consegna altrui
    // continua a non vedere niente.
    const termine = (query.q ?? '').trim();
    if (search && /^\d{1,9}$/.test(termine)) {
      const n = Number(termine);
      (search['OR'] as unknown[]).push({ code: n }, { legacyOrderId: n });
    }
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
    // ⚠️ Anche la LISTA: nascondere i numeri solo nel dettaglio lascerebbe la
    // stessa fuga da un'altra rotta. Si toglie dove i dati escono, non dove si
    // mostrano.
    return { items: rows.map((r) => this.soloIMieiSoldi(r as any, user)), total, page, pageSize };
  }

  /**
   * Calendario: conteggio consegne per giorno (e per stato) in un intervallo,
   * filtrato per ruolo (il partner vede solo le proprie). Serve alla vista
   * mensile: ogni giorno con ordini viene marcato.
   */
  async calendar(user: JwtUser, from?: string, to?: string, partnerId?: string, valetId?: string) {
    const scope: any = { ...DeliveriesService.VIVE, ...(await this.filtroRuolo(user)) };
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
    const scope: any = { ...DeliveriesService.VIVE, ...(await this.filtroRuolo(user)) };
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
      where: { id, ...(await this.filtroRuolo(user)) },
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

    // CHE COSA è successo, però, si può spesso RICONOSCERE: la consegna porta
    // i timestamp dei suoi eventi (partita, consegnata, letta…) e la riga di
    // storico che cade sullo stesso istante È quell'evento. Misurato sui dati
    // veri: 6.509 righe su 17.680 combaciano con UN evento entro 10 s, 2.494
    // con più d'uno (quasi sempre readAt che duplica readAtByPartner: decide
    // la distanza, poi la specificità), 8.677 con nessuno — quelle restano
    // «aggiornata», perché un'etichetta dedotta male è peggio di una generica.
    const EVENTI: [string, Date | null | undefined, number][] = [
      ['consegnata', delivery.deliveredAt, 0],
      ['partita', delivery.startedAt, 1],
      ['letta-partner', delivery.readAtByPartner, 2],
      ['letta-valet', delivery.readAtByValet, 3],
      ['letta', delivery.readAt, 4],
      ['creata', delivery.createdAt, 5],
    ];
    const TOLLERANZA_MS = 10_000;
    const eventoDelLog = (quando: Date): string | null => {
      const vicini = EVENTI
        .filter(([, t]) => t != null)
        .map(([nome, t, rango]) => ({ nome, rango, distanza: Math.abs(t!.getTime() - quando.getTime()) }))
        .filter((e) => e.distanza <= TOLLERANZA_MS)
        .sort((a, b) => a.distanza - b.distanza || a.rango - b.rango);
      return vicini[0]?.nome ?? null;
    };

    // ⚠️ Il REGISTRO è dell'ufficio (31/08/2026): i messaggi raccontano paghe
    // e prezzi («paga 15,1 -> 0» nei riallineamenti). La pagina lo mostrava
    // solo ad admin/operation, ma l'API lo mandava a TUTTI — e su ogni
    // consegna, storico compreso, bastavano gli strumenti del browser.
    const logs = ['ADMIN', 'OPERATION'].includes(user.role)
      ? delivery.logs.map((l) => ({
          ...l,
          userName: l.userId ? utenti.get(l.userId) ?? null : null,
          evento: l.type === 'legacy_update' ? eventoDelLog(l.createdAt) : null,
        }))
      : [];

    // COSTO VALET DAL LISTINO (31/08, utente): se la consegna non ha una paga
    // congelata (valetSalary) ma ha un valet, admin/operation vedono comunque
    // il costo, calcolato dal listino del valet PER TIPO DI PREZZO — la stessa
    // regola di Stipendi (il servizio esatto può non essere a listino: si
    // sceglie fisso/ora). Così il dettaglio non mostra più «—» a vuoto.
    let valetSalaryDalListino: number | null = null;
    // ⚠️ Anche con `valetSalary = 0` (01/09, caso #62899/DDT 12787): per gli
    // Stipendi una paga scritta vince solo se > 0 — lo zero NON è la paga, è
    // «calcola dal listino». Mostrarlo come paga diceva il falso.
    if (['ADMIN', 'OPERATION'].includes(user.role) && delivery.valetId && !((delivery.valetSalary ?? 0) > 0)) {
      const listini = await this.prisma.valetService.findMany({
        where: { valetId: delivery.valetId },
        include: { serviceType: { select: { pricingModel: true, minHours: true } } },
      });
      const tipo = delivery.serviceType?.pricingModel === 'A_ORA' ? 'A_ORA' : 'PREZZO_FISSO';
      const l = listini.find((x) => x.serviceType?.pricingModel === tipo && (x.salary ?? 0) > 0)
        ?? listini.find((x) => x.serviceType?.pricingModel === tipo);
      if (l) {
        const ore = tipo === 'A_ORA'
          ? Math.max((delivery as any).hours ?? 1, l.serviceType?.minHours ?? 1) : 1;
        valetSalaryDalListino = Math.round((l.salary ?? 0) * ore * 100) / 100;
      }
    }

    return this.soloIMieiSoldi(
      this.hideInternalNotes({ ...delivery, logs, valetSalaryDalListino, economiaVendita: this.economiaVendita(delivery) }, user),
      user,
    );
  }

  /**
   * IL CONTO DI UNA VENDITA VISTO DAL PARTNER (28/08/2026, deciso dall'utente:
   * «per i servizi vendita il partner deve vedere il proprio incasso, nostra
   * commissione e totale a lui dovuto»).
   *
   * ⚠️ Su una vendita `price` NON è quello che prende il partner: è la QUOTA
   * CHE TRATTENIAMO NOI. Il partner incassa il valore della merce, noi gli
   * fatturiamo la commissione più IVA, e quello che gli resta è la differenza.
   *
   * ⚠️ Il conto lo fa il SERVER, non la pagina: l'aliquota vive in
   * `common/iva.ts` e la legge anche la fatturazione. Calcolarla nel frontend
   * vorrebbe dire scrivere il 22% in un secondo posto, e il giorno che cambia
   * due schermate direbbero due numeri diversi.
   *
   * ⚠️ `dovutoLordo` è lo stesso numero che la Fatturazione chiama
   * `dovutoAlPartner` (valore − quota): si tiene, ma NON è quello che il
   * partner incassa davvero — sopra c'è ancora l'IVA della nostra commissione.
   * Mostrarli senza distinguerli è il modo per far litigare due schermate.
   */
  private economiaVendita(d: {
    price?: number | null;
    products?: unknown;
    serviceType?: { pricingModel?: string | null } | null;
  }): {
    incasso: number;
    commissione: number;
    ivaCommissione: number;
    commissioneConIva: number;
    dovutoLordo: number;
    dovutoNetto: number;
  } | null {
    if (d.serviceType?.pricingModel !== 'VENDITA') return null;
    // ⚠️ NON `productValue`: quel campo diverge dalla somma delle righe su
    // 1.417 vendite su 13.507 (90.265 € di scarto, misurato il 28/08/2026), e
    // la FATTURA si fa sulle righe. Usando il campo, la scheda avrebbe detto
    // al partner un incasso che la sua fattura smentisce.
    const valore = valoreProdotti(d.products as any, (d as any).productValue);
    const quota = d.price;
    // Senza il valore o senza la quota il conto non si fa: un ripiego a zero
    // direbbe al partner che non prende niente, ed è peggio di non dire niente.
    if (!valore || quota == null) return null;
    const q2 = (n: number) => Math.round(n * 100) / 100;
    return {
      incasso: q2(valore),
      commissione: q2(quota),
      ivaCommissione: soloIva(quota),
      commissioneConIva: conIva(quota),
      dovutoLordo: q2(valore - quota),
      dovutoNetto: q2(valore - conIva(quota)),
    };
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
    user?: JwtUser,
  ) {
    // ⚠️ Il perimetro vale anche in SCRITTURA (regola dell'utente 31/08):
    // il filtro nella sola lettura si aggira passando l'id a mano — un
    // partner metteva in consegna il prodotto di un altro. Stessa regola
    // della lista prodotti (common/perimetro-prodotti.ts).
    if (user?.role === Role.PARTNER) {
      const ammessi = await this.prisma.product.count({
        where: { id: { in: righe.map((r) => r.productId) }, ...perimetroProdottiPartner(user) },
      });
      const idUnici = new Set(righe.map((r) => r.productId)).size;
      if (ammessi < idUnici) {
        throw new BadRequestException('Uno dei prodotti non è nel tuo catalogo.');
      }
    }
    const prodotti = new Map(
      (await this.prisma.product.findMany({
        where: { id: { in: righe.map((r) => r.productId) } },
        select: { id: true, name: true, sku: true, price: true },
      })).map((x) => [x.id, x]),
    );
    const idVarianti = righe.map((r) => r.productVariantId).filter(Boolean) as string[];
    const varianti = idVarianti.length
      ? new Map((await this.prisma.productVariant.findMany({
          where: { id: { in: idVarianti } }, select: { id: true, name: true, price: true },
        })).map((x) => [x.id, x]))
      : new Map<string, { id: string; name: string; price: number | null }>();
    return righe.map((r) => ({
      productId: r.productId,
      productName: prodotti.get(r.productId)?.name ?? null,
      productSku: prodotti.get(r.productId)?.sku ?? null,
      variantName: r.productVariantId ? varianti.get(r.productVariantId)?.name ?? null : null,
      productVariantId: r.productVariantId,
      quantity: r.quantity ?? 1,
      // ⚠️ Senza prezzo scritto vale il CATALOGO — la variante se c'è (la
      // taglia M costa quanto la M, non quanto il prodotto base), altrimenti
      // il prodotto. Serve da quando al PARTNER il prezzo di riga viene tolto:
      // lasciarlo a `null` avrebbe messo a ZERO il venduto in fattura, cioè
      // avrebbe risolto una fuga creando un buco nei conti.
      price: r.price ?? varianti.get(r.productVariantId ?? '')?.price
        ?? prodotti.get(r.productId)?.price ?? null,
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

  /**
   * PREVENTIVO DEL LISTINO in fase di costruzione (regola utente 31/08–01/09:
   * «in fase di costruzione anche il listino deve variare»): distanza stradale
   * ritiro→consegna, dentro/fuori comune, prezzo partner ed eventuale paga
   * valet — PRIMA di salvare. Non scrive niente: è l'anteprima del form.
   */
  async preventivo(
    dto: {
      partnerId?: string; serviceTypeId?: string; valetId?: string;
      pickupAddress?: string; recipientAddress?: string; hours?: number;
    },
    user: JwtUser,
  ): Promise<{
    distanceKm: number | null; extraOutOfCity: boolean;
    extraKm: number; extraEur: number; price: number | null; valetSalary: number | null;
  }> {
    const ritiro = (dto.pickupAddress ?? '').trim();
    const consegna = (dto.recipientAddress ?? '').trim();
    const distanceKm =
      ritiro && consegna ? await this.settings.distanzaStradaleKm(ritiro, consegna) : null;
    const cR = cittaDaIndirizzo(ritiro);
    const cC = cittaDaIndirizzo(consegna);
    const extraOutOfCity = Boolean(cR && cC && cR !== cC);

    let price: number | null = null;
    let extraKm = 0;
    let extraEur = 0;
    if (dto.partnerId && dto.serviceTypeId) {
      const svc = await this.prisma.serviceType.findUnique({
        where: { id: dto.serviceTypeId },
        select: { pricingModel: true, basePrice: true },
      });
      const ps = await this.prisma.partnerService.findUnique({
        where: { partnerId_serviceTypeId: { partnerId: dto.partnerId, serviceTypeId: dto.serviceTypeId } },
      });
      // ⚠️ Il preventivo in EURO esiste solo per PREZZO_FISSO e A_ORA — come in
      // fatturazione. Su VENDITA `listino.price` è una PERCENTUALE (mostrarla
      // come euro diceva «listino 18,00 €» su Chanel Sant'Andrea: era la fee),
      // su CORPORATE conta il valore dei prodotti, su MAGAZZINO i pezzi.
      const modelloConKm = svc?.pricingModel === 'PREZZO_FISSO' || svc?.pricingModel === 'A_ORA';
      if ((svc || ps) && modelloConKm) {
        let base = ps?.price ?? svc?.basePrice ?? 0;
        if (svc?.pricingModel === 'A_ORA') base = base * Math.max(dto.hours ?? 1, 1);
        // Tariffe km: listino-servizio prima, SCHEDA partner come ripiego
        // (kmIncluded + extraOutOfCityPrice) — regola utente 01/09.
        const tariffeP = await this.prisma.partner.findUnique({
          where: { id: dto.partnerId },
          select: { kmIncluded: true, extraOutOfCityPrice: true },
        });
        if (distanceKm != null) {
          if (extraOutOfCity) {
            const tariffa = (ps?.extraOutOfCityPrice ?? 0) > 0
              ? ps!.extraOutOfCityPrice
              : (tariffeP?.extraOutOfCityPrice ?? 0);
            extraKm = distanceKm;
            extraEur = distanceKm * tariffa;
          } else {
            const inclusi = (ps?.includedKm ?? 0) > 0 ? ps!.includedKm : (tariffeP?.kmIncluded ?? 0);
            if (distanceKm > inclusi) {
              extraKm = Math.round((distanceKm - inclusi) * 10) / 10;
              extraEur = extraKm * (ps?.extraKmPrice ?? 0);
            }
          }
        }
        extraEur = Math.round(extraEur * 100) / 100;
        price = Math.round((base + extraEur) * 100) / 100;
      }
    }

    // La paga del valet NON è per gli occhi del partner (stessa regola di
    // soloIMieiSoldi: una difesa messa solo sulle letture non è una difesa).
    let valetSalary: number | null = null;
    if (user.role !== Role.PARTNER && dto.valetId && dto.serviceTypeId) {
      const valet = await this.prisma.valet.findUnique({
        where: { id: dto.valetId },
        select: { minimumKmIncluded: true, extraOutOfCityPrice: true },
      });
      const vs = await this.prisma.valetService.findFirst({
        where: { valetId: dto.valetId, serviceTypeId: dto.serviceTypeId },
        orderBy: [{ validFrom: 'desc' }],
        include: { serviceType: { select: { pricingModel: true, minHours: true } } },
      });
      if (vs) {
        const calcolo = pagaConsegna(
          { hours: dto.hours ?? null, distanceKm, extraOutOfCity, valet, serviceType: vs.serviceType } as any,
          vs as any,
        );
        valetSalary = calcolo?.amount ?? null;
      }
    }

    return { distanceKm, extraOutOfCity, extraKm, extraEur, price, valetSalary };
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

    // Il partner inserisce SOLO i servizi che ha abilitati (regola 31/08/2026).
    // Il menu del form e' gia' filtrato dal server, ma il filtro nella sola
    // lettura si aggira passando l'id — la scrittura deve rifiutare da sola.
    if (user.role === Role.PARTNER && !partnerService) {
      throw new BadRequestException(
        'Servizio non abilitato per il tuo listino: chiedi a Deluxy di attivarlo.',
      );
    }

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
    // ⭐ RITIRO DI DEFAULT = INDIRIZZO DEL PARTNER (regola utente 31/08/2026).
    // Ogni consegna deve nascere con un ritiro: fin qui lo scriveva solo il
    // form manuale (`applicaRitiroPartner`), e le vie automatiche — vendita,
    // Customer Service (/app/consegne), Scout — lo lasciavano vuoto («quelle
    // di oggi» senza indirizzo di ritiro). Un ritiro esplicito o la forzatura
    // «in città» vincono; solo il vuoto si riempie con la sede del partner.
    if (!dto.pickupAddress?.trim()) {
      const p = await this.prisma.partner.findUnique({
        where: { id: partnerId },
        select: { address: true },
      });
      if (p?.address?.trim()) dto.pickupAddress = p.address;
    }

    const hours = dto.hours ?? 1;
    let price = partnerService?.price ?? serviceType.basePrice ?? 0;
    if (serviceType.pricingModel === 'A_ORA') price = price * Math.max(hours, 1);

    // ⭐ DISTANZA STRADALE + EXTRA KM (regola utente 31/08, costruita 01/09).
    // Se chi chiama non dichiara i km, si misura la strada VERA dal ritiro alla
    // consegna (Google Directions). FUORI CITTÀ = comune del ritiro diverso dal
    // comune di consegna: TUTTI i km × extraOutOfCityPrice. IN CITTÀ: solo i km
    // oltre gli inclusi × extraKmPrice. Se la distanza non si misura non si
    // inventa: nessun extra (e la consegna resta prezzabile a listino base).
    let distanceKm = dto.distanceKm ?? null;
    if (distanceKm == null && dto.pickupAddress?.trim() && dto.recipientAddress?.trim()) {
      distanceKm = await this.settings.distanzaStradaleKm(dto.pickupAddress, dto.recipientAddress);
    }
    const cittaRitiro = cittaDaIndirizzo(dto.pickupAddress);
    const cittaConsegna = cittaDaIndirizzo(dto.recipientAddress);
    const extraOutOfCity = Boolean(cittaRitiro && cittaConsegna && cittaRitiro !== cittaConsegna);
    // ⭐ 01/09 (regola utente): le tariffe km vivono anche sulla SCHEDA partner
    // (kmIncluded + extraOutOfCityPrice) — il listino-servizio vince quando le
    // dichiara, la scheda è il ripiego. Prima si leggeva solo il servizio, e un
    // partner con l'extra fuori città sulla scheda usciva a zero.
    const tariffeP = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { kmIncluded: true, extraOutOfCityPrice: true },
    });
    // ⚠️ I km si prezzano SOLO su PREZZO_FISSO e A_ORA — come in fatturazione
    // (prezzoConsegna): VENDITA è una percentuale sul venduto, CORPORATE il
    // valore dei prodotti, MAGAZZINO base + pezzo. Regola utente 01/09:
    // «per i servizi vendita non si prezzano, è corretto».
    const modelloConKm =
      serviceType.pricingModel === 'PREZZO_FISSO' || serviceType.pricingModel === 'A_ORA';
    let extraKm = 0;
    if (distanceKm != null && modelloConKm) {
      if (extraOutOfCity) {
        const tariffa = (partnerService?.extraOutOfCityPrice ?? 0) > 0
          ? partnerService!.extraOutOfCityPrice
          : (tariffeP?.extraOutOfCityPrice ?? 0);
        extraKm = distanceKm;
        price += distanceKm * tariffa;
      } else {
        const inclusi = (partnerService?.includedKm ?? 0) > 0
          ? partnerService!.includedKm
          : (tariffeP?.kmIncluded ?? 0);
        if (distanceKm > inclusi) {
          extraKm = Math.round((distanceKm - inclusi) * 10) / 10;
          price += extraKm * (partnerService?.extraKmPrice ?? 0);
        }
      }
    }
    price = Math.round(price * 100) / 100;

    // ⚠️ 27/08/2026 — QUELLO CHE UN PARTNER NON DECIDE.
    //
    // Il DTO dichiara `price`, `billable`, `payable`, `valetSalary`, `status`,
    // `valetId`… quindi `whitelist: true` NON li scarta: sono campi legittimi
    // del DTO, e finivano in colonna così come arrivavano. Misurato con un
    // token vero di partner il 27/08: una consegna creata con `price: 0`,
    // `billable: false`, `status: 'delivered'` e un valet a scelta — scritta
    // esattamente così. Una consegna a zero e non fatturabile è denaro che non
    // chiederemo mai a nessuno.
    //
    // La difesa sta QUI e non nel form: il form non lo controlla chi chiama.
    //
    // ⚠️ Si RIASSEGNA `dto`, non si crea una variabile accanto. La prima
    // versione di questa toppa faceva `const dtoPulito = …` e lasciava le
    // righe esplicite qui sotto a leggere da `dto`: `price` e `status`
    // passavano lo stesso. Misurato — la toppa va smontata come il difetto.
    // Con la riassegnazione non resta nessuna strada che veda il dto sporco.
    dto = DeliveriesService.senzaCampiDiUfficio(dto, user);
    const { products, pickups, partnerId: _p, ...scalar } = dto;

    const last = await this.prisma.delivery.aggregate({ _max: { code: true } });

    // Coordinate per la mappa E provincia: la geocodifica le torna insieme, e
    // la provincia si buttava via (vedi `luogoDaIndirizzo`).
    const luogo = await this.luogoDaIndirizzo(dto.recipientAddress);

    const delivery = await this.prisma.delivery.create({
      data: {
        ...scalar,
        code: (last._max.code ?? 0) + 1,
        date: new Date(dto.date),
        partnerId,
        latitude: luogo.lat,
        longitude: luogo.lng,
        // ⚠️ Non si sovrascrive una provincia già dichiarata da chi chiama: la
        // geocodifica è un ripiego, non un'autorità.
        // Il DTO non dichiara `provinceId`: la provincia la deduce sempre la
        // geocodifica. Se un domani il DTO la dichiarasse, qui andrà rispettata.
        provinceId: luogo.provinceId,
        // Prezzo: se impostato manualmente (LISTINO) vince, altrimenti calcolo automatico
        price: dto.price != null ? dto.price : price,
        distanceKm,
        extraKm,
        extraOutOfCity,
        // Stato: se impostato manualmente vince, altrimenti in base
        // all'assegnazione. Una consegna «da fornitore» nasce già ASSEGNATA (al
        // partner che la fa), così ha subito i bottoni di lavorazione.
        status:
          dto.status ??
          (dto.valetId || dto.deliveredByPartner
            ? DeliveryStatus.ASSIGNED
            : DeliveryStatus.CREATED),
        products: products?.length
          ? {
              create: await this.fotografaProdotti(products as any, user),
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
    // Notifica al PARTNER dell'inserimento, se ha abilitato la mail (31/08).
    // Best-effort: non blocca la creazione.
    void this.notificaInserimentoAlPartner(delivery);
    // Se nasce GIÀ assegnata a un valet, avvisa anche lui.
    if (delivery.valetId) void this.notificaAssegnazioneAlValet(delivery);
    // Aggancia la regola carnet del partner, se applicabile (31/08): senza,
    // lo sconto/«non fatturare» non arriva alla consegna nuova.
    await this.agganciaRegolaCarnet(delivery.id);
    // ⚠️ 27/08/2026 — Anche QUI. `soloIMieiSoldi` e `hideInternalNotes` erano
    // applicate solo su `findAll` e `findOne`: chiedendo l'annullamento di una
    // consegna, o salvandone una, il partner si riprendeva `valetSalary`,
    // `valetAdditionalPrice` e le note interne dalla risposta della SCRITTURA.
    // Una difesa messa solo sulle letture non è una difesa.
    return this.soloIMieiSoldi(this.hideInternalNotes(delivery, user), user);
  }

  /**
   * Aggancia la REGOLA CARNET a una consegna (31/08/2026): trova la regola
   * applicabile (partner, servizio, periodo, giorno, sovrapposizione oraria) col
   * carnet non esaurito, e scrive `deliveryRuleId`. Senza questo la
   * fatturazione non applicava lo sconto/«non fatturare» alle consegne nuove.
   * Best-effort: se qualcosa va storto, la consegna resta senza regola (come
   * prima), non fallisce.
   */
  async agganciaRegolaCarnet(deliveryId: string): Promise<string | null> {
    try {
      const d = await this.prisma.delivery.findUnique({
        where: { id: deliveryId },
        select: { id: true, partnerId: true, serviceTypeId: true, date: true,
          deliveryTimeFrom: true, deliveryTimeTo: true },
      });
      if (!d?.partnerId || !d.date) return null;
      const rp = await this.prisma.deliveryRulePartner.findMany({
        where: { partnerId: d.partnerId },
        select: { deliveryRule: { select: {
          id: true, serviceTypeId: true, periodStart: true, periodEnd: true, days: true,
          timeFrom: true, timeTo: true, dailyRule: true, dailyCount: true, totalRule: true, totalCount: true,
          partners: { select: { partnerId: true } },
        } } },
      });
      const regole = rp.map((x) => x.deliveryRule).filter(Boolean) as RegolaCarnet[];
      const candidate = regoleApplicabili(d as ConsegnaPerRegola, regole);
      for (const g of candidate) {
        // Consumo del carnet: le consegne GIÀ agganciate a questa regola.
        if (g.dailyRule && g.dailyCount > 0) {
          const g0 = new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth(), d.date.getUTCDate()));
          const g1 = new Date(g0); g1.setUTCDate(g1.getUTCDate() + 1);
          const usate = await this.prisma.delivery.count({
            where: { deliveryRuleId: g.id, id: { not: deliveryId }, date: { gte: g0, lt: g1 } },
          });
          if (usate >= g.dailyCount) continue;
        }
        if (g.totalRule && g.totalCount > 0) {
          const usate = await this.prisma.delivery.count({
            where: { deliveryRuleId: g.id, id: { not: deliveryId },
              ...(g.periodStart || g.periodEnd ? { date: {
                ...(g.periodStart ? { gte: g.periodStart } : {}),
                ...(g.periodEnd ? { lte: g.periodEnd } : {}),
              } } : {}) },
          });
          if (usate >= g.totalCount) continue;
        }
        await this.prisma.delivery.update({ where: { id: deliveryId }, data: { deliveryRuleId: g.id } });
        return g.id;
      }
      return null;
    } catch (err) {
      console.error('aggancia-regola-carnet:', (err as Error).message);
      return null;
    }
  }

  /**
   * NOTIFICHE VIA MAIL (31/08/2026, chiesto dall'utente): a chi ha abilitato la
   * mail arriva l'avviso — al PARTNER quando gli si inserisce un servizio, al
   * VALET quando gli si assegna — con il link ai dettagli. Passa da AI Mail,
   * stesso contratto del recap; best-effort, non fa mai fallire la consegna.
   */
  private async inviaMail(a: string, oggetto: string, corpo: string): Promise<void> {
    if (!a) return;
    // ⭐ 31/08/2026 (regola utente: «la mail di recap ai partner esiste già, usa
    // quella per le notifiche»): le notifiche partono da AI Mail — la STESSA via
    // del recap, già configurata e funzionante. La casella del Hub resta solo
    // come ripiego se AI Mail non è configurato. Best-effort: un invio fallito
    // non fa mai fallire la consegna.
    const esito = await this.settings.inviaViaAiMail(a, oggetto, corpo);
    if (esito.ok) return;
    const hub = await this.settings.inviaViaHub(a, oggetto, corpo);
    if (hub.ok) return;
    console.error('notifica-mail: invio fallito (AI Mail:', esito.motivo, '| Hub:', hub.motivo, ')');
  }

  private async notificaInserimentoAlPartner(delivery: { id: string; code: number; partnerId: string | null }): Promise<void> {
    if (!delivery.partnerId) return;
    const partner = await this.prisma.partner.findUnique({
      where: { id: delivery.partnerId },
      select: { email: true, insegna: true, mailNotifications: true },
    });
    if (!partner?.email || !partner.mailNotifications) return;
    const link = `https://app.deluxy.it/deliveries/${delivery.id}`;
    await this.inviaMail(
      partner.email,
      `Nuovo servizio Deluxy · consegna #${delivery.code}`,
      [`Ciao ${partner.insegna ?? ''},`, '',
       `ti abbiamo inserito una nuova consegna (#${delivery.code}).`,
       `Vedi i dettagli qui: ${link}`, '',
       'Deluxy'].join('\n'),
    );
  }

  private async notificaAssegnazioneAlValet(delivery: { id: string; code: number; valetId: string | null }): Promise<void> {
    if (!delivery.valetId) return;
    const valet = await this.prisma.valet.findUnique({
      where: { id: delivery.valetId },
      select: { email: true, firstName: true, notifyByEmail: true },
    });
    if (!valet?.email || !valet.notifyByEmail) return;
    const link = `https://app.deluxy.it/deliveries/${delivery.id}`;
    await this.inviaMail(
      valet.email,
      `Nuova consegna assegnata · #${delivery.code}`,
      [`Ciao ${valet.firstName ?? ''},`, '',
       `ti è stata assegnata la consegna #${delivery.code}.`,
       `Vedi i dettagli qui: ${link}`, '',
       'Deluxy'].join('\n'),
    );
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
      // Anche cambiando servizio in modifica vale il listino (31/08/2026).
      if (dto.serviceTypeId && dto.serviceTypeId !== delivery.serviceTypeId) {
        const abilitato = await this.prisma.partnerService.findUnique({
          where: {
            partnerId_serviceTypeId: {
              partnerId: user.partnerId ?? '-',
              serviceTypeId: dto.serviceTypeId,
            },
          },
        });
        if (!abilitato) {
          throw new BadRequestException(
            'Servizio non abilitato per il tuo listino: chiedi a Deluxy di attivarlo.',
          );
        }
      }
    }
    // ⚠️ Stessa difesa della creazione: i campi d'ufficio non si scrivono con
    // un PUT. Qui la regola dello stato «solo se da gestire» già limitava il
    // danno, ma non il PREZZO: un partner poteva riportare a zero una consegna
    // ancora da gestire, e sarebbe finita in fattura a zero.
    dto = DeliveriesService.senzaCampiDiUfficio(dto, user);
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
        ? await this.luogoDaIndirizzo(dto.recipientAddress)
        : undefined;

    // ⚠️ AL CAMBIO DI SERVIZIO O DI ORE: prezzo partner e paga valet vanno
    // rifatti sul NUOVO listino (regola utente 31/08). Prima l'update spruzzava
    // solo il dto: passando da un servizio standard a uno «a ora» il prezzo
    // restava quello vecchio (senza il × ore) e la paga non cambiava. La
    // fatturazione e gli stipendi usano il valore CONGELATO sulla consegna se
    // c'è, quindi qui: si RICALCOLA `price` (con × ore per A_ORA e gli extra km)
    // e si AZZERA `valetSalary`, così gli stipendi lo ricavano dal listino valet
    // del nuovo servizio. Vince comunque un prezzo/paga imposti a mano dopo.
    const cambiaServizio = dto.serviceTypeId != null && dto.serviceTypeId !== delivery.serviceTypeId;
    const cambiaOre = dto.hours != null && dto.hours !== (delivery.hours ?? null);
    // ⭐ 01/09: cambiando gli INDIRIZZI cambia la strada, quindi il listino —
    // distanza ed extra si rifanno anche qui, non solo al cambio di servizio.
    const cambiaIndirizzi =
      (dto.recipientAddress != null && dto.recipientAddress !== delivery.recipientAddress) ||
      (dto.pickupAddress != null && (dto.pickupAddress ?? '') !== (delivery.pickupAddress ?? ''));
    let economiaRicalcolata: Record<string, unknown> = {};
    if (cambiaServizio || cambiaOre || cambiaIndirizzi) {
      const svcId = dto.serviceTypeId ?? delivery.serviceTypeId;
      const svc = await this.prisma.serviceType.findUnique({
        where: { id: svcId }, select: { pricingModel: true, basePrice: true },
      });
      const ps = partnerDaUsare
        ? await this.prisma.partnerService.findUnique({
            where: { partnerId_serviceTypeId: { partnerId: partnerDaUsare, serviceTypeId: svcId } },
          })
        : null;
      const ore = dto.hours ?? delivery.hours ?? 1;
      let price = ps?.price ?? svc?.basePrice ?? 0;
      if (svc?.pricingModel === 'A_ORA') price = price * Math.max(ore, 1);
      // Gli indirizzi con cui si misura: i nuovi dove dichiarati.
      const ritiroFinale =
        ('pickupAddress' in forzatura ? (forzatura as { pickupAddress: string }).pickupAddress : undefined) ??
        dto.pickupAddress ?? delivery.pickupAddress ?? '';
      const consegnaFinale = dto.recipientAddress ?? delivery.recipientAddress ?? '';
      // Distanza: il ritiro forzato in città la azzera; indirizzi cambiati =
      // strada da RIMISURARE (quella vecchia era di un altro percorso);
      // altrimenti vale quella dichiarata o già scritta.
      let dist =
        'distanceKm' in forzatura
          ? (forzatura as { distanceKm: number | null }).distanceKm
          : (dto.distanceKm ?? (cambiaIndirizzi ? null : (delivery.distanceKm ?? null)));
      if (dist == null && !('distanceKm' in forzatura) && ritiroFinale.trim() && consegnaFinale.trim()) {
        dist = await this.settings.distanzaStradaleKm(ritiroFinale, consegnaFinale);
      }
      // FUORI CITTÀ = comune del ritiro diverso dal comune di consegna: TUTTI i
      // km × extraOutOfCityPrice. In città: solo i km oltre gli inclusi.
      const cR = cittaDaIndirizzo(ritiroFinale);
      const cC = cittaDaIndirizzo(consegnaFinale);
      const fuoriCitta = Boolean(cR && cC && cR !== cC);
      // Tariffe km: il listino-servizio vince, la SCHEDA partner è il ripiego
      // (kmIncluded + extraOutOfCityPrice) — regola utente 01/09.
      const tariffeP = partnerDaUsare
        ? await this.prisma.partner.findUnique({
            where: { id: partnerDaUsare },
            select: { kmIncluded: true, extraOutOfCityPrice: true },
          })
        : null;
      // Km SOLO su PREZZO_FISSO e A_ORA, come in fatturazione: la VENDITA è
      // una percentuale sul venduto e non prezza la distanza (utente 01/09).
      const modelloConKm = svc?.pricingModel === 'PREZZO_FISSO' || svc?.pricingModel === 'A_ORA';
      let extra = 0;
      if (dist != null && modelloConKm) {
        if (fuoriCitta) {
          const tariffa = (ps?.extraOutOfCityPrice ?? 0) > 0
            ? ps!.extraOutOfCityPrice
            : (tariffeP?.extraOutOfCityPrice ?? 0);
          extra = dist;
          price += dist * tariffa;
        } else {
          const inclusi = (ps?.includedKm ?? 0) > 0 ? ps!.includedKm : (tariffeP?.kmIncluded ?? 0);
          if (dist > inclusi) {
            extra = Math.round((dist - inclusi) * 10) / 10;
            price += extra * (ps?.extraKmPrice ?? 0);
          }
        }
      }
      economiaRicalcolata = {
        price: Math.round(price * 100) / 100,
        distanceKm: dist,
        extraKm: extra,
        extraOutOfCity: fuoriCitta,
        // Azzerata la paga BASE (gli stipendi la ricavano dal nuovo listino); il
        // plus/minus manuale del valet resta, non è legato al servizio.
        valetSalary: null,
      };
    }

    const aggiornata = await this.prisma.delivery.update({
      where: { id },
      data: {
        ...scalar,
        ...forzatura,
        ...economiaRicalcolata,
        ...(date ? { date: new Date(date) } : {}),
        // Cambiato l'indirizzo, cambiano anche coordinate E provincia: tenere
        // la vecchia provincia su un indirizzo nuovo è peggio che non averla.
        ...(reGeocode !== undefined
          ? {
              latitude: reGeocode.lat,
              longitude: reGeocode.lng,
              ...(reGeocode.provinceId ? { provinceId: reGeocode.provinceId } : {}),
            }
          : {}),
        // Righe prodotto: sostituite in blocco (come nei form di modifica)
        ...(products
          ? {
              products: {
                deleteMany: {},
                create: await this.fotografaProdotti(products as any, user),
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
    // ⚠️ 27/08/2026 — Anche QUI. `soloIMieiSoldi` e `hideInternalNotes` erano
    // applicate solo su `findAll` e `findOne`: chiedendo l'annullamento di una
    // consegna, o salvandone una, il partner si riprendeva `valetSalary`,
    // `valetAdditionalPrice` e le note interne dalla risposta della SCRITTURA.
    // Una difesa messa solo sulle letture non è una difesa.
    return this.soloIMieiSoldi(this.hideInternalNotes(aggiornata, user), user);
  }

  async updateStatus(
    id: string,
    status: DeliveryStatus,
    user: JwtUser,
    dettagli?: {
      receiverType?: string;
      receivedBy?: string;
      receiverSign?: string;
      ddtFile?: string;
      notDeliveredReason?: string;
    },
  ) {
    const delivery = await this.findOne(id, user);

    // CONSEGNE DA FORNITORE (31/08/2026): quando è il partner stesso a fare la
    // consegna, ed è la SUA consegna, chiude come un valet (in consegna →
    // consegnata / non consegnata). `deliveredByPartner` e `partnerId`
    // sopravvivono alla maschera del partner, quindi si possono leggere qui.
    const consegnaDaFornitore =
      user.role === Role.PARTNER &&
      (delivery as any).deliveredByPartner === true &&
      (delivery as any).partnerId === user.partnerId;

    // Il partner puo' solo richiedere la cancellazione — tranne quando è lui a
    // consegnare (Consegne da Fornitore).
    if (
      user.role === Role.PARTNER &&
      !consegnaDaFornitore &&
      status !== DeliveryStatus.CANCELLATION_REQUESTED
    ) {
      throw new ForbiddenException(
        'Il partner puo solo richiedere la cancellazione',
      );
    }

    // Il VALET — e il partner che consegna da fornitore — fa il SUO mestiere e
    // solo in avanti (31/08/2026): ritira
    // (in consegna) e chiude (consegnata / non consegnata). La rotta gli era
    // aperta su QUALSIASI stato — avrebbe potuto cancellare o retrocedere una
    // consegna chiusa, e da una chiusa dipende la sua paga.
    if (user.role === Role.VALET || consegnaDaFornitore) {
      const versoConsentito = [
        DeliveryStatus.IN_DELIVERY,
        DeliveryStatus.DELIVERED,
        DeliveryStatus.NOT_DELIVERED,
      ].includes(status);
      // Si parte solo da una consegna ancora in lavorazione; «consegnata» e
      // «non consegnata» valgono anche saltando il ritiro (capita di premere
      // solo alla fine), ma da una chiusa non si torna indietro.
      const daStatoAperto = [
        DeliveryStatus.ASSIGNED,
        DeliveryStatus.ACCEPTED,
        DeliveryStatus.IN_PREPARATION,
        DeliveryStatus.IN_DELIVERY,
        // Da fornitore: la consegna può essere ancora «created» (nessun valet
        // assegnato) e il partner deve poter partire lo stesso.
        ...(consegnaDaFornitore ? [DeliveryStatus.CREATED] : []),
      ].includes(delivery.status as DeliveryStatus);
      if (!versoConsentito || !daStatoAperto) {
        throw new ForbiddenException(
          'Il valet può solo mettere in consegna e chiudere (consegnata / non consegnata) una consegna in lavorazione',
        );
      }
    }

    const logType =
      status === DeliveryStatus.IN_DELIVERY
        ? 'departed'
        : status === DeliveryStatus.DELIVERED
          ? 'delivered'
          : 'status_change';

    // I dettagli della chiusura si scrivono SOLO con lo stato giusto: un
    // client non deve poter riempire «consegnata a» su una cancellazione.
    const extra: Record<string, string> = {};
    const racconto: string[] = [];
    if (status === DeliveryStatus.DELIVERED && dettagli) {
      const TIPI: Record<string, string> = {
        recipient: 'destinatario', concierge: 'custode/portineria', other: 'altro',
      };
      if (dettagli.receiverType) { extra['receiverType'] = dettagli.receiverType; racconto.push(`ritirata da: ${TIPI[dettagli.receiverType]}`); }
      if (dettagli.receivedBy) { extra['receivedBy'] = dettagli.receivedBy; racconto.push(`nome: ${dettagli.receivedBy}`); }
      if (dettagli.receiverSign) { extra['receiverSign'] = dettagli.receiverSign; racconto.push('firma raccolta dall\'app'); }
      if (dettagli.ddtFile) { extra['ddtFile'] = dettagli.ddtFile; racconto.push('DDT firmato allegato'); }
    }
    if (status === DeliveryStatus.NOT_DELIVERED && dettagli?.notDeliveredReason) {
      extra['notDeliveredReason'] = dettagli.notDeliveredReason;
      racconto.push(`motivo: ${dettagli.notDeliveredReason}`);
    }

    const updated = await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status,
        ...extra,
        logs: {
          create: {
            type: logType,
            message: `Stato: ${delivery.status} -> ${status}`
              + (racconto.length ? ` · ${racconto.join(' · ')}` : ''),
            userId: user.sub,
          },
        },
      },
      include: DELIVERY_INCLUDE,
    });

    await this.notifyStatusChange(updated, status, user);
    // ⚠️ 27/08/2026 — Anche QUI. `soloIMieiSoldi` e `hideInternalNotes` erano
    // applicate solo su `findAll` e `findOne`: chiedendo l'annullamento di una
    // consegna, o salvandone una, il partner si riprendeva `valetSalary`,
    // `valetAdditionalPrice` e le note interne dalla risposta della SCRITTURA.
    // Una difesa messa solo sulle letture non è una difesa.
    return this.soloIMieiSoldi(this.hideInternalNotes(updated, user), user);
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
      // ⚠️ 27/08/2026 — ANCHE IL SOFT-DELETE. Mancava solo qui: la gemella
      // `confirmDeliveredByToken` lo filtrava già. Misurato: la consegna
      // cancellata #61449 rispondeva 200 a chiunque avesse il link — «per chi
      // legge non esiste più» valeva dentro l'app e non fuori.
      where: { trackingToken: token, deletedAt: null },
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
      // ⚠️ 27/08/2026 — I LOG NON ESCONO PIÙ COL LORO TESTO.
      //
      // Il `select` qui sopra nasconde con cura il COGNOME del valet — e due
      // righe più sotto i messaggi lo riscrivevano per esteso: «Assegnata al
      // valet Mario Rossi», «Consegna confermata — ricevuta da …». Una
      // restrizione annullata dalla riga successiva non è una restrizione.
      //
      // Fuori esce solo il TIPO e il momento: l'etichetta la costruisce chi
      // legge. Un tipo non riconosciuto non si mostra affatto, invece di
      // ripiegare sul messaggio grezzo — il ripiego riaprirebbe il buco al
      // primo tipo nuovo.
      logs: delivery.logs
        .filter((l) => l.type in DeliveriesService.ETICHETTE_PUBBLICHE)
        .map((l) => ({
          type: l.type,
          etichetta: DeliveriesService.ETICHETTE_PUBBLICHE[l.type],
          createdAt: l.createdAt,
        })),
    };
  }

  /**
   * I passaggi che si possono raccontare a chi ha il link, con l'etichetta
   * SCRITTA DA NOI. Chi riceve un fiore vuole sapere a che punto è, non chi
   * glielo porta né che cosa si sono detti in ufficio.
   *
   * ⚠️ Non si manda più il `message`: il `select` qui sopra nasconde con cura
   * il COGNOME del valet, e i messaggi lo riscrivevano per esteso («Assegnata
   * al valet Mario Rossi», `type: 'status_change'`). Una restrizione annullata
   * dalla riga successiva non è una restrizione.
   *
   * ⚠️ I tipi sono quelli che il codice SCRIVE DAVVERO, contati in archivio il
   * 27/08/2026: `created` 93, `status_change` 713, `ritiro-forzato` 2.200,
   * `delivered`, `departed`, `legacy_update` 17.680. La prima versione di
   * questo filtro elencava `assigned`, `in_delivery`, `not_delivered` — che
   * sono i valori di `DeliveryStatus`, non i tipi dei log: **zero righe in
   * archivio**. È la trappola del filtro con un valore inesistente.
   *
   * Restano fuori di proposito `status_change` (porta il nome del valet) e
   * `legacy_update` (un rimando che non dice niente a nessuno).
   */
  private static readonly ETICHETTE_PUBBLICHE: Record<string, string> = {
    created: 'Consegna registrata',
    departed: 'Il valet è partito',
    'ritiro-forzato': 'Ritiro effettuato',
    delivered: 'Consegnata',
    cancelled: 'Annullata',
  };

  /**
   * Conferma di consegna dal link pubblico "consegnata" (senza login): imposta
   * lo stato a "delivered" e registra chi ha ritirato. Idempotente.
   */
  async confirmDeliveredByToken(token: string, receivedBy?: string) {
    // ⚠️ Anche il soft-delete: una consegna cancellata non si conferma.
    const delivery = await this.prisma.delivery.findFirst({
      where: { trackingToken: token, deletedAt: null },
    });
    if (!delivery) throw new NotFoundException('Consegna non trovata');
    // Già consegnata (o con le ore approvate): il link è idempotente e risponde ok.
    if (delivery.status === DeliveryStatus.DELIVERED || delivery.status === DeliveryStatus.APPROVED) {
      return { esito: 'gia_consegnata', code: delivery.code };
    }
    // ⭐⭐ E QUI SI FERMA (26/08/2026). Prima la guardia nominava
    // `delivered_time_approved`, uno stato che in banca dati non esiste: quindi
    // NON copriva nessuno degli stati chiusi veri, e il link pubblico — che non
    // ha login, non scade e non si consuma — riportava a «consegnata» qualunque
    // consegna. Misurato: 3.791 consegne non consegnate hanno un token vivo, fra
    // cui **1.149 ANNULLATE**, 8 invalidate e 520 non consegnate. Una annullata
    // riportata a `delivered` rientra nei corrispettivi (la Finanza smette di
    // escluderla) E nello stipendio del valet: ricavo inventato da una parte,
    // paga non dovuta dall'altra, senza che parta nessuna notifica.
    // I token non sono teorici: gli 890 delle approvate arrivano dai vecchi
    // «DELIVERED LINK» del legacy, già nelle chat dei valet.
    // La lista degli stati chiusi sta in UN SOLO POSTO, cosi' il prossimo stato
    // nuovo e' coperto senza che nessuno se ne ricordi.
    if (DELIVERY_CLOSED_STATUSES.includes(delivery.status)) {
      throw new ConflictException(
        'Questa consegna è chiusa e non si può confermare dal link: '
        + 'chiedi all’ufficio di riaprirla.',
      );
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

    // TEAM LEADER che assegna (31/08/2026, utente): un valet può assegnare
    // SOLO se è team leader e SOLO nel suo perimetro (province di
    // responsabilità + partner abilitati − esclusi). `findOne` sopra ha già
    // negato l'accesso a una consegna fuori perimetro; qui si verifica che
    // anche il VALET DESTINATARIO sia nel perimetro, e che chi assegna sia
    // davvero un team leader.
    if (user.role === Role.VALET) {
      const io = await this.prisma.valet.findUnique({
        where: { id: user.valetId ?? '-' },
        select: { id: true, isTeamLeader: true, teamLeaderProvinces: true, teamLeaderPartners: true,
          teamLeaderExcludedPartners: true, provinces: { select: { provinceId: true } } },
      });
      if (!io?.isTeamLeader) {
        throw new ForbiddenException('Solo un team leader può assegnare le consegne.');
      }
      const ambito = await ambitoTeamLeader(io, (provinceIds) =>
        this.prisma.valet.findMany({
          where: { provinces: { some: { provinceId: { in: provinceIds } } } },
          select: { id: true },
        }),
      );
      // Il valet destinatario dev'essere fra quelli del perimetro (stesse
      // province di responsabilità del team leader).
      if (ambito && !ambito.valetIds.includes(valetId)) {
        throw new ForbiddenException('Puoi assegnare solo a valet della tua provincia.');
      }
    }

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
    // A un valet si assegnano SOLO i servizi che ha abilitati (regola
    // dell'utente 31/08/2026) — ma la regola vale per i servizi DI MESTIERE
    // (ServiceType.scope = 'valet'/'both'). Una consegna su un servizio del
    // LATO PARTNER (es. «Vendita Deluxy», scope 'partner') non è un mestiere
    // da abilitare: misurato il 31/08, ZERO valet su 38 di MI l'avevano a
    // listino e nessuna vendita era più assegnabile. Lì la paga nasce dal
    // listino del valet per tipo di prezzo, come sempre (salaries).
    if (delivery.serviceTypeId && tariffe.length === 0) {
      const st = await this.prisma.serviceType.findUnique({
        where: { id: delivery.serviceTypeId }, select: { scope: true },
      });
      if (st?.scope !== 'partner') {
        throw new BadRequestException(
          `${valet.firstName ?? ''} ${valet.lastName ?? ''} non ha questo servizio abilitato nel listino: abilitarlo prima di assegnare.`.trim(),
        );
      }
    }
    const valetService = tariffaAllaData(tariffe, delivery.date ?? new Date());
    const valetSalary =
      valetService != null
        ? valetService.salary * (delivery.hours ?? 1)
        : null;

    await this.prisma.activity.updateMany({
      where: { deliveryId: id },
      data: { valetId },
    });

    const assegnata = await this.prisma.delivery.update({
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
    // Avvisa il valet dell'assegnazione, se ha la mail abilitata (31/08).
    void this.notificaAssegnazioneAlValet(assegnata);
    // Questa e' dell'ufficio (`@Roles(ADMIN, OPERATION)`), ma passare dalla
    // stessa porta costa zero e toglie un'eccezione da ricordare.
    return this.soloIMieiSoldi(this.hideInternalNotes(assegnata, user), user);
  }

  async remove(id: string, user: JwtUser) {
    await this.findOne(id, user);
    await this.prisma.delivery.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * I CAMPI CHE DECIDE L'UFFICIO, non chi manda la richiesta.
   *
   * Denaro (prezzi, paghe, flag di fatturazione), assegnazione del valet e
   * stato della consegna: un partner li propone al massimo a voce, non li
   * scrive. `deliveryCodeRequired` e le note interne restano fuori per lo
   * stesso motivo.
   *
   * ⚠️ Non è un elenco di comodo: è la differenza fra «il listino decide» e
   * «decide chi chiama». Aggiungendo un campo economico al DTO va aggiunto
   * anche qui, o il difetto si riapre da solo.
   */
  private static readonly CAMPI_DI_UFFICIO = [
    'price', 'additionalPrice', 'deliveryPrice', 'flexiblePrice', 'isFlexiblePrice',
    'valetSalary', 'valetAdditionalPrice', 'valetServiceId',
    'billable', 'payable', 'invoiced',
    'status', 'paymentStatus',
    'valetId',
    // Consegne da Fornitore: è l'ufficio a decidere che una consegna la fa il
    // partner al posto di un valet — non se la accende il partner da solo.
    'deliveredByPartner',
    'internalNotes',
    'extraKm', 'extraOutOfCity', 'distanceKm',
    // ⚠️ `deluxyDelivery` è un interruttore che nessuno legge in tutta l'api:
    // un flag senza padrone che il partner poteva accendersi. Finché non ha un
    // significato scritto da qualche parte, non lo scrive lui.
    'deluxyDelivery',
  ] as const;
  //
  // ⚠️ Restano scrivibili DI PROPOSITO, e vale la pena dirlo perché sembrano
  // economici: `hours` (è la durata che il partner CHIEDE per un servizio a
  // ora — moltiplica il prezzo verso l'alto, non verso il basso),
  // `paymentOnDelivery`/`paymentAmount` (il contrassegno è una richiesta sua),
  // `deliveryCodeRequired` (chiede più sicurezza, non meno).

  /** Toglie i campi d'ufficio quando a scrivere è un partner. */
  private static senzaCampiDiUfficio<T extends Record<string, any>>(dto: T, user: JwtUser): T {
    if (user.role !== Role.PARTNER) return dto;
    const pulito: Record<string, any> = { ...dto };
    for (const c of DeliveriesService.CAMPI_DI_UFFICIO) delete pulito[c];
    // ⚠️ LA PORTA LATERALE: cancellare le chiavi di primo livello non basta.
    // `DeliveryProductDto` dichiara a sua volta `price` e `flexiblePrice`, e
    // quel prezzo NON è decorativo: la fatturazione lo somma nel «venduto»
    // (`invoices.module.ts`, `products.price`). Un partner che non può
    // scrivere `price` sulla consegna se lo scriveva sulle sue righe prodotto
    // — cioè si dettava da solo l'importo che gli fattureremo.
    //
    // Il prezzo dei prodotti viene dal catalogo, e il catalogo lo tiene
    // l'ufficio. Quantità e varianti restano sue: quelle sono la richiesta.
    if (Array.isArray(pulito['products'])) {
      pulito['products'] = pulito['products'].map((r: Record<string, any>) => {
        const { price, flexiblePrice, ...resto } = r;
        return resto;
      });
    }
    return pulito as T;
  }

  // ============================================================
  // DOVE SI TROVA UNA CONSEGNA (28/08/2026)
  // ------------------------------------------------------------
  // ⚠️ Nessuno scriveva `provinceId`: **100% delle consegne nate in questa app
  // non ne aveva una** (94 su 94, misurato). Le 61.404 importate ce l'hanno a
  // metà (52% vuota). Senza provincia una consegna sparisce dai filtri per
  // provincia — i partner abilitati, i valet della zona, l'ambito dei team
  // leader — e non è un vuoto che si nota: è una riga che semplicemente non
  // compare, e chi guarda conclude che non esiste.
  //
  // La geocodifica c'era già e si usava SOLO per le coordinate, buttando via
  // la provincia che tornava nella stessa risposta.
  //
  // ⚠️ Si RICORDA per indirizzo dentro la richiesta: la generazione dei
  // ricorrenti crea decine di consegne allo stesso indirizzo, e chiamare
  // Google una volta per consegna sarebbe pagare novanta volte la stessa
  // risposta.
  // ============================================================
  private readonly luoghiVisti = new Map<string, { lat: number | null; lng: number | null; provinceId: string | null }>();

  async luogoDaIndirizzo(
    indirizzo: string | null | undefined,
  ): Promise<{ lat: number | null; lng: number | null; provinceId: string | null }> {
    const chiave = (indirizzo ?? '').trim().toLowerCase();
    const vuoto = { lat: null, lng: null, provinceId: null };
    if (!chiave) return vuoto;
    const gia = this.luoghiVisti.get(chiave);
    if (gia) return gia;

    const r = await this.settings.geocode(indirizzo!.trim()).catch(() => null);
    let provinceId: string | null = null;
    if (r?.provinceCode) {
      const p = await this.prisma.province.findUnique({
        where: { code: r.provinceCode },
        select: { id: true },
      });
      provinceId = p?.id ?? null;
    }
    const esito = { lat: r?.lat ?? null, lng: r?.lng ?? null, provinceId };
    this.luoghiVisti.set(chiave, esito);
    return esito;
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

  // ============================================================
  // IL VALET NON VEDE I SOLDI DEL PARTNER (27/08/2026)
  // ------------------------------------------------------------
  // Segnalato dall'utente: «i valet possono vedere quanto i partner pagano le
  // consegne mentre non dovrebbe essere così: il valet può vedere solo i
  // propri servizi».
  //
  // ⚠️ Non era una svista dell'interfaccia: l'API mandava TUTTO. Nascondere i
  // numeri nella pagina non li avrebbe tolti dalla risposta — chi apre gli
  // strumenti del browser (o legge la rotta) li vedeva lo stesso. Si tolgono
  // QUI, che è l'unico posto che nessuno può aggirare.
  //
  // ⚠️ Il CONTRASSEGNO resta: sono i contanti che il valet deve incassare alla
  // consegna. Toglierlo non sarebbe prudenza, sarebbe fargli sbagliare il giro.
  // ============================================================
  private static readonly SOLDI_DEL_PARTNER = [
    'price',
    'additionalPrice',
    'deliveryPrice',
    'flexiblePrice',
    'isFlexiblePrice',
    'extraKm',
    'extraOutOfCity',
    'billable',
    'invoiced',
    // Il conto della vendita e' fra noi e il partner: al valet non riguarda.
    'economiaVendita',
  ] as const;

  /**
   * Toglie da una consegna il denaro che riguarda il partner, quando a leggere
   * è un valet. Quello che il valet vede resta il SUO: `valetSalary`,
   * `valetAdditionalPrice`, le ore, e il contrassegno da incassare.
   */
  private soloIMieiSoldi<T extends Record<string, any>>(delivery: T, user: JwtUser): T {
    // ⚠️ 27/08/2026 — LO SPECCHIO MANCANTE. Si toglieva il denaro del partner
    // al valet, ma non il denaro del valet al PARTNER: `valetSalary` e
    // `valetAdditionalPrice` uscivano su ogni sua consegna. Sono il NOSTRO
    // costo: chi li vede accanto al prezzo che paga legge il nostro margine.
    if (user.role === Role.PARTNER) {
      const pulita: Record<string, any> = { ...delivery };
      for (const c of ['valetSalary', 'valetAdditionalPrice', 'valetServiceId']) delete pulita[c];
      // ⚠️ 31/08 (regola dell'utente): sui servizi di tipo VENDITA il cliente
      // finale è di DELUXY, non del partner (che vende per nostro conto): al
      // partner NON si mostrano i suoi dati. Nasconderlo solo nella pagina non
      // basta — chi legge la rotta lo vedrebbe. `hideCustomerInfo` del servizio
      // vale allo stesso modo, se acceso.
      // ⚠️ 31/08 (regola dell'utente) — CONSEGNE DA FORNITORE. Se è il partner
      // stesso a fare la consegna (`deliveredByPartner`) ED è la SUA consegna,
      // i dati del destinatario NON si nascondono: gli servono per consegnare.
      // La deroga vale solo per il proprietario, non per un partner che vede la
      // consegna perché condivisa.
      const laFaIlPartner =
        pulita['deliveredByPartner'] === true &&
        pulita['partnerId'] === user.partnerId;
      const svc = (pulita['serviceType'] ?? {}) as { pricingModel?: string; hideCustomerInfo?: boolean };
      if (!laFaIlPartner && (svc.pricingModel === 'VENDITA' || svc.hideCustomerInfo)) {
        for (const campo of ['recipientFirstName', 'recipientLastName', 'recipientAddress',
          'recipientPhone', 'recipientEmail', 'recipientIntercom', 'latitude', 'longitude']) {
          delete pulita[campo];
        }
      }
      return pulita as T;
    }
    if (user.role !== Role.VALET) return delivery;
    const pulita: Record<string, any> = { ...delivery };
    for (const campo of DeliveriesService.SOLDI_DEL_PARTNER) delete pulita[campo];
    // ⚠️ 31/08 (regola dell'utente): al VALET il DESTINATARIO si scopre solo
    // quando la consegna è «in consegna» (o già chiusa). Finché è solo
    // assegnata/accettata, deve vedere il RITIRO e cosa portare, non a chi —
    // è un dato personale del cliente. Nasconderlo solo nella pagina non
    // basterebbe: chi legge la rotta lo vedrebbe lo stesso.
    // 31/08 (precisazione utente): gli INDIRIZZI (ritiro e consegna) restano
    // SEMPRE visibili al valet — gli servono per pianificare il giro. Fino a
    // «in consegna» si nascondono solo i DATI ANAGRAFICI del destinatario
    // (nome, telefono, email, citofono).
    const scoperto = ['in_delivery', 'delivered', 'not_delivered'].includes(pulita['status']);
    if (!scoperto) {
      for (const campo of ['recipientFirstName', 'recipientLastName',
        'recipientPhone', 'recipientEmail', 'recipientIntercom']) {
        delete pulita[campo];
      }
    }
    // I prodotti portano il prezzo di vendita al cliente: al valet serve
    // sapere COSA porta e quanti pezzi, non quanto è stato venduto.
    if (Array.isArray(pulita['products'])) {
      pulita['products'] = pulita['products'].map((p: Record<string, any>) => {
        const { price, productPrice, publicPrice, flexiblePrice, ...resto } = p;
        return resto;
      });
    }
    // Le righe di fattura e la regola carnet lato fatturazione sono conti fra
    // noi e il partner: non riguardano chi fa il giro.
    delete pulita['invoiceLines'];
    if (pulita['deliveryRule']) {
      const { partnerBillingAdjustment, toBill, ...regola } = pulita['deliveryRule'];
      pulita['deliveryRule'] = regola;
    }
    return pulita as T;
  }
}
