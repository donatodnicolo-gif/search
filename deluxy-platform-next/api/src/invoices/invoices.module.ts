import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response as RispostaHttp } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Public, Roles } from '../common/decorators';
import { InvoiceStatus, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/**
 * Guard per i webhook macchina-a-macchina: richiede l'header `x-api-key`
 * uguale a INVOICE_WEBHOOK_API_KEY. Nessun login utente (usato con @Public).
 */
@Injectable()
export class WebhookApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided =
      req.headers['x-api-key'] ??
      (req.headers['authorization']?.startsWith('Bearer ')
        ? req.headers['authorization'].slice(7)
        : undefined);
    const expected = process.env.INVOICE_WEBHOOK_API_KEY;
    if (!expected) throw new UnauthorizedException('Webhook fatture non configurato');
    if (provided !== expected) throw new UnauthorizedException('API key non valida');
    return true;
  }
}

/**
 * Quanto costa una consegna al partner, secondo il TIPO DI SERVIZIO.
 *
 * Non tutti i servizi si pagano allo stesso modo, e fatturarli tutti come
 * "price + additionalPrice" era il difetto: su 47.126 consegne da fatturare,
 * **21.245 hanno price = 0** e sarebbero finite in fattura a zero euro.
 *
 * I cinque modelli (`ServiceType.pricingModel`):
 *  - `PREZZO_FISSO`  tariffa del listino, piu' i km oltre quelli inclusi e
 *                     l'eventuale supplemento fuori citta'.
 *  - `A_ORA`         tariffa oraria x le ore, con il minimo di ore del servizio
 *                     (`minHours`): mezz'ora di lavoro non si fattura mezza.
 *  - `MAGAZZINO`     prezzo base + prezzo a pezzo x i pezzi movimentati.
 *  - `VENDITA`       ⚠️ qui il numero del listino **non e' euro, e' una
 *                     percentuale**: la fee sul valore venduto. Scambiarla per
 *                     euro e' un errore gia' fatto una volta.
 *  - `CORPORATE`     il servizio corporate passa dai prodotti, non dalla
 *                     replica della consegna: si somma il valore dei prodotti.
 *
 * ⚠️ Il prezzo scritto sulla consegna VINCE sempre. È la fotografia di quanto
 * si è deciso quel giorno, e ricalcolarlo a posteriori riscriverebbe il
 * passato: il listino di oggi non è quello di allora.
 *
 * Torna `null` quando il prezzo non e' determinabile — nessun prezzo sulla
 * consegna e nessun listino del partner per quel servizio. È il caso di
 * 17.029 consegne, e dirlo è meglio che fatturarle a zero.
 */
export type ConsegnaDaPrezzare = {
  price?: number | null;
  additionalPrice?: number | null;
  hours?: number | null;
  distanceKm?: number | null;
  extraKm?: number | null;
  extraOutOfCity?: boolean | null;
  serviceType?: { pricingModel?: string | null; basePrice?: number | null; perPiecePrice?: number | null; minHours?: number | null } | null;
  products?: {
    quantity?: number | null;
    price?: number | null;
    productVariant?: { publicPrice?: number | null } | null;
    product?: { publicPrice?: number | null; price?: number | null } | null;
  }[];
};
/**
 * La regola carnet applicata alla consegna (`Delivery.deliveryRuleId`).
 *
 * ⚠️ Importate dal legacy il 20/07 ma MAI APPLICATE: erano anagrafica e basta.
 * Sono 28 regole su 3.372 consegne, e non sono un dettaglio — portano sconti
 * fino a −28 € a consegna, e alcune dicono di NON fatturare affatto
 * (`toBill = false`): fatturare quelle sarebbe chiedere soldi due volte, visto
 * che il carnet è già stato pagato in anticipo.
 */
export type RegolaCarnet = {
  partnerBillingAdjustment?: number | null;
  toBill?: boolean | null;
} | null;

export type ListinoPartner = {

  price?: number | null;
  includedKm?: number | null;
  extraKmPrice?: number | null;
  extraOutOfCityPrice?: number | null;
  pricePerItem?: number | null;
} | null;

/**
 * Quanto vale una consegna nel conto col partner.
 *
 * ⚠️ Nei servizi di VENDITA il denaro va nell'altro verso. Il cliente paga
 * Deluxy, Deluxy trattiene la sua percentuale e **deve il resto al partner**:
 * su un prodotto da 110 € con fee al 20%, a noi restano 22 e al partner ne
 * dobbiamo 88. Mostrare solo i 22 come «da fatturare» racconta meta' della
 * storia — e la meta' meno importante per chi legge dall'altra parte.
 *
 * Negli altri servizi (consegna a prezzo fisso, a ora, magazzino) il verso e'
 * quello normale: il partner paga noi, e `dovutoAlPartner` vale 0.
 */
export function prezzoConsegna(d: ConsegnaDaPrezzare, listino: ListinoPartner, regola: RegolaCarnet = null):
  { amount: number; origine: 'consegna' | 'listino'; modello: string; venduto: number; dovutoAlPartner: number } | null {

  // Una regola carnet che dice «non fatturare» vince su tutto: il carnet è
  // già stato pagato in anticipo, rifatturarlo sarebbe chiedere due volte.
  if (regola && regola.toBill === false) return null;

  // Lo sconto del carnet (negativo nel legacy: −25, −18, −15…) si somma al
  // plus/minus della consegna.
  const extra = (d.additionalPrice ?? 0) + (regola?.partnerBillingAdjustment ?? 0);
  const arrotonda = (n: number) => Math.round(n * 100) / 100;
  // Lo sconto non puo' far pagare al partner meno di zero.
  const mai_negativo = (n: number) => Math.max(0, arrotonda(n));

  // ⚠️ Dove il prezzo di riga manca si scala di un gradino alla volta —
  // pubblico della VARIANTE, pubblico del PRODOTTO, prezzo base (stessa regola
  // della Finanza, decisa dall'utente il 25-26/08): senza, il venduto usciva
  // zero e al partner non risultava dovuto niente. E' il listino di oggi, non
  // la fotografia di quel giorno.
  const valoreProdotti = (d.products ?? []).reduce(
    (s, p) => s + (p.price ?? p.productVariant?.publicPrice ?? p.product?.publicPrice ?? p.product?.price ?? 0) * (p.quantity ?? 1), 0,
  );
  const vendita = (d.serviceType?.pricingModel ?? '') === 'VENDITA';
  /**
   * Cio' che incassiamo per conto del partner e gli dobbiamo girare.
   * Solo nelle vendite: altrove il denaro va dal partner a noi.
   */
  const dovuto = (trattenuto: number) =>
    vendita ? Math.max(0, Math.round((valoreProdotti - trattenuto) * 100) / 100) : 0;

  // Il prezzo deciso sulla consegna vince: è un fatto, non una stima.
  if ((d.price ?? 0) > 0) {
    const a = mai_negativo(d.price! + extra);
    return { amount: a, origine: 'consegna', modello: d.serviceType?.pricingModel ?? '—', venduto: valoreProdotti, dovutoAlPartner: dovuto(a) };
  }


  const modello = d.serviceType?.pricingModel ?? '';

  // Km oltre quelli inclusi: vale solo dove si paga la distanza.
  const supplementoKm = (): number => {
    if (!listino) return 0;
    const inclusi = listino.includedKm ?? 0;
    const percorsi = d.distanceKm ?? 0;
    const oltre = d.extraKm && d.extraKm > 0 ? d.extraKm : Math.max(0, percorsi - inclusi);
    const perKm = oltre * (listino.extraKmPrice ?? 0);
    const fuori = d.extraOutOfCity ? (listino.extraOutOfCityPrice ?? 0) : 0;
    return perKm + fuori;
  };

  // ⚠️ Senza listino non si sa: e' l'unico caso di «non prezzabile».
  //
  // Se il listino C'E' ed e' a zero, zero e' la RISPOSTA, non un buco: ci sono
  // partner per cui non si trattiene niente — una vendita con fee 0% e' una
  // scelta commerciale, non un dato mancante. Prima li contavo tutti come
  // incompleti: 3.285 consegne accusate di essere un buco quando erano
  // semplicemente gratuite.
  if (!listino && modello !== 'CORPORATE') return null;

  switch (modello) {
    case 'PREZZO_FISSO': {
      const tariffa = listino?.price ?? d.serviceType?.basePrice ?? 0;
      const a = mai_negativo(tariffa + supplementoKm() + extra);
      return { amount: a, origine: 'listino', modello, venduto: valoreProdotti, dovutoAlPartner: dovuto(a) };
    }
    case 'A_ORA': {
      // Il minimo di ore del servizio: mezz'ora di lavoro non si fattura mezza.
      const ore = Math.max(d.hours ?? 0, d.serviceType?.minHours ?? 1);
      const a = mai_negativo((listino?.price ?? 0) * ore + supplementoKm() + extra);
      return { amount: a, origine: 'listino', modello, venduto: valoreProdotti, dovutoAlPartner: dovuto(a) };
    }
    case 'MAGAZZINO': {
      const base = listino?.price ?? d.serviceType?.basePrice ?? 0;
      const aPezzo = listino?.pricePerItem ?? d.serviceType?.perPiecePrice ?? 0;
      const pezzi = (d.products ?? []).reduce((s, p) => s + (p.quantity ?? 1), 0);
      const a = mai_negativo(base + aPezzo * pezzi + extra);
      return { amount: a, origine: 'listino', modello, venduto: valoreProdotti, dovutoAlPartner: dovuto(a) };
    }
    case 'VENDITA': {
      // ⚠️ `listino.price` qui e' una PERCENTUALE, non euro. Una fee dello 0%
      // e' legittima: la consegna e' avvenuta e non si trattiene niente.
      const feePercento = listino?.price ?? 0;
      const a = mai_negativo((valoreProdotti * feePercento) / 100 + extra);
      return { amount: a, origine: 'listino', modello, venduto: valoreProdotti, dovutoAlPartner: dovuto(a) };
    }
    case 'CORPORATE': {
      // Il corporate non passa dal listino ma dai prodotti: senza prodotti non
      // c'e' proprio niente su cui calcolare.
      if (!(d.products ?? []).length) return null;
      const a = mai_negativo(valoreProdotti + extra);
      return { amount: a, origine: 'listino', modello, venduto: valoreProdotti, dovutoAlPartner: 0 };
    }
    default:
      return null;
  }
}


/**
 * Da quando in poi un buco di tariffa e' un problema da guardare.
 *
 * Le consegne che non si riescono a prezzare sono quasi tutte vecchie: 3.550 su
 * 3.557 sono del 2020-2024, e vengono da rapporti chiusi (BASARA Padova e
 * Vimercate, ultima consegna 2022; Chanel Milano e Roma, ultima febbraio 2024).
 * Nessuno le fatturera' mai, e tenerle nel conto faceva sembrare aperto un
 * lavoro che e' finito da anni.
 *
 * Quelle piu' vecchie di questa data escono dall'elenco. NON spariscono in
 * silenzio: il conto di quante sono messe da parte torna in `arretrato`, o
 * «non conteggiate» diventerebbe indistinguibile da «non esistono».
 */
export const SOGLIA_ARRETRATO = new Date('2026-07-01T00:00:00.000Z');

/** Aliquota IVA e conversione imponibile → totale: una regola sola per tutti. */

const IVA = 22;
const conIva = (n: number) => Math.round(n * (1 + IVA / 100) * 100) / 100;

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Le fatture, filtrate.
   *
   * I filtri stanno qui e non nel browser perche' lo storico cresce: filtrare
   * dopo aver scaricato tutto funziona finche' le fatture sono 559.
   *
   * `dal`/`al` guardano il PERIODO fatturato, non la data di emissione: e' il
   * modo in cui si cerca una fattura («quella di giugno»).
   */
  findAll(user: JwtUser, archived = false, filtri: {
    partnerId?: string; stato?: string; dal?: string; al?: string; cerca?: string;
  } = {}) {
    const where: any = { archived };
    if (user.role === Role.PARTNER) where.partnerId = user.partnerId ?? '-';
    else if (filtri.partnerId) where.partnerId = filtri.partnerId;
    if (filtri.stato) where.status = filtri.stato;
    // Periodo sovrapposto, non contenuto: una fattura 01/06–30/06 deve uscire
    // anche cercando dal 15/06, altrimenti si trova solo cominciando dal primo.
    if (filtri.dal) where.periodEnd = { gte: new Date(filtri.dal) };
    if (filtri.al) where.periodStart = { lte: new Date(filtri.al) };
    if (filtri.cerca?.trim()) {
      const t = filtri.cerca.trim();
      where.OR = [
        { number: { contains: t, mode: 'insensitive' } },
        { partner: { insegna: { contains: t, mode: 'insensitive' } } },
        { partner: { businessName: { contains: t, mode: 'insensitive' } } },
      ];
    }
    // ⚠️ Le RIGHE non escono da qui. Caricandole insieme all'elenco, lo
    // Storico rispondeva 3,2 MB — 559 fatture con dentro tutte le 9.811 righe —
    // e il browser si piantava a montarle. Il dettaglio le chiede a parte,
    // quando qualcuno lo apre: sono 18 righe per volta, non 9.811.
    return this.prisma.invoice.findMany({
      where,
      include: { partner: { select: { id: true, insegna: true } } },
      orderBy: { periodStart: 'desc' },
    });
  }

  /** Le righe di UNA fattura: si leggono aprendo il dettaglio, non prima. */
  async lines(user: JwtUser, id: string) {
    const fattura = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, partnerId: true },
    });
    if (!fattura) throw new NotFoundException('Fattura non trovata');
    if (user.role === Role.PARTNER && user.partnerId !== fattura.partnerId) {
      throw new NotFoundException('Fattura non trovata');
    }
    return this.prisma.invoiceLine.findMany({
      where: { invoiceId: id },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Il lavoro ancora da fatturare, raggruppato per partner.
   *
   * È la domanda che la pagina Fatturazione non sapeva rispondere: mostrava le
   * fatture già fatte, quindi la consegna di stamattina non compariva da
   * nessuna parte finché qualcuno non indovinava partner e periodo e premeva
   * «Genera fattura». Il lavoro da fatturare non è una fattura: è l'elenco
   * delle consegne che una fattura non ce l'hanno ancora.
   *
   * Consegna da fatturare = `billable`, stato diverso da annullata/non
   * consegnata, e **nessuna riga di fattura che la citi**.
   *
   * Torna gli importi come li tratta la fattura: imponibile (somma delle
   * righe) e totale con IVA.
   */
  async pending(user: JwtUser, opzioni: { partnerId?: string; fino?: string; dal?: string; al?: string } = {}) {
    const where: any = {
      deletedAt: null,
      billable: true,
      status: { notIn: InvoicesService.NON_BILLABLE_STATUSES },
      invoiceLines: { none: {} },
      // ⭐ Il legacy segna sulla consegna se e' gia' stata fatturata, e non e'
      // deducibile dalle righe: 35.135 consegne sono marcate fatturate ma solo
      // 9.811 hanno una riga che le colleghi a un documento. Senza questo
      // filtro il «da fatturare» contava 47.126 consegne invece di 22.031, e
      // avrebbe rifatturato il gia' fatturato.
      invoiced: false,
    };
    if (user.role === Role.PARTNER) where.partnerId = user.partnerId ?? '-';
    else if (opzioni.partnerId) where.partnerId = opzioni.partnerId;
    const data: any = {};
    if (opzioni.dal) data.gte = new Date(opzioni.dal);
    if (opzioni.al || opzioni.fino) data.lte = new Date((opzioni.al ?? opzioni.fino)!);
    if (Object.keys(data).length) where.date = data;

    const deliveries = await this.prisma.delivery.findMany({
      where,
      select: {
        id: true, partnerId: true, serviceTypeId: true, date: true,
        price: true, additionalPrice: true, hours: true,
        distanceKm: true, extraKm: true, extraOutOfCity: true,
        serviceType: { select: { pricingModel: true, basePrice: true, perPiecePrice: true, minHours: true } },
        deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } },
      },
    });

    // I prodotti servono solo dove il prezzo si ricava da loro (vendita a
    // percentuale, corporate, magazzino a pezzo) e manca sulla consegna:
    // caricarli per tutte sarebbe una lettura enorme per niente.
    const DA_PRODOTTI = ['VENDITA', 'CORPORATE', 'MAGAZZINO'];
    const serveProdotti = deliveries
      .filter((d) => DA_PRODOTTI.includes(d.serviceType?.pricingModel ?? ''))
      .map((d) => d.id);
    const prodotti = new Map<string, {
      quantity: number;
      price: number | null;
      productVariant: { publicPrice: number | null } | null;
      product: { publicPrice: number | null; price: number | null } | null;
    }[]>();
    for (let i = 0; i < serveProdotti.length; i += 2000) {
      for (const p of await this.prisma.deliveryProduct.findMany({
        where: { deliveryId: { in: serveProdotti.slice(i, i + 2000) } },
        select: {
          deliveryId: true, quantity: true, price: true,
          productVariant: { select: { publicPrice: true } },
          product: { select: { publicPrice: true, price: true } },
        },
      })) {
        const arr = prodotti.get(p.deliveryId) ?? [];
        arr.push({ quantity: p.quantity, price: p.price, productVariant: p.productVariant, product: p.product });
        prodotti.set(p.deliveryId, arr);
      }
    }

    const listini = new Map(
      (await this.prisma.partnerService.findMany({
        where: opzioni.partnerId || user.role === Role.PARTNER
          ? { partnerId: where.partnerId }
          : undefined,
      })).map((l) => [`${l.partnerId}|${l.serviceTypeId}`, l]),
    );

    type Riga = {
      partnerId: string; mese: string;
      deliveriesCount: number; netAmount: number;
      /** Valore di quello che si e' venduto per conto del partner. */
      venduto: number;
      /** Quello che di quel venduto va girato a lui. */
      dovutoAlPartner: number;
      unpricedCount: number; ruleExcludedCount: number; fromListino: number;
      from: Date; to: Date;
      modelli: Record<string, number>;
    };
    const per = new Map<string, Riga>();
    let arretrato = 0;
    let dateImpossibili = 0;

    // ⚠️ Il mese si calcola in ora di Roma, non UTC: una consegna del 1° del
    // mese alle 00:30 italiane a Greenwich e' ancora l'ultimo del mese prima,
    // e finirebbe nella fattura sbagliata.
    const meseDi = (d: Date) =>
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' })
        .format(d).slice(0, 7);

    for (const d of deliveries) {
      if (!d.partnerId) continue;
      // Le date fuori dal mondo (2926, 2029, 2001) sono errori del legacy:
      // messe in un mese vero farebbero comparire «fattura di maggio 2926».
      const anno = d.date.getFullYear();
      if (anno < 2019 || anno > new Date().getFullYear() + 1) { dateImpossibili++; continue; }

      const calcolo = prezzoConsegna(
        { ...d, products: prodotti.get(d.id) ?? [] } as any,
        listini.get(`${d.partnerId}|${d.serviceTypeId}`) ?? null,
        (d as any).deliveryRule ?? null,
      );
      const perRegola = (d as any).deliveryRule?.toBill === false;

      // Buco di tariffa su una consegna vecchia: arretrato, non lavoro aperto.
      if (!calcolo && !perRegola && d.date < SOGLIA_ARRETRATO) { arretrato++; continue; }

      const mese = meseDi(d.date);
      const chiave = `${d.partnerId}|${mese}`;
      const r = per.get(chiave) ?? {
        partnerId: d.partnerId, mese,
        deliveriesCount: 0, netAmount: 0, venduto: 0, dovutoAlPartner: 0,
        unpricedCount: 0, ruleExcludedCount: 0, fromListino: 0,
        from: d.date, to: d.date, modelli: {},
      };
      r.deliveriesCount++;
      const mod = d.serviceType?.pricingModel ?? '—';
      r.modelli[mod] = (r.modelli[mod] ?? 0) + 1;
      if (calcolo) {
        r.netAmount += calcolo.amount;
        r.venduto += calcolo.venduto;
        r.dovutoAlPartner += calcolo.dovutoAlPartner;
        if (calcolo.origine === 'listino') r.fromListino++;
      } else if (perRegola) r.ruleExcludedCount++;
      else r.unpricedCount++;
      if (d.date < r.from) r.from = d.date;
      if (d.date > r.to) r.to = d.date;
      per.set(chiave, r);
    }

    const partners = await this.prisma.partner.findMany({
      where: { id: { in: [...new Set([...per.values()].map((r) => r.partnerId))] } },
      select: { id: true, insegna: true },
    });
    const nome = new Map(partners.map((p) => [p.id, p.insegna]));

    // Il mese in corso non e' chiuso: si fattura quando finisce, e dirlo evita
    // fatture di mezzo mese emesse per sbaglio.
    const meseCorrente = meseDi(new Date());

    const voci = [...per.values()]
      .map((r) => {
        const netAmount = Math.round(r.netAmount * 100) / 100;
        const dovutoAlPartner = Math.round(r.dovutoAlPartner * 100) / 100;
        return {
          chiave: `${r.partnerId}|${r.mese}`,
          partnerId: r.partnerId,
          partner: { id: r.partnerId, insegna: nome.get(r.partnerId) ?? '—' },
          mese: r.mese,
          inCorso: r.mese === meseCorrente,
          deliveriesCount: r.deliveriesCount,
          unpricedCount: r.unpricedCount,
          ruleExcludedCount: r.ruleExcludedCount,
          fromListino: r.fromListino,
          modelli: r.modelli,
          venduto: Math.round(r.venduto * 100) / 100,
          dovutoAlPartner,
          netAmount,
          vatRate: IVA,
          totalAmount: conIva(netAmount),
          from: r.from,
          to: r.to,
        };
      })
      // Prima i mesi recenti, e dentro il mese i conti piu' grossi.
      .sort((a, b) => (a.mese === b.mese ? b.netAmount - a.netAmount : b.mese.localeCompare(a.mese)));

    return {
      voci,
      totali: {
        righe: voci.length,
        partners: new Set(voci.map((v) => v.partnerId)).size,
        mesi: new Set(voci.map((v) => v.mese)).size,
        deliveriesCount: voci.reduce((s, v) => s + v.deliveriesCount, 0),
        unpricedCount: voci.reduce((s, v) => s + v.unpricedCount, 0),
        ruleExcludedCount: voci.reduce((s, v) => s + v.ruleExcludedCount, 0),
        fromListino: voci.reduce((s, v) => s + v.fromListino, 0),
        venduto: Math.round(voci.reduce((s, v) => s + v.venduto, 0) * 100) / 100,
        dovutoAlPartner: Math.round(voci.reduce((s, v) => s + v.dovutoAlPartner, 0) * 100) / 100,
        netAmount: Math.round(voci.reduce((s, v) => s + v.netAmount, 0) * 100) / 100,
        totalAmount: Math.round(voci.reduce((s, v) => s + v.totalAmount, 0) * 100) / 100,
        /// Consegne senza tariffa piu' vecchie della soglia: messe da parte, non perse.
        arretrato,
        soglia: SOGLIA_ARRETRATO,
        /// Date fuori dal mondo nel legacy (2926, 2029, 2001): escluse dai mesi.
        dateImpossibili,
      },
    };
  }

  /**
   * Il recap del mese da mandare al partner.
   *
   * È il documento che nel vecchio sistema arrivava come PDF allegato alla
   * fattura. Qui si ricostruisce dai dati: intestazione, una riga per consegna,
   * e i totali.
   *
   * ⚠️ Per i servizi di VENDITA c'è un secondo blocco, e racconta l'altro verso
   * del denaro: il cliente ha pagato Deluxy, noi tratteniamo la nostra quota e
   * **il resto lo dobbiamo al partner**. Un recap che mostrasse solo la nostra
   * quota sarebbe la metà meno interessante per chi lo riceve.
   */
  async recap(user: JwtUser, partnerId: string, mese: string) {
    if (user.role === Role.PARTNER && user.partnerId !== partnerId) {
      throw new NotFoundException('Partner non trovato');
    }
    if (!/^\d{4}-\d{2}$/.test(mese)) {
      throw new BadRequestException('Mese non valido: atteso AAAA-MM.');
    }
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true, insegna: true, businessName: true, vatNumber: true,
        address: true, city: true, invoiceEmail: true, email: true,
      },
    });
    if (!partner) throw new NotFoundException('Partner non trovato');

    const [anno, m] = mese.split('-').map(Number);
    const dal = new Date(Date.UTC(anno, m - 1, 1));
    const al = new Date(Date.UTC(anno, m, 0, 23, 59, 59, 999));

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        partnerId,
        deletedAt: null,
        billable: true,
        status: { notIn: InvoicesService.NON_BILLABLE_STATUSES },
        invoiceLines: { none: {} },
        invoiced: false,
        date: { gte: dal, lte: al },
      },
      select: {
        id: true, code: true, date: true, serviceTypeId: true,
        price: true, additionalPrice: true, hours: true,
        distanceKm: true, extraKm: true, extraOutOfCity: true,
        deliveryTimeFrom: true, deliveryTimeTo: true,
        // L'INDIRIZZO del destinatario entra nel recap su decisione
        // dell'utente (26/08): al partner serve per riconoscere la consegna.
        // Nome e cognome restano fuori.
        recipientAddress: true,
        province: { select: { code: true } },
        serviceType: { select: { name: true, pricingModel: true, basePrice: true, perPiecePrice: true, minHours: true } },
        products: { select: { quantity: true, price: true, productVariant: { select: { publicPrice: true } }, product: { select: { publicPrice: true, price: true } } } },
        deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } },
      },
      orderBy: { date: 'asc' },
    });

    const listini = new Map(
      (await this.prisma.partnerService.findMany({ where: { partnerId } }))
        .map((l) => [l.serviceTypeId, l]),
    );

    const righe: {
      code: number; date: Date; provincia: string | null;
      service: string; orario: string | null; indirizzo: string | null;
      plusMinus: number; fatturabile: boolean;
      amount: number; venduto: number; dovuto: number;
    }[] = [];
    let escluse = 0;
    for (const d of deliveries) {
      const c = prezzoConsegna(d as any, listini.get(d.serviceTypeId) ?? null, (d as any).deliveryRule ?? null);
      const base = {
        code: d.code,
        date: d.date,
        provincia: d.province?.code ?? null,
        service: d.serviceType?.name ?? '—',
        orario: d.deliveryTimeFrom ? `${d.deliveryTimeFrom}${d.deliveryTimeTo ? '–' + d.deliveryTimeTo : ''}` : null,
        indirizzo: d.recipientAddress ?? null,
        plusMinus: d.additionalPrice ?? 0,
      };
      // Le consegne senza tariffa (o che una regola carnet dice di non
      // fatturare) ora si VEDONO, marcate «non fatturabile»: prima erano solo
      // un conteggio in nota, e il partner non sapeva QUALI fossero.
      if (!c) {
        escluse++;
        righe.push({ ...base, fatturabile: false, amount: 0, venduto: 0, dovuto: 0 });
        continue;
      }
      righe.push({
        ...base,
        fatturabile: true,
        amount: c.amount,
        venduto: c.venduto,
        dovuto: c.dovutoAlPartner,
      });
    }

    const netAmount = Math.round(righe.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const venduto = Math.round(righe.reduce((s, r) => s + r.venduto, 0) * 100) / 100;
    const dovutoAlPartner = Math.round(righe.reduce((s, r) => s + r.dovuto, 0) * 100) / 100;
    // La quota Deluxy sul venduto è quello che si trattiene: il venduto meno
    // quello che gli si gira. Non si ricalcola dalla percentuale — le
    // percentuali sono per servizio, e sommarle sarebbe una media inventata.
    const quotaDeluxy = Math.round((venduto - dovutoAlPartner) * 100) / 100;

    return {
      partner,
      mese,
      periodo: { dal, al },
      righe,
      escluse,
      totali: {
        deliveriesCount: righe.filter((r) => r.fatturabile).length,
        netAmount,
        vatRate: IVA,
        vatAmount: Math.round((conIva(netAmount) - netAmount) * 100) / 100,
        totalAmount: conIva(netAmount),
        venduto,
        quotaDeluxy,
        dovutoAlPartner,
      },
    };
  }

  /**
   * Il recap in HTML: una pagina sola, stampabile, e leggibile anche dentro una
   * mail. Niente CSS esterno né immagini — un documento che si apre a pezzi
   * quando la rete non c'è non è un documento.
   */
  recapHtml(r: Awaited<ReturnType<InvoicesService['recap']>>): string {
    const e = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' &euro;';
    const gg = (d: Date) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: '2-digit' }).format(d);
    const mese = new Date(Number(r.mese.slice(0, 4)), Number(r.mese.slice(5, 7)) - 1, 1)
      .toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

    const righe = r.righe.map((x) => `
      <tr${x.fatturabile ? '' : ' class="esclusa"'}>
        <td class="mono">${gg(x.date)}</td>
        <td class="mono num">#${x.code}</td>
        <td class="mono">${e(x.orario ?? '—')}</td>
        <td class="indirizzo">${e(x.indirizzo ?? '—')}</td>
        <td class="muted">${e(x.provincia ?? '')}</td>
        <td class="muted">${e(x.service)}</td>
        <td class="num">${x.plusMinus ? eur(x.plusMinus) : '—'}</td>
        <td class="muted">${x.fatturabile ? 'S&igrave;' : 'No'}</td>
        <td class="num">${x.fatturabile ? eur(x.amount) : '—'}</td>
      </tr>`).join('');

    const blocchoVendite = r.totali.venduto > 0 ? `
      <h2>Vendite del periodo</h2>
      <table class="totali">
        <tr><td>Valore venduto</td><td class="num">${eur(r.totali.venduto)}</td></tr>
        <tr><td>Quota Deluxy</td><td class="num">&minus;${eur(r.totali.quotaDeluxy)}</td></tr>
        <tr class="finale"><td>Dovuto a voi</td><td class="num">${eur(r.totali.dovutoAlPartner)}</td></tr>
      </table>` : '';

    return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<title>Recap ${e(mese)} — ${e(r.partner.insegna)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px; background: #F5F5F7; color: #1d1d1f;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .foglio { max-width: 780px; margin: 0 auto; background: #fff; border-radius: 14px;
    padding: 36px 40px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  h1 { margin: 0 0 2px; font-size: 24px; font-weight: 600; letter-spacing: -.025em; }
  .periodo { color: #6e6e73; margin: 0 0 24px; }
  .chi { border-top: 1px solid #e5e5ea; padding-top: 16px; margin-bottom: 24px; font-size: 13px; }
  .chi strong { display: block; font-size: 15px; }
  .chi span { color: #6e6e73; }
  h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
    color: #6e6e73; margin: 28px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; color: #6e6e73; padding: 6px 8px; border-bottom: 1px solid #e5e5ea; }
  td { padding: 7px 8px; border-bottom: 1px solid #f2f2f4; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #6e6e73; }
  .indirizzo { max-width: 220px; font-size: 12.5px; }
  .esclusa td { color: #a1a1a6; }
  .totali { margin-top: 4px; width: auto; margin-left: auto; min-width: 280px; }
  .totali td { border: 0; padding: 4px 8px; }
  .totali td.num { font-variant-numeric: tabular-nums; }
  .totali .finale td { border-top: 1px solid #1d1d1f; padding-top: 8px; font-weight: 600; font-size: 16px; }
  .nota { margin-top: 26px; font-size: 12px; color: #6e6e73; }
  @media print { body { background: #fff; padding: 0; } .foglio { box-shadow: none; border-radius: 0; } }
</style></head>
<body><div class="foglio">
  <h1>Recap consegne</h1>
  <p class="periodo">${e(mese)}</p>
  <div class="chi">
    <strong>${e(r.partner.businessName || r.partner.insegna)}</strong>
    <span>${e(r.partner.insegna)}${r.partner.vatNumber ? ' &middot; P.IVA ' + e(r.partner.vatNumber) : ''}</span><br>
    <span>${e([r.partner.address, r.partner.city].filter(Boolean).join(', '))}</span>
  </div>

  <table>
    <thead><tr>
      <th>Data</th><th class="num">Consegna</th><th>Orario</th><th>Indirizzo</th><th>Prov.</th><th>Servizio</th><th class="num">Plus/minus</th><th>Fatturabile</th><th class="num">Importo</th>
    </tr></thead>
    <tbody>${righe || '<tr><td colspan="9" class="muted">Nessuna consegna da fatturare in questo mese.</td></tr>'}</tbody>
  </table>

  <table class="totali">
    <tr><td>${r.totali.deliveriesCount} consegne &mdash; imponibile</td><td class="num">${eur(r.totali.netAmount)}</td></tr>
    <tr><td>IVA ${r.totali.vatRate}%</td><td class="num">${eur(r.totali.vatAmount)}</td></tr>
    <tr class="finale"><td>Totale</td><td class="num">${eur(r.totali.totalAmount)}</td></tr>
  </table>

  ${blocchoVendite}

  ${r.escluse ? `<p class="nota">${r.escluse} ${r.escluse === 1 ? 'consegna &egrave; marcata «non fatturabile»' : 'consegne sono marcate «non fatturabili»'}: non hanno una tariffa applicabile, oppure una regola carnet prevede di non fatturarle.</p>` : ''}
  <p class="nota">Documento di riepilogo, non &egrave; una fattura. I nominativi dei destinatari non compaiono.</p>
</div></body></html>`;
  }

  /**
   * Manda il recap del mese al partner, passando da AI Mail.
   *
   * ⚠️ Il canale SMTP appartiene ad AI Mail (Standard Deluxy §5.3): passando di
   * lì la copia finisce negli «Inviati» della casella vera, e una mail partita
   * da qui resta consultabile dove si consulta tutta la posta. La piattaforma
   * non ha e non deve avere credenziali SMTP proprie.
   *
   * Contratto verificato su come lo chiama il CRM: `POST /api/v1/invia` con
   * `x-api-key` + `x-utente`, corpo `{ a, cc, oggetto, corpo }`.
   */
  async inviaRecap(user: JwtUser, partnerId: string, mese: string, aManuale?: string) {
    const r = await this.recap(user, partnerId, mese);

    const destinatario = (aManuale ?? r.partner.invoiceEmail ?? r.partner.email ?? '').trim();
    if (!destinatario) {
      throw new BadRequestException(
        `${r.partner.insegna} non ha un indirizzo di fatturazione: aggiungilo nella scheda partner, o indicane uno qui.`,
      );
    }
    if (!r.righe.length) {
      throw new BadRequestException('Niente da mandare: nessuna consegna fatturabile in questo mese.');
    }

    const url = ((await this.settings.get('mailUrl')) ?? process.env.MAIL_URL ?? 'https://deluxy-mail.vercel.app').replace(/\/+$/, '');
    const chiave = (await this.settings.get('mailApiKey')) ?? process.env.MAIL_API_KEY ?? '';
    const utente = (await this.settings.get('mailUtente')) ?? process.env.MAIL_UTENTE ?? '';
    if (!chiave || !utente) {
      const manca = [!chiave && 'chiave', !utente && 'casella'].filter(Boolean).join(' e ');
      throw new BadRequestException(
        `Invio non configurato: manca la ${manca} di AI Mail (Configurazione → Impostazioni). Il recap si può comunque scaricare.`,
      );
    }

    const nomeMese = new Date(Number(mese.slice(0, 4)), Number(mese.slice(5, 7)) - 1, 1)
      .toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

    let res: Response;
    try {
      res = await fetch(`${url}/api/v1/invia`, {
        method: 'POST',
        headers: { 'x-api-key': chiave, 'x-utente': utente, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          a: destinatario,
          oggetto: `Recap consegne ${nomeMese} — ${r.partner.insegna}`,
          corpo: this.recapHtml(r),
        }),
        // L'SMTP vero ci mette qualche secondo: un timeout corto farebbe
        // sembrare fallito un invio andato a buon fine.
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new BadRequestException('AI Mail non risponde: la mail non è partita.');
    }
    const corpo = (await res.json().catch(() => null)) as { ok?: boolean; messaggio?: string } | null;
    if (!res.ok || !corpo?.ok) {
      throw new BadRequestException(corpo?.messaggio ?? `AI Mail risponde ${res.status}.`);
    }

    this.logger.log(`Recap ${mese} di ${r.partner.insegna} inviato a ${destinatario}`);
    return { ok: true, a: destinatario, righe: r.righe.length, totale: r.totali.totalAmount };
  }

  /** Le consegne da fatturare di UN partner, una per una (per il dettaglio). */
  async pendingDetail(user: JwtUser, partnerId: string, fino?: string) {
    if (user.role === Role.PARTNER && user.partnerId !== partnerId) {
      throw new NotFoundException('Partner non trovato');
    }
    const where: any = {
      partnerId,
      // Le consegne cancellate logicamente non esistono piu': ne restavano
      // 431 nel conto del da fatturare.
      deletedAt: null,
      billable: true,
      status: { notIn: InvoicesService.NON_BILLABLE_STATUSES },
      invoiceLines: { none: {} },
      // ⭐ Il legacy segna sulla consegna se e' gia' stata fatturata, e non e'
      // deducibile dalle righe: 35.135 consegne sono marcate fatturate ma solo
      // 9.811 hanno una riga che le colleghi a un documento. Senza questo
      // filtro il «da fatturare» contava 47.126 consegne invece di 22.031, e
      // avrebbe rifatturato il gia' fatturato.
      invoiced: false,
    };
    if (fino) where.date = { lte: new Date(fino) };
    const deliveries = await this.prisma.delivery.findMany({
      where,
      select: {
        id: true, code: true, date: true, status: true, serviceTypeId: true, partnerId: true,

        price: true, additionalPrice: true, hours: true,
        distanceKm: true, extraKm: true, extraOutOfCity: true,
        recipientFirstName: true, recipientLastName: true, recipientAddress: true,
        serviceType: { select: { name: true, pricingModel: true, basePrice: true, perPiecePrice: true, minHours: true } },
        deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } },
        products: { select: { quantity: true, price: true, productVariant: { select: { publicPrice: true } }, product: { select: { publicPrice: true, price: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
    const listini = new Map(
      (await this.prisma.partnerService.findMany({ where: { partnerId } }))
        .map((l) => [l.serviceTypeId, l]),
    );
    return {
      // Anche nel dettaglio l'arretrato non si mostra: sarebbe un elenco di
      // consegne del 2021 in mezzo al lavoro di oggi.
      deliveries: deliveries.filter((d) => {
        const c = prezzoConsegna(d as any, listini.get(d.serviceTypeId) ?? null, (d as any).deliveryRule ?? null);
        return c || (d as any).deliveryRule?.toBill === false || d.date >= SOGLIA_ARRETRATO;
      }).map((d) => {
        const calcolo = prezzoConsegna(d as any, listini.get(d.serviceTypeId) ?? null, (d as any).deliveryRule ?? null);
        return {

          id: d.id, code: d.code, date: d.date, status: d.status,
          recipientFirstName: d.recipientFirstName, recipientLastName: d.recipientLastName,
          recipientAddress: d.recipientAddress,
          service: d.serviceType?.name ?? '—',
          pricingModel: d.serviceType?.pricingModel ?? '—',
          amount: calcolo?.amount ?? null,
          /// Da dove viene il numero: dalla consegna (deciso allora) o dal
          /// listino (ricalcolato ora). `null` = non prezzabile.
          origine: calcolo?.origine ?? null,
          /// Esclusa da una regola carnet, non per un dato mancante.
          esclusaDaRegola: d.deliveryRule?.toBill === false,
          regola: d.deliveryRule?.toBill === false ? d.deliveryRule?.name ?? null : null,
        };
      }),
      troncato: deliveries.length === 500,
    };
  }

  // Stati esclusi dalla fatturazione: annullata e non consegnata.
  /**
   * Stati che NON si fatturano.
   *
   * ⚠️ Qui c'era scritto `notDelivered`, in camelCase — e in banca dati lo
   * stato si chiama `not_delivered`. Il filtro non ha mai escluso niente:
   * 1.744 consegne NON CONSEGNATE risultavano da fatturare, piu' 230
   * `invalidated` e 6 `not_accepted`. Un valore che non combacia con nessuna
   * riga non da' errore, da' un filtro che non filtra.
   *
   * `cancellation_requested` resta dentro apposta: la cancellazione e' stata
   * CHIESTA, non fatta, e finche' non lo diventa la consegna e' avvenuta.
   */
  private static readonly NON_BILLABLE_STATUSES = [
    'cancelled', 'not_delivered', 'invalidated', 'not_accepted',
  ];


  /**
   * Genera la fattura del periodo per un partner: una riga per ogni consegna
   * "da fatturare" (billable) del periodo, in qualsiasi stato tranne
   * annullata/non consegnata. Importo riga = price + additionalPrice.
   *
   * ⚠️ Salta le consegne che stanno GIÀ su una fattura. Senza questo filtro
   * rigenerare lo stesso periodo lo fatturava una seconda volta, in silenzio:
   * nei dati importati dal legacy 13 consegne risultano fatturate due volte.
   */
  async generate(partnerId: string, periodStart: string, periodEnd: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException('Partner non trovato');

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        partnerId,
        // Le consegne cancellate logicamente non esistono piu': ne restavano
        // 431 nel conto del da fatturare.
        deletedAt: null,
        billable: true,
        status: { notIn: InvoicesService.NON_BILLABLE_STATUSES },
        date: { gte: new Date(periodStart), lte: new Date(periodEnd) },
        invoiceLines: { none: {} },

      // ⭐ Il legacy segna sulla consegna se e' gia' stata fatturata, e non e'
      // deducibile dalle righe: 35.135 consegne sono marcate fatturate ma solo
      // 9.811 hanno una riga che le colleghi a un documento. Senza questo
      // filtro il «da fatturare» contava 47.126 consegne invece di 22.031, e
      // avrebbe rifatturato il gia' fatturato.
      invoiced: false,
      },
      include: {
        serviceType: { select: { pricingModel: true, basePrice: true, perPiecePrice: true, minHours: true } },
        // La regola carnet: sconto sulla fattura, o «non fatturare affatto».
        deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } },
        products: { select: { quantity: true, price: true, productVariant: { select: { publicPrice: true } }, product: { select: { publicPrice: true, price: true } } } },
      },
      orderBy: { date: 'asc' },
    });

    // Il listino del partner, una lettura sola: serve a prezzare i servizi a
    // ora, a pezzo e a percentuale, che sulla consegna il prezzo non ce l'hanno.
    const listini = new Map(
      (await this.prisma.partnerService.findMany({ where: { partnerId } }))
        .map((l) => [l.serviceTypeId, l]),
    );

    const lines: { deliveryId: string; date: Date; recipient: string; description: string | null; amount: number }[] = [];
    const nonPrezzabili: { code: number; date: Date; servizio: string }[] = [];
    for (const d of deliveries) {
      const calcolo = prezzoConsegna(d as any, listini.get(d.serviceTypeId) ?? null, (d as any).deliveryRule ?? null);
      if (!calcolo) {
        // Fuori dalla fattura: una riga a 0 € sarebbe un documento che dice il
        // falso. Chi la emette deve saperlo, quindi si torna l'elenco.
        nonPrezzabili.push({ code: d.code, date: d.date, servizio: d.serviceType?.pricingModel ?? '—' });
        continue;
      }
      lines.push({
        deliveryId: d.id,
        date: d.date,
        recipient: `${d.recipientLastName} ${d.recipientFirstName}`.trim(),
        description: d.recipientAddress ?? null,
        amount: calcolo.amount,
      });
    }
    if (!lines.length) {
      throw new BadRequestException(
        nonPrezzabili.length
          ? `Nessuna consegna prezzabile nel periodo: ${nonPrezzabili.length} senza prezzo né listino per il loro servizio.`
          : 'Nessuna consegna da fatturare nel periodo.',
      );
    }
    // L'imponibile è la somma delle righe; il totale del documento è con IVA.
    // ⚠️ Prima qui il totale ERA l'imponibile: le fatture nuove sarebbero
    // uscite senza IVA, incoerenti con le 559 storiche (che l'IVA la hanno).
    const netAmount = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
    const vatRate = IVA;
    const totalAmount = conIva(netAmount);
    const year = new Date(periodStart).getFullYear();
    const count = await this.prisma.invoice.count();

    const fattura = await this.prisma.invoice.create({
      data: {
        partnerId,
        number: `FAT-${year}-${count + 1}`,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        netAmount,
        vatRate,
        totalAmount,
        deliveriesCount: lines.length,
        status: InvoiceStatus.DRAFT,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    // La consegna impara di essere stata fatturata. È la stessa colonna che
    // usava il legacy (`delivery.invoiced`): tenerla indietro vorrebbe dire
    // avere due verità sullo stesso fatto, e prima o poi crederle alla peggiore.
    await this.prisma.delivery.updateMany({
      where: { id: { in: lines.map((l) => l.deliveryId) } },
      data: { invoiced: true },
    });

    return { ...fattura, nonPrezzabili };
  }

  /** Avanzamento: DRAFT -> ISSUED (emessa: archivia in storico) -> PAID (pagata). */
  async updateStatus(id: string, status: InvoiceStatus) {
    const data: any = { status };
    if (status === InvoiceStatus.ISSUED) { data.issuedAt = new Date(); data.archived = true; }
    if (status === InvoiceStatus.PAID) data.paidAt = new Date();
    return this.prisma.invoice.update({ where: { id }, data });
  }

  /**
   * Webhook: un sistema esterno (es. contabilità) segnala che una fattura è stata
   * pagata. Identifica la fattura per `id` o per `number` (es. FAT-2026-3).
   * Idempotente: se già pagata la ritorna senza modifiche.
   */
  async markPaidByWebhook(body: { id?: string; number?: string; paidAt?: string }) {
    if (!body.id && !body.number) {
      throw new BadRequestException('Fornisci `id` o `number` della fattura');
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: body.id ? { id: body.id } : { number: body.number },
    });
    if (!invoice) throw new NotFoundException('Fattura non trovata');
    if (invoice.status === InvoiceStatus.PAID) {
      return { esito: 'gia_pagata', fattura: invoice };
    }
    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        archived: true,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        issuedAt: invoice.issuedAt ?? new Date(),
      },
    });
    return { esito: 'aggiornata', fattura: updated };
  }

  /** Riapre una fattura dallo storico: torna in bozza. Solo se non ancora pagata. */
  async reopen(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Fattura non trovata');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Una fattura già pagata non può essere riaperta');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { archived: false, status: InvoiceStatus.DRAFT, issuedAt: null, paidAt: null },
    });
  }
}

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista fatture (il partner vede le proprie). archived=true per lo storico' })
  @ApiQuery({ name: 'archived', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'stato', required: false, description: 'DRAFT | ISSUED | PAID' })
  @ApiQuery({ name: 'dal', required: false, description: 'Periodo fatturato che finisce da questa data in poi' })
  @ApiQuery({ name: 'al', required: false })
  @ApiQuery({ name: 'cerca', required: false, description: 'Numero fattura o insegna/ragione sociale' })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('archived') archived?: string,
    @Query('partnerId') partnerId?: string,
    @Query('stato') stato?: string,
    @Query('dal') dal?: string,
    @Query('al') al?: string,
    @Query('cerca') cerca?: string,
  ) {
    return this.invoicesService.findAll(user, archived === 'true', { partnerId, stato, dal, al, cerca });
  }

  @Get('pending')
  @ApiOperation({ summary: 'Il lavoro ancora da fatturare, per partner (consegne senza fattura)' })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'fino', required: false, description: 'Solo le consegne fino a questa data (ISO)' })
  @ApiQuery({ name: 'dal', required: false })
  @ApiQuery({ name: 'al', required: false })
  pending(
    @CurrentUser() user: JwtUser,
    @Query('partnerId') partnerId?: string,
    @Query('fino') fino?: string,
    @Query('dal') dal?: string,
    @Query('al') al?: string,
  ) {
    return this.invoicesService.pending(user, { partnerId, fino, dal, al });
  }

  @Get('pending/:partnerId')
  @ApiOperation({ summary: 'Le consegne da fatturare di un partner, una per una' })
  @ApiQuery({ name: 'fino', required: false })
  pendingDetail(@CurrentUser() user: JwtUser, @Param('partnerId') partnerId: string, @Query('fino') fino?: string) {
    return this.invoicesService.pendingDetail(user, partnerId, fino);
  }

  @Get(':id/lines')
  @ApiOperation({ summary: 'Le righe di una fattura (il dettaglio le chiede a parte)' })
  lines(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.invoicesService.lines(user, id);
  }

  @Get('recap/:partnerId')
  @ApiOperation({ summary: 'Il recap del mese da mandare al partner (JSON, o HTML con formato=html)' })
  @ApiQuery({ name: 'mese', required: true, description: 'AAAA-MM' })
  @ApiQuery({ name: 'formato', required: false, description: 'html per il documento stampabile' })
  async recap(
    @CurrentUser() user: JwtUser,
    @Param('partnerId') partnerId: string,
    @Query('mese') mese: string,
    @Query('formato') formato: string | undefined,
    @Res({ passthrough: true }) res: RispostaHttp,
  ) {
    const dati = await this.invoicesService.recap(user, partnerId, mese);
    if (formato !== 'html') return dati;
    // Si apre nel browser invece di scaricarsi: si guarda prima di mandarlo.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return this.invoicesService.recapHtml(dati);
  }

  @Post('recap/:partnerId/invia')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Manda il recap del mese al partner, via AI Mail' })
  inviaRecap(
    @CurrentUser() user: JwtUser,
    @Param('partnerId') partnerId: string,
    @Body() body: { mese: string; a?: string },
  ) {
    return this.invoicesService.inviaRecap(user, partnerId, body.mese, body.a);
  }

  @Post('generate')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Genera la fattura del periodo (somma delle consegne da fatturare)' })
  generate(@Body() body: { partnerId: string; periodStart: string; periodEnd: string }) {
    return this.invoicesService.generate(body.partnerId, body.periodStart, body.periodEnd);
  }

  @Post('webhook/paid')
  @Public()
  @UseGuards(WebhookApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({
    summary:
      'Webhook (x-api-key): un sistema esterno segnala che una fattura è pagata. Body: { id | number, paidAt? }',
  })
  markPaidWebhook(@Body() body: { id?: string; number?: string; paidAt?: string }) {
    return this.invoicesService.markPaidByWebhook(body);
  }

  @Post(':id/reopen')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Riapre dallo storico (solo se non pagata): torna in bozza' })
  reopen(@Param('id') id: string) {
    return this.invoicesService.reopen(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Avanza il flusso: DRAFT -> ISSUED -> PAID' })
  updateStatus(@Param('id') id: string, @Body() body: { status: InvoiceStatus }) {
    return this.invoicesService.updateStatus(id, body.status);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
