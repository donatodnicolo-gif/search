import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response as RispostaHttp } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { PaymentStatus, PaymentType, Role, SalaryDocumentType, SalaryStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/** Due decimali: gli importi si scrivono come si leggono. */
function arrotonda2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Quanto spetta al valet per una consegna, secondo il TIPO DI SERVIZIO.
 *
 * Gemella di `prezzoConsegna()` lato partner, ma il listino e' un altro:
 * `ValetService`, raggiunto da `Delivery.valetServiceId` — ⚠️ NON da
 * `serviceTypeId`. Cercando per `serviceTypeId` il listino non si trova mai:
 * su 38.524 consegne da pagare il conto usciva 0 su 0.
 *
 * I modelli (`ServiceType.pricingModel` del servizio del valet):
 *  - `A_ORA`       paga oraria x le ore, col minimo di ore del servizio.
 *  - `MAGAZZINO`   paga a pezzo x i pezzi movimentati (`salaryPerItem`).
 *  - gli altri     paga fissa del listino.
 * In tutti, i km oltre i inclusi si aggiungono a `extraKmPrice`.
 *
 * ⚠️ La paga scritta sulla consegna VINCE sempre: e' quanto gli e' stato
 * promesso quel giorno, e il listino di oggi non e' quello di allora.
 *
 * Torna `null` quando non e' determinabile: nessuna paga e nessun listino.
 * Sono 17.789 consegne, e dirlo e' meglio che pagarle zero.
 */
export type ConsegnaDaPagare = {
  valetSalary?: number | null;
  valetAdditionalPrice?: number | null;
  hours?: number | null;
  extraKm?: number | null;
  serviceType?: { pricingModel?: string | null; minHours?: number | null } | null;
  products?: { quantity?: number | null }[];
};
/**
 * Le regole che toccano la paga, importate dal legacy e MAI applicate finora.
 *
 * Sono due, diverse:
 *  - la REGOLA CARNET (`Delivery.deliveryRuleId`, 28 regole su 3.372 consegne):
 *    porta un plus/minus sulla paga e un `toPay = false` che dice di non
 *    pagare affatto quella consegna.
 *  - la REGOLA VALET (`Delivery.valetDeliveryRuleId`, 7 regole su 1.953
 *    consegne): un plus a scaglioni sul NUMERO DI RITIRI, nella forma
 *    `[{operator: 'equal'|'moreThan', pickUps, plusSalary}]`. Serve a pagare
 *    di piu' chi in un giro ritira in piu' posti.
 */
/**
 * Da quando in poi un buco di paga e' un problema da guardare.
 *
 * Gemella della soglia lato fatture. Qui l'arretrato e' ancora piu' netto:
 * l'ultima consegna non pagabile e' del 13 febbraio 2024, e i valet senza
 * listino sono account interni di chi consegnava di persona agli inizi
 * (sergio.deluxy@gmail.com, 1.201 consegne). Non e' una tariffa da decidere:
 * e' un capitolo chiuso.
 *
 * La soglia resta comunque viva: se domani nasce una consegna non pagabile,
 * quella si vede. Ignorare per sempre sarebbe cieco, ignorare il passato e'
 * solo ordinato.
 */
export const SOGLIA_ARRETRATO = new Date('2026-07-01T00:00:00.000Z');

/**
 * ⭐ LA REGOLA DEL GIRO (27/08, decisa dall'utente): consegne dello STESSO
 * valet, nello STESSO giorno e con lo STESSO DDT sono UN giro solo — si paga
 * UNA volta (la consegna principale) col plus a scaglioni della REGOLA VALET
 * sul numero di ritiri del giro; le altre si mostrano «nel giro» e non si
 * pagano. La principale e' quella con la paga scritta piu' alta: nel legacy
 * la paga del giro stava su una consegna sola (il #12701 ne aveva due per
 * lo stesso viaggio a Menaggio: 77,45 + 71,57 per un solo giro).
 *
 * Vale SOLO nello stesso giorno: lo stesso ordine consegnato in due giorni
 * sono due viaggi (regola del 26/08).
 */
export function giriPerDdt(
  deliveries: { id: string; valetId?: string | null; date: Date; ddtNumber?: string | null; valetSalary?: number | null; _count?: { pickups?: number } }[],
): Map<string, { principale: boolean; ritiri: number; ddt: string }> {
  const gruppi = new Map<string, typeof deliveries>();
  for (const d of deliveries) {
    const ddt = String(d.ddtNumber ?? '').trim();
    if (!ddt || !d.valetId) continue;
    const chiave = `${d.valetId}|${new Date(d.date).toISOString().slice(0, 10)}|${ddt}`;
    const g = gruppi.get(chiave) ?? [];
    g.push(d);
    gruppi.set(chiave, g);
  }
  const esiti = new Map<string, { principale: boolean; ritiri: number; ddt: string }>();
  for (const g of gruppi.values()) {
    if (g.length < 2) continue;
    const principale = [...g].sort((a, b) => (b.valetSalary ?? 0) - (a.valetSalary ?? 0))[0];
    // Una consegna del giro = un ritiro, piu' gli eventuali ritiri extra registrati.
    const ritiri = g.reduce((s, d) => s + Math.max(1, d._count?.pickups ?? 0), 0);
    for (const d of g) esiti.set(d.id, { principale: d.id === principale.id, ritiri, ddt: String(d.ddtNumber ?? '').trim() });
  }
  return esiti;
}

/**
 * ⭐ 27/08 (deciso dall'utente, caso 62372): una consegna NON CONSEGNATA resta
 * pagabile SOLO se il servizio del VALET e' a ora — l'ora e' stata lavorata
 * anche se la consegna non e' andata. Le altre non consegnate restano fuori.
 */
export function nonConsegnataPagabile(
  d: { status?: string | null; serviceType?: { pricingModel?: string | null } | null },
  listino: ListinoValet,
): boolean {
  if (d.status !== 'not_delivered') return true;
  const modello = listino?.serviceType?.pricingModel ?? d.serviceType?.pricingModel ?? '';
  return modello === 'A_ORA';
}

export type RegolaPaga = {

  valetPayAdjustment?: number | null;
  toPay?: boolean | null;
} | null;

export type RegolaValet = { tiers?: string | null; active?: boolean | null } | null;

/**
 * Il plus della regola valet, dato il numero di ritiri del giro.
 *
 * Gli scaglioni si leggono in ordine e vince il piu' generoso che combacia:
 * nel legacy convivono `equal` (esattamente N ritiri) e `moreThan` (piu' di N),
 * e con 3 ritiri possono combaciare entrambi.
 */
export function plusRitiri(regola: RegolaValet, ritiri: number): number {
  if (!regola?.tiers || regola.active === false) return 0;
  let scaglioni: { operator?: string; pickUps?: string | number; plusSalary?: string | number }[];
  try { scaglioni = JSON.parse(regola.tiers); } catch { return 0; }
  if (!Array.isArray(scaglioni)) return 0;
  let plus = 0;
  for (const s of scaglioni) {
    const n = Number(s.pickUps ?? 0);
    const p = Number(s.plusSalary ?? 0);
    if (!Number.isFinite(n) || !Number.isFinite(p)) continue;
    const combacia = s.operator === 'moreThan' ? ritiri > n : ritiri === n;
    if (combacia && p > plus) plus = p;
  }
  return plus;
}

export type ListinoValet = {

  salary?: number | null;
  salaryPerItem?: number | null;
  extraKmPrice?: number | null;
  serviceType?: { pricingModel?: string | null; minHours?: number | null } | null;
} | null;

/**
 * Sceglie il listino del valet quando la consegna non dice quale servizio ha
 * svolto (`valetServiceId` vuoto: 15.413 consegne, e nel legacy quella colonna
 * era vuota davvero — non e' un difetto d'importazione).
 *
 * ⚠️ Non e' un dato mancante: il valet **ha** il suo listino. Il servizio
 * scritto sulla consegna e' quello del PARTNER («Vendita Deluxy», «Servizio
 * Consegna Standard»: 30 voci, cosa ha comprato il cliente); il valet ha una
 * tassonomia sua, corta, di cosa ha FATTO — «Consegna Standard» e «Servizio a
 * Ora» coprono 239 valet su 243 listini. Leggendo la prima al posto della
 * seconda sembrava che mancasse tutto.
 *
 * La corrispondenza passa dal MODELLO DI PREZZO: una consegna a ore si paga col
 * listino a ore del valet, tutte le altre col suo listino a prezzo fisso. Se ne
 * ha uno solo, e' quello.
 *
 * Recupera 7.157 consegne che uscivano come «non pagabili».
 */
export function scegliListinoValet(
  d: { valetServiceId?: string | null; valetId?: string | null; serviceType?: { pricingModel?: string | null } | null },
  perId: Map<string, any>,
  perValet: Map<string, any[]>,
): any | null {
  // Se la consegna lo dice, si usa quello: e' la scelta fatta allora.
  //
  // ⚠️ Ma se quell'id non porta a niente NON ci si arrende: il riferimento e'
  // rotto (listino rifatto, valet cambiato), non e' il valet a non averne.
  // Arrendersi lasciava a paga zero consegne di valet che avevano il loro
  // listino sotto il naso — Acampora Vittorio ha «Consegna Standard = 6» e
  // usciva «nessuno applicabile».
  if (d.valetServiceId) {
    const indicato = perId.get(d.valetServiceId);
    if (indicato) return indicato;
  }

  const suoi = perValet.get(d.valetId ?? '') ?? [];

  if (!suoi.length) return null;
  if (suoi.length === 1) return suoi[0];

  const cercato = d.serviceType?.pricingModel === 'A_ORA' ? 'A_ORA' : 'PREZZO_FISSO';
  return suoi.find((l) => l.serviceType?.pricingModel === cercato && (l.salary ?? 0) > 0)
    ?? suoi.find((l) => l.serviceType?.pricingModel === cercato)
    ?? null;
}

export function pagaConsegna(

  d: ConsegnaDaPagare,
  listino: ListinoValet,
  regolaCarnet: RegolaPaga = null,
  regolaValet: RegolaValet = null,
  ritiri = 0,
): { amount: number; origine: 'consegna' | 'listino' } | null {
  // Una regola carnet che dice «non pagare» vince su tutto.
  if (regolaCarnet && regolaCarnet.toPay === false) return null;

  const extra = (d.valetAdditionalPrice ?? 0)
    + (regolaCarnet?.valetPayAdjustment ?? 0)
    + plusRitiri(regolaValet, ritiri);
  const arrotonda = (n: number) => Math.round(n * 100) / 100;
  // Un minus non puo' trasformarsi in un debito del valet verso di noi.
  const mai_negativo = (n: number) => Math.max(0, arrotonda(n));

  // Quanto gli e' stato promesso quel giorno: e' un fatto, non una stima.
  if ((d.valetSalary ?? 0) > 0) {
    return { amount: mai_negativo(d.valetSalary! + extra), origine: 'consegna' };
  }
  if (!listino) return null;


  // Il modello lo detta il servizio del VALET, non quello del partner: sono
  // due listini diversi sulla stessa consegna.
  const modello = listino.serviceType?.pricingModel ?? d.serviceType?.pricingModel ?? '';
  const perKm = (d.extraKm ?? 0) * (listino.extraKmPrice ?? 0);

  // Come lato partner: se il listino c'e', il suo numero e' la risposta anche
  // quando vale zero (esistono servizi inclusi, che il valet non fattura a
  // parte). «Non pagabile» resta solo quando il listino non c'e' affatto —
  // gestito sopra dal `if (!listino) return null`.
  if (modello === 'A_ORA') {
    const ore = Math.max(d.hours ?? 0, listino.serviceType?.minHours ?? d.serviceType?.minHours ?? 1);
    return { amount: mai_negativo((listino.salary ?? 0) * ore + perKm + extra), origine: 'listino' };
  }
  if (modello === 'MAGAZZINO') {
    const aPezzo = listino.salaryPerItem ?? 0;
    const pezzi = (d.products ?? []).reduce((s, p) => s + (p.quantity ?? 1), 0);
    return { amount: mai_negativo((listino.salary ?? 0) + aPezzo * pezzi + perKm + extra), origine: 'listino' };
  }
  return { amount: mai_negativo((listino.salary ?? 0) + perKm + extra), origine: 'listino' };
}


@Injectable()
export class SalariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  findAll(user: JwtUser, archived = false, filtri: {
    valetId?: string; stato?: string; dal?: string; al?: string; cerca?: string;
  } = {}) {
    const where: any = { archived };
    if (user.role === Role.VALET) where.valetId = user.valetId ?? '-';
    else if (filtri.valetId) where.valetId = filtri.valetId;
    if (filtri.stato) where.status = filtri.stato;
    // Periodo sovrapposto, non contenuto: uno stipendio 01/06–30/06 deve
    // uscire anche cercando dal 15/06.
    if (filtri.dal) where.periodEnd = { gte: new Date(filtri.dal) };
    if (filtri.al) where.periodStart = { lte: new Date(filtri.al) };
    if (filtri.cerca?.trim()) {
      const t = filtri.cerca.trim();
      where.OR = [
        { valet: { firstName: { contains: t, mode: 'insensitive' } } },
        { valet: { lastName: { contains: t, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.salary.findMany({
      where,
      include: {
        valet: { select: { id: true, firstName: true, lastName: true, hasVat: true } },
        receipts: true,
        claims: true,
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  /**
   * Il lavoro ancora da pagare, raggruppato per valet.
   *
   * È la domanda che la pagina Stipendi non sapeva rispondere: mostrava gli
   * stipendi già fatti, quindi la consegna di ieri non compariva finché
   * qualcuno non indovinava valet e periodo. Il lavoro da pagare non è uno
   * stipendio: è l'elenco delle consegne che uno stipendio non ce l'hanno.
   */
  async pending(user: JwtUser, opzioni: { valetId?: string; dal?: string; al?: string } = {}) {
    const where: any = { ...SalariesService.DA_PAGARE };
    if (user.role === Role.VALET) where.valetId = user.valetId ?? '-';
    else if (opzioni.valetId) where.valetId = opzioni.valetId;
    const data: any = {};
    if (opzioni.dal) data.gte = new Date(opzioni.dal);
    if (opzioni.al) data.lte = new Date(opzioni.al);
    if (Object.keys(data).length) where.date = data;

    const deliveries = await this.prisma.delivery.findMany({
      where,
      select: {
        id: true, valetId: true, valetServiceId: true, date: true, ddtNumber: true, status: true,
        valetSalary: true, valetAdditionalPrice: true, hours: true, extraKm: true,
        paymentOnDelivery: true, paymentAmount: true,
        serviceType: { select: { pricingModel: true, minHours: true } },
        // Le due regole che toccano la paga, e i ritiri del giro per gli scaglioni.
        deliveryRule: { select: { name: true, valetPayAdjustment: true, toPay: true } },
        valetDeliveryRule: { select: { tiers: true, active: true } },
        _count: { select: { pickups: true } },
      },
    });
    const listini = await this.listiniValet(deliveries);
    // ⭐ La regola del giro: stesso valet + giorno + DDT = una paga sola.
    const giri = giriPerDdt(deliveries as any);
    const regoleAssegnate = await this.regoleValetAssegnate(deliveries.map((d) => d.valetId!).filter(Boolean));

    type Riga = {
      valetId: string; deliveriesCount: number; grossAmount: number; cashDeductions: number;
      unpaidCount: number; ruleExcludedCount: number; fromListino: number; nelGiroCount: number; from: Date; to: Date;
    };
    const per = new Map<string, Riga>();
    let arretrato = 0;
    for (const d of deliveries) {
      if (!d.valetId) continue;
      const listino = scegliListinoValet(d as any, listini.perId, listini.perValet);
      // Non consegnata: si paga solo il servizio A ORA del valet.
      if (!nonConsegnataPagabile(d as any, listino)) continue;
      const giro = giri.get(d.id);
      const calcolo = giro && !giro.principale ? null : pagaConsegna(
        d as any,
        listino,
        (d as any).deliveryRule ?? null,
        (d as any).valetDeliveryRule ?? regoleAssegnate.get(d.valetId) ?? null,
        giro?.ritiri ?? (d as any)._count?.pickups ?? 0,
      );
      if (giro && !giro.principale) {
        // Nel giro di un'altra consegna: si conta, non si paga.
        const r0 = per.get(d.valetId) ?? {
          valetId: d.valetId, deliveriesCount: 0, grossAmount: 0, cashDeductions: 0,
          unpaidCount: 0, ruleExcludedCount: 0, fromListino: 0, nelGiroCount: 0, from: d.date, to: d.date,
        };
        r0.deliveriesCount++;
        r0.nelGiroCount++;
        if (d.paymentOnDelivery) r0.cashDeductions += d.paymentAmount ?? 0;
        if (d.date < r0.from) r0.from = d.date;
        if (d.date > r0.to) r0.to = d.date;
        per.set(d.valetId, r0);
        continue;
      }
      // Buco di paga su una consegna vecchia: arretrato, non lavoro aperto.
      if (!calcolo && !((d as any).deliveryRule?.toPay === false) && d.date < SOGLIA_ARRETRATO) {
        arretrato++;
        continue;
      }
      const r = per.get(d.valetId) ?? {

        valetId: d.valetId, deliveriesCount: 0, grossAmount: 0, cashDeductions: 0,
        unpaidCount: 0, ruleExcludedCount: 0, fromListino: 0, nelGiroCount: 0, from: d.date, to: d.date,
      };
      r.deliveriesCount++;
      if (calcolo) {
        r.grossAmount += calcolo.amount;
        if (calcolo.origine === 'listino') r.fromListino++;
        if (d.paymentOnDelivery) r.cashDeductions += d.paymentAmount ?? 0;
      } else if ((d as any).deliveryRule?.toPay === false) {
        // Non e' un buco: e' una decisione gia' presa. Una regola carnet che
        // dice di non pagare va contata a parte, o sembra un dato mancante.
        r.ruleExcludedCount++;
      } else r.unpaidCount++;
      if (d.date < r.from) r.from = d.date;
      if (d.date > r.to) r.to = d.date;
      per.set(d.valetId, r);
    }

    const valets = await this.prisma.valet.findMany({
      where: { id: { in: [...per.keys()] } },
      select: { id: true, firstName: true, lastName: true, hasVat: true },
    });
    const chi = new Map(valets.map((v) => [v.id, v]));

    const voci = [...per.values()]
      .map((r) => {
        const grossAmount = Math.round(r.grossAmount * 100) / 100;
        const cashDeductions = Math.round(r.cashDeductions * 100) / 100;
        const v = chi.get(r.valetId);
        return {
          valetId: r.valetId,
          valet: { id: r.valetId, firstName: v?.firstName ?? '', lastName: v?.lastName ?? '—', hasVat: v?.hasVat ?? false },
          deliveriesCount: r.deliveriesCount,
          unpaidCount: r.unpaidCount,
          ruleExcludedCount: r.ruleExcludedCount,
          fromListino: r.fromListino,
          grossAmount,
          cashDeductions,
          netAmount: Math.round((grossAmount - cashDeductions) * 100) / 100,
          from: r.from,
          to: r.to,
        };
      })
      .sort((a, b) => b.netAmount - a.netAmount);

    return {
      voci,
      totali: {
        valets: voci.length,
        deliveriesCount: voci.reduce((s, v) => s + v.deliveriesCount, 0),
        unpaidCount: voci.reduce((s, v) => s + v.unpaidCount, 0),
        ruleExcludedCount: voci.reduce((s, v) => s + v.ruleExcludedCount, 0),
        fromListino: voci.reduce((s, v) => s + v.fromListino, 0),
        grossAmount: Math.round(voci.reduce((s, v) => s + v.grossAmount, 0) * 100) / 100,
        cashDeductions: Math.round(voci.reduce((s, v) => s + v.cashDeductions, 0) * 100) / 100,
        netAmount: Math.round(voci.reduce((s, v) => s + v.netAmount, 0) * 100) / 100,
        /// Consegne senza paga piu' vecchie della soglia: messe da parte, non perse.
        arretrato,
        soglia: SOGLIA_ARRETRATO,
      },
    };
  }

  /** Le consegne da pagare di UN valet, una per una (per il dettaglio). */
  async pendingDetail(user: JwtUser, valetId: string, dal?: string, al?: string) {
    if (user.role === Role.VALET && user.valetId !== valetId) {
      throw new NotFoundException('Valet non trovato');
    }
    // ⭐ 26/08: il DETTAGLIO mostra tutte le consegne del periodo, non solo le
    // pagabili — quelle col flag «non pagabile» e le A ORA in attesa di
    // approvazione compaiono MARCATE (e non contate nei totali), come in
    // Fatturazione: una riga esclusa si vede col motivo, non sparisce.
    const where: any = { ...SalariesService.DA_PAGARE, valetId };
    delete where.payable;
    where.status = { in: ['delivered', 'approved', 'delivered_time_to_approve', 'not_delivered'] };
    const data: any = {};
    if (dal) data.gte = new Date(dal);
    if (al) data.lte = new Date(al);
    if (Object.keys(data).length) where.date = data;

    const deliveries = await this.prisma.delivery.findMany({
      where,
      select: {
        id: true, code: true, date: true, status: true, valetServiceId: true, valetId: true, payable: true, ddtNumber: true,
        valetSalary: true, valetAdditionalPrice: true, hours: true, extraKm: true,
        paymentOnDelivery: true, paymentAmount: true,
        recipientAddress: true,
        deliveryTimeFrom: true, deliveryTimeTo: true,
        serviceType: { select: { name: true, pricingModel: true, minHours: true } },
        // Le due regole che toccano la paga, e i ritiri del giro per gli scaglioni.
        deliveryRule: { select: { name: true, valetPayAdjustment: true, toPay: true } },
        valetDeliveryRule: { select: { tiers: true, active: true } },
        _count: { select: { pickups: true } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
    const listini = await this.listiniValet(deliveries);
    // ⭐ La regola del giro (solo sulle righe pagabili e consegnate).
    const giri = giriPerDdt(deliveries.filter((d) => d.payable !== false && d.status !== 'delivered_time_to_approve') as any);
    const regoleAssegnate = await this.regoleValetAssegnate([valetId]);
    return {
      // Anche nel dettaglio l'arretrato non si mostra: sarebbe un elenco di
      // consegne del 2021 in mezzo al lavoro di oggi.
      deliveries: deliveries.filter((d) => {
        // Non consegnata: nel conteggio resta solo il servizio A ORA del valet.
        if (d.status === 'not_delivered'
          && !nonConsegnataPagabile(d as any, scegliListinoValet(d as any, listini.perId, listini.perValet))) {
          return false;
        }
        // Le marcate (non pagabili, in attesa di approvazione) restano solo se
        // recenti: il passato escluso e' arretrato ordinato, non lavoro aperto.
        if ((d as any).payable === false || d.status === 'delivered_time_to_approve') {
          return d.date >= SOGLIA_ARRETRATO;
        }
        const c = pagaConsegna(
          d as any,
          scegliListinoValet(d as any, listini.perId, listini.perValet),
          (d as any).deliveryRule ?? null,
          (d as any).valetDeliveryRule ?? null,
          (d as any)._count?.pickups ?? 0,
        );
        return c || (d as any).deliveryRule?.toPay === false || d.date >= SOGLIA_ARRETRATO;
      }).map((d) => {
        // Consegna col flag «non pagabile» o A ORA in attesa di approvazione:
        // niente paga calcolata — la riga si mostra marcata, non si conta.
        const nonPagabile = (d as any).payable === false;
        const daApprovare = d.status === 'delivered_time_to_approve';
        const giro = giri.get(d.id);
        const nelGiro = !!giro && !giro.principale;
        const calcolo = nonPagabile || daApprovare || nelGiro ? null : pagaConsegna(
        d as any,
        scegliListinoValet(d as any, listini.perId, listini.perValet),
        (d as any).deliveryRule ?? null,
        (d as any).valetDeliveryRule ?? regoleAssegnate.get(valetId) ?? null,
        giro?.ritiri ?? (d as any)._count?.pickups ?? 0,
      );
        // Il plus/minus che la paga ha dentro: quello scritto sulla consegna
        // piu' l'aggiustamento della regola carnet e lo scaglione ritiri.
        const plusMinus = calcolo
          ? Math.round(((d.valetAdditionalPrice ?? 0)
              + ((d as any).deliveryRule?.valetPayAdjustment ?? 0)
              + plusRitiri((d as any).valetDeliveryRule ?? null, (d as any)._count?.pickups ?? 0)) * 100) / 100
          : 0;
        return {
          id: d.id, code: d.code, date: d.date, status: d.status,
          address: d.recipientAddress,
          orario: d.deliveryTimeFrom ? `${d.deliveryTimeFrom}${d.deliveryTimeTo ? '–' + d.deliveryTimeTo : ''}` : null,
          service: d.serviceType?.name ?? '—',
          cash: d.paymentOnDelivery ? (d.paymentAmount ?? 0) : 0,
          amount: calcolo?.amount ?? null,
          plusMinus,
          origine: calcolo?.origine ?? null,
          /// Esclusa da una regola carnet, non per un dato mancante.
          esclusaDaRegola: d.deliveryRule?.toPay === false,
          regola: d.deliveryRule?.toPay === false ? d.deliveryRule?.name ?? null : null,
          nonPagabile,
          daApprovare,
          /// Nel giro di un'altra consegna (stesso valet+giorno+DDT): la paga
          /// e' sulla principale, con lo scaglione ritiri della regola valet.
          nelGiro,
          giroDdt: nelGiro ? giro!.ddt : null,
          ritiriGiro: giro?.principale ? giro.ritiri : null,
        };
      }),
      troncato: deliveries.length === 500,
    };
  }

  /**
   * Il recap del periodo per un VALET: come quello dei partner in
   * Fatturazione, ma sull'altro verso del denaro — le consegne da pagare, coi
   * contanti trattenuti e il netto. Stampabile e mandabile via AI Mail.
   */
  async recap(user: JwtUser, valetId: string, dal?: string, al?: string) {
    const valet = await this.prisma.valet.findUnique({
      where: { id: valetId },
      select: { id: true, firstName: true, lastName: true, email: true, hasVat: true, city: true, withholdingPercent: true,
        fiscalCode: true, address: true, birthPlace: true, birthDate: true },
    });
    if (!valet) throw new NotFoundException('Valet non trovato');
    const dettaglio = await this.pendingDetail(user, valetId, dal, al);
    const pagabili = dettaglio.deliveries.filter((d) => d.amount != null && !d.esclusaDaRegola);
    const lordo = arrotonda2(pagabili.reduce((s, d) => s + (d.amount ?? 0), 0));
    // I contanti delle righe marcate (non pagabili / da approvare) non entrano
    // nel conto: quelle consegne non fanno parte del denaro di questo recap.
    const contanti = arrotonda2(dettaglio.deliveries
      .filter((d) => !(d as any).nonPagabile && !(d as any).daApprovare)
      .reduce((s, d) => s + d.cash, 0));
    // ⭐ 27/08: per i valet SENZA P.IVA il documento e' la ricevuta di
    // prestazione occasionale, e la % della scheda e' la QUOTA DEL TOTALE
    // trattata come RIMBORSO SPESE (non imponibile). Formula verificata sulle
    // ricevute vere del legacy (Kiyomi Kurihara, % 50: totale 156,70 =
    // rimborso 78,35 + netto 78,35, con lordo 97,94 e ritenuta 20% 19,59):
    //   rimborso   = perc% x totale
    //   nettoComp  = totale − rimborso
    //   lordo      = nettoComp ÷ 0,8   (gross-up della ritenuta d'acconto 20%)
    //   ritenuta   = lordo − nettoComp (la versa Deluxy all'erario, in piu')
    //   bonifico   = nettoComp + rimborso = TOTALE (il valet riceve il pieno)
    const ricevuta = !valet.hasVat
      ? (() => {
          const perc = valet.withholdingPercent ?? 0;
          const rimborso = arrotonda2((lordo * perc) / 100);
          const nettoCompenso = arrotonda2(lordo - rimborso);
          const corrispettivoLordo = arrotonda2(nettoCompenso / 0.8);
          return {
            percRimborso: perc,
            rimborso,
            corrispettivoLordo,
            ritenuta: arrotonda2(corrispettivoLordo - nettoCompenso),
            nettoCompenso,
            totaleBonifico: lordo,
            // Marca da bollo da 2 € sopra i 77,47 € di prestazione.
            bollo: corrispettivoLordo > 77.47,
          };
        })()
      : null;

    return {
      valet,
      periodo: { dal: dal ?? null, al: al ?? null },
      righe: dettaglio.deliveries,
      troncato: dettaglio.troncato,
      ricevuta,
      totali: {
        consegne: pagabili.length,
        nonPagabili: dettaglio.deliveries.length - pagabili.length,
        lordo,
        contanti,
        netto: arrotonda2(lordo - contanti),
      },
    };
  }

  /** Il recap del valet in HTML: una pagina sola, stampabile e leggibile in mail. */
  recapHtml(r: Awaited<ReturnType<SalariesService['recap']>>): string {
    const e = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' &euro;';
    const gg = (d: Date | string) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(d));
    const nome = `${r.valet.lastName} ${r.valet.firstName}`.trim();
    const periodo = [r.periodo.dal, r.periodo.al].filter(Boolean).map((x) => gg(x!)).join(' &rarr; ') || 'tutto il lavoro in attesa';

    const righe = r.righe.map((x) => `
      <tr${x.amount != null && !x.esclusaDaRegola ? '' : ' class="esclusa"'}>
        <td class="mono">${gg(x.date)}</td>
        <td class="mono num">#${x.code}</td>
        <td class="mono">${e(x.orario ?? '—')}</td>
        <td class="indirizzo">${e(x.address ?? '—')}</td>
        <td class="muted">${e(x.service)}</td>
        <td class="muted">${(x as any).nelGiro ? `Nel giro (DDT ${e((x as any).giroDdt ?? '')})` : (x as any).daApprovare ? 'In attesa di approvazione' : (x as any).nonPagabile ? 'No (non pagabile)' : x.esclusaDaRegola ? `No (${e(x.regola ?? 'regola')})` : x.amount != null ? 'S&igrave;' : 'No'}</td>
        <td class="num">${x.cash ? eur(x.cash) : '—'}</td>
        <td class="num">${x.amount != null ? eur(Math.round((x.amount - ((x as any).plusMinus ?? 0)) * 100) / 100) : '—'}</td>
        <td class="num">${(x as any).plusMinus ? ((x as any).plusMinus > 0 ? '+' : '&minus;') + eur(Math.abs((x as any).plusMinus)) : '—'}</td>
        <td class="num"><strong>${x.amount != null ? eur(x.amount) : '—'}</strong></td>
      </tr>`).join('');

    return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<title>Recap paghe — ${e(nome)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px; background: #F5F5F7; color: #1d1d1f;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .foglio { max-width: 820px; margin: 0 auto; background: #fff; border-radius: 14px;
    padding: 36px 40px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  h1 { margin: 0 0 2px; font-size: 24px; font-weight: 600; letter-spacing: -.025em; }
  .periodo { color: #6e6e73; margin: 0 0 24px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; color: #6e6e73; padding: 6px 8px; border-bottom: 1px solid #e5e5ea; }
  td { padding: 7px 8px; border-bottom: 1px solid #f2f2f4; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #6e6e73; }
  .indirizzo { max-width: 240px; font-size: 12.5px; }
  .esclusa td { color: #a1a1a6; }
  .totali { margin-top: 10px; width: auto; margin-left: auto; min-width: 280px; }
  .ricevuta-titolo { margin: 26px 0 4px; font-size: 15px; letter-spacing: -0.01em; }
  .totali td { border: 0; padding: 4px 8px; }
  .totali .finale td { border-top: 1px solid #1d1d1f; padding-top: 8px; font-weight: 600; font-size: 16px; }
  .nota { margin-top: 26px; font-size: 12px; color: #6e6e73; }
  @media print { body { background: #fff; padding: 0; } .foglio { box-shadow: none; border-radius: 0; } }
</style></head>
<body><div class="foglio">
  <h1>Recap paghe &mdash; ${e(nome)}</h1>
  <p class="periodo">${periodo}</p>
  <table>
    <thead><tr>
      <th>Data</th><th class="num">Consegna</th><th>Orario</th><th>Indirizzo</th><th>Servizio</th><th>Pagabile</th><th class="num">Contanti</th><th class="num">Paga</th><th class="num">Plus/minus</th><th class="num">Totale</th>
    </tr></thead>
    <tbody>${righe || '<tr><td colspan="8" class="muted">Nessuna consegna nel periodo.</td></tr>'}</tbody>
  </table>
  <table class="totali">
    <tr><td>${r.totali.consegne} consegne &mdash; lordo</td><td class="num">${eur(r.totali.lordo)}</td></tr>
    <tr><td>Contanti incassati alla consegna</td><td class="num">&minus;${eur(r.totali.contanti)}</td></tr>
    <tr class="finale"><td>Netto</td><td class="num">${eur(r.totali.netto)}</td></tr>
  </table>
  ${(r as any).ricevuta ? `
  <h3 class="ricevuta-titolo">Ricevuta di prestazione occasionale (senza P.IVA)</h3>
  <table class="totali">
    <tr><td>Rimborso spese (${e((r as any).ricevuta.percRimborso)}% del totale, non imponibile)</td><td class="num">${eur((r as any).ricevuta.rimborso)}</td></tr>
    <tr><td>Corrispettivo lordo</td><td class="num">${eur((r as any).ricevuta.corrispettivoLordo)}</td></tr>
    <tr><td>Ritenuta d'acconto (20%)</td><td class="num">&minus;${eur((r as any).ricevuta.ritenuta)}</td></tr>
    <tr><td>Netto compenso</td><td class="num">${eur((r as any).ricevuta.nettoCompenso)}</td></tr>
    <tr class="finale"><td>Totale bonifico (netto + rimborso)</td><td class="num">${eur((r as any).ricevuta.totaleBonifico)}</td></tr>
  </table>
  ${(r as any).ricevuta.bollo ? '<p class="nota">Prestazione sopra i 77,47 &euro;: la marca da bollo da 2,00 &euro; <strong>la applica il valet</strong> sulla ricevuta.</p>' : ''}
  <p class="nota">La ritenuta d'acconto la versa Deluxy all'erario; i contanti gi&agrave; incassati si scalano dal bonifico. In fondo a questa mail c'&egrave; la ricevuta da stampare e firmare.</p>` : ''}
  ${r.totali.nonPagabili ? `<p class="nota">${r.totali.nonPagabili} ${r.totali.nonPagabili === 1 ? 'consegna non &egrave; pagabile' : 'consegne non sono pagabili'} (senza tariffa, o esclusa da una regola carnet): restano in elenco, marcate.</p>` : ''}
  ${r.troncato ? '<p class="nota">Elenco troncato alle prime 500 consegne del periodo.</p>' : ''}
  <p class="nota">Documento di riepilogo, non &egrave; un cedolino. I nominativi dei destinatari non compaiono.</p>
</div></body></html>`;
  }

  /** Manda il recap paghe al valet, via AI Mail (stesso canale del recap partner). */
  /**
   * La RICEVUTA di prestazione occasionale in stile legacy (senza P.IVA):
   * stessa struttura dei PDF firmati dell'app attuale — intestazione del
   * valet, «Spett.le Deluxy», la Nota con le somme, la tabella, le tre
   * dichiarazioni e la firma. La marca da bollo LA APPLICA IL VALET.
   */
  ricevutaHtml(r: Awaited<ReturnType<SalariesService['recap']>>): string {
    const ric = (r as any).ricevuta as {
      percRimborso: number; rimborso: number; corrispettivoLordo: number;
      ritenuta: number; nettoCompenso: number; totaleBonifico: number; bollo: boolean;
    } | null;
    if (!ric) return '';
    const e = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const eur = (n: number) => '&euro; ' + n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const gg = (d: Date | string | null) => d ? new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)) : '';
    const nome = `${r.valet.lastName} ${r.valet.firstName}`.trim();
    const v = r.valet as any;
    // I giorni di prestazione: le giornate distinte delle consegne pagate.
    const giorni = new Set(r.righe.filter((x) => x.amount != null).map((x) => String(x.date).slice(0, 10))).size;
    const oggi = gg(new Date());
    return `
<div class="ricevuta">
  <p class="bollo-nota">(Marca da bollo di 2,00 euro, applicata dal valet, se prestazione superiore a euro 77,47)</p>
  <p><strong>${e(nome)}</strong><br>${e(v.fiscalCode ?? '')}<br>${e(v.address ?? '')}<br>${e(v.birthPlace ?? '')}${v.birthDate ? '&nbsp;&nbsp;' + gg(v.birthDate) : ''}</p>
  <p>Spett.le <strong>Deluxy</strong><br>Via Varesina 60<br>20156 Milano (MI)<br>P.IVA: 11453140961</p>
  <p><strong>Nota del ${oggi}</strong>${r.periodo.dal || r.periodo.al ? ` &mdash; periodo ${[r.periodo.dal, r.periodo.al].filter(Boolean).map((x) => gg(x!)).join(' &rarr; ')}` : ''}</p>
  <p>Il sottoscritto ${e(nome)} dichiara di ricevere la somma lorda di euro ${eur(ric.corrispettivoLordo)}.<br>
  Di cui euro ${eur(ric.rimborso)} a titolo di rimborso spese per l&rsquo;attivit&agrave; occasionale di collaborazione.<br>
  Per prestazioni per Deluxy per un totale di ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}.<br>
  Al suddetto importo lordo andr&agrave; detratta la ritenuta d&rsquo;acconto (20%) pari a ${eur(ric.ritenuta)},
  per un corrispettivo netto pagato pari a ${eur(ric.totaleBonifico)}.</p>
  <table class="conti">
    <tr><td>Corrispettivo lordo</td><td class="num">${eur(ric.corrispettivoLordo)}</td></tr>
    <tr><td>Ritenuta d&rsquo;acconto</td><td class="num">${eur(ric.ritenuta)}</td></tr>
    <tr><td>Importo Netto</td><td class="num">${eur(ric.nettoCompenso)}</td></tr>
    <tr><td>Rimborsi</td><td class="num">${eur(ric.rimborso)}</td></tr>
    <tr class="finale"><td>Totale Bonifico</td><td class="num">${eur(ric.totaleBonifico)}</td></tr>
  </table>
  <p><strong>DICHIARA INOLTRE</strong><br>sotto la propria responsabilit&agrave;:</p>
  <ul>
    <li>che la prestazione resa alla ditta ha carattere del tutto occasionale, non svolgendo il sottoscritto prestazione di lavoro autonomo con carattere di abitualit&agrave;;</li>
    <li>di non avere fruito nell&rsquo;anno, ai fini contributivi, della franchigia di &euro; 5.000 prevista dall&rsquo;art. 44 del D.L. 30 settembre 2003, n. 269;</li>
    <li>di non essere soggetto al regime Iva a norma dell&rsquo;ex art. 5, comma 2, D.P.R. 633/72.</li>
  </ul>
  <table class="firma"><tr><td>Data<br>${oggi}</td><td class="destra">In fede<br><br>____________________________<br>${e(nome)}</td></tr></table>
</div>`;
  }

  async inviaRecap(user: JwtUser, valetId: string, dal?: string, al?: string, aManuale?: string) {
    const r = await this.recap(user, valetId, dal, al);
    const destinatario = (aManuale ?? r.valet.email ?? '').trim();
    if (!destinatario) {
      throw new BadRequestException('Il valet non ha una email in anagrafica: aggiungila, o indicane una qui.');
    }
    if (!r.righe.length) {
      throw new BadRequestException('Niente da mandare: nessuna consegna nel periodo.');
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
    let res: Response;
    try {
      res = await fetch(`${url}/api/v1/invia`, {
        method: 'POST',
        headers: { 'x-api-key': chiave, 'x-utente': utente, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          a: destinatario,
          oggetto: `Recap paghe — ${r.valet.lastName} ${r.valet.firstName}`,
          // ⭐ 27/08: per i valet SENZA P.IVA in fondo alla mail c'e' la
          // RICEVUTA in stile legacy, da stampare e firmare (il bollo lo
          // applica il valet). Con P.IVA parte il solo recap.
          corpo: (() => {
            const base = this.recapHtml(r);
            const ricevuta = this.ricevutaHtml(r);
            if (!ricevuta) return base;
            const stile = `<style>
              .ricevuta { margin-top: 40px; padding-top: 24px; border-top: 2px solid #1d1d1f; page-break-before: always; }
              .ricevuta .bollo-nota { font-size: 11px; color: #6e6e73; }
              .ricevuta table.conti { margin: 14px 0; min-width: 320px; }
              .ricevuta table.conti td { padding: 4px 10px; border-bottom: 1px solid #e5e5ea; }
              .ricevuta table.conti .num { text-align: right; font-variant-numeric: tabular-nums; }
              .ricevuta table.conti .finale td { font-weight: 650; border-bottom: 0; }
              .ricevuta table.firma { width: 100%; margin-top: 28px; }
              .ricevuta table.firma .destra { text-align: right; }
            </style>`;
            return base.replace('</div></body></html>', `${stile}${ricevuta}</div></body></html>`);
          })(),
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new BadRequestException('AI Mail non risponde: la mail non è partita.');
    }
    const corpo = (await res.json().catch(() => null)) as { ok?: boolean; messaggio?: string } | null;
    if (!res.ok || !corpo?.ok) {
      throw new BadRequestException(corpo?.messaggio ?? `AI Mail risponde ${res.status}.`);
    }
    return { ok: true, a: destinatario, righe: r.righe.length, netto: r.totali.netto };
  }

  /**
   * Genera lo stipendio del periodo per un valet:

   * somma delle paghe delle consegne effettuate, meno i contanti
   * incassati alla consegna (pagamento alla consegna).
   * Documento: pro-forma fattura se il valet ha P.IVA,
   * altrimenti ricevuta con ritenuta.
   */
  async generate(valetId: string, periodStart: string, periodEnd: string) {
    const valet = await this.prisma.valet.findUnique({ where: { id: valetId } });
    if (!valet) throw new NotFoundException('Valet non trovato');

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        ...SalariesService.DA_PAGARE,
        valetId,
        date: { gte: new Date(periodStart), lte: new Date(periodEnd) },
      },
      include: {
        serviceType: { select: { pricingModel: true, minHours: true } },
        // Le due regole che toccano la paga, e i ritiri del giro per gli scaglioni.
        deliveryRule: { select: { name: true, valetPayAdjustment: true, toPay: true } },
        valetDeliveryRule: { select: { tiers: true, active: true } },
        _count: { select: { pickups: true } },
        products: { select: { quantity: true } },
      },
      orderBy: { date: 'asc' },
    });

    const listini = await this.listiniValet(deliveries);
    // ⭐ La regola del giro: una paga per (valet, giorno, DDT), scaglioni compresi.
    const giri = giriPerDdt(deliveries as any);
    const regoleAssegnate = await this.regoleValetAssegnate([valetId]);

    const lines: { deliveryId: string; date: Date; description: string | null; origin: string; amount: number }[] = [];
    const nonPagabili: { code: number; date: Date }[] = [];
    for (const d of deliveries) {
      const giro = giri.get(d.id);
      if (giro && !giro.principale) {
        // Nel giro di un'altra consegna: la paga sta sulla principale. La riga
        // a 0 la MARCA come pagata nel giro — senza, resterebbe «da pagare»
        // per sempre e ricomparirebbe a ogni conteggio.
        lines.push({
          deliveryId: d.id,
          date: d.date,
          description: `#${d.code} — nel giro (DDT ${giro.ddt})`,
          origin: 'giro',
          amount: 0,
        });
        continue;
      }
      const listino = scegliListinoValet(d as any, listini.perId, listini.perValet);
      // Non consegnata: entra nello stipendio solo il servizio A ORA del valet.
      if (!nonConsegnataPagabile(d as any, listino)) continue;
      const calcolo = pagaConsegna(
        d as any,
        listino,
        (d as any).deliveryRule ?? null,
        (d as any).valetDeliveryRule ?? regoleAssegnate.get(valetId) ?? null,
        giro?.ritiri ?? (d as any)._count?.pickups ?? 0,
      );
      if (!calcolo) {
        // Fuori dallo stipendio: una riga a 0 € direbbe al valet che quella
        // consegna non valeva niente, e non e' quello che si e' scoperto.
        nonPagabili.push({ code: d.code, date: d.date });
        continue;
      }
      lines.push({
        deliveryId: d.id,
        date: d.date,
        description: `#${d.code} ${d.recipientAddress ?? ''}${giro?.principale ? ` — giro di ${giro.ritiri} ritiri (DDT ${giro.ddt})` : ''}`.trim(),
        origin: calcolo.origine,
        amount: calcolo.amount,
      });
    }
    if (!lines.length) {
      throw new BadRequestException(
        nonPagabili.length
          ? `Nessuna consegna pagabile nel periodo: ${nonPagabili.length} senza paga né listino del valet.`
          : 'Nessuna consegna da pagare nel periodo.',
      );
    }

    const grossAmount = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    // I contanti incassati alla consegna li ha gia' in tasca: si scalano.
    const cashDeductions = Math.round(deliveries
      .filter((d) => d.paymentOnDelivery && lines.some((l) => l.deliveryId === d.id))
      .reduce((sum, d) => sum + (d.paymentAmount ?? 0), 0) * 100) / 100;

    const stipendio = await this.prisma.salary.create({
      data: {
        valetId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        grossAmount,
        cashDeductions,
        netAmount: Math.round((grossAmount - cashDeductions) * 100) / 100,
        documentType: valet.hasVat
          ? SalaryDocumentType.PROFORMA_INVOICE
          : SalaryDocumentType.WITHHOLDING_RECEIPT,
        status: SalaryStatus.DRAFT,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    // La consegna impara di essere stata pagata: e' la stessa colonna che
    // usava il legacy, e tenerla indietro vorrebbe dire avere due verita'.
    await this.prisma.delivery.updateMany({
      where: { id: { in: lines.map((l) => l.deliveryId) } },
      data: { paymentStatus: 'paid' },
    });

    return { ...stipendio, nonPagabili };
  }

  /**
   * Chi e' da pagare: consegnata, `payable`, non gia' pagata, e non gia'
   * dentro uno stipendio.
   *
   * ⚠️ `paymentStatus` e' il segnale del legacy («questa l'ho gia' pagata») e
   * non e' deducibile dalle righe: nello storico 9.106 consegne sono marcate
   * pagate e nessuno stipendio le cita, perche' gli stipendi non avevano righe.
   */
  private static readonly DA_PAGARE = {
    NOT: { valetId: null },
    // ⭐ «Consegna Partner» non e' una persona: e' il segnaposto delle consegne
    // che si e' fatto il partner. Sono 1.882, tutte a paga zero, e finivano nel
    // conto delle «non pagabili» come se mancasse un dato — mentre il dato c'e'
    // ed e' che non c'e' nessuno da pagare.
    valet: { placeholder: false },
    deletedAt: null,
    payable: true,

    // ⚠️ `delivered_time_approved` non esiste: in banca dati gli stati sono
    // `delivered_time_to_approve` (in attesa di approvazione) e `approved`
    // (approvata). Il valore sbagliato non dava errore, lasciava semplicemente
    // fuori dallo stipendio 550 consegne approvate e da pagare.
    //
    // `delivered_time_to_approve` resta fuori: aspetta ancora un via libera.
    // ⭐ 27/08 (deciso dall'utente, caso 62372): un servizio A ORA del valet
    // si paga anche se la consegna NON e' andata — l'ora e' stata lavorata.
    // 'not_delivered' entra qui e viene tenuto SOLO se il listino del valet
    // e' a ora (filtro in JS: valetServiceId non ha una relazione filtrabile).
    status: { in: ['delivered', 'approved', 'not_delivered'] },

    paymentStatus: { not: 'paid' },
    salaryLines: { none: {} },
  };

  /**
   * I listini valet che servono a queste consegne.
   *
   * ⚠️ Si arriva da `Delivery.valetServiceId`, che punta a un `ValetService` —
   * NON da `serviceTypeId`. Unendo per `serviceTypeId` il listino non si
   * trovava mai: su 38.524 consegne da pagare il conto usciva 0 su 0.
   */
  /**
   * La REGOLA VALET assegnata per valet (ValetDeliveryRuleValet): serve quando
   * la consegna non porta un `valetDeliveryRuleId` suo — le regole valgono per
   * il valet, non per la singola consegna.
   */
  private async regoleValetAssegnate(valetIds: string[]): Promise<Map<string, { tiers: string; active: boolean }>> {
    if (!valetIds.length) return new Map();
    const righe = await this.prisma.valetDeliveryRuleValet.findMany({
      where: { valetId: { in: [...new Set(valetIds)] }, valetDeliveryRule: { active: true } },
      select: { valetId: true, valetDeliveryRule: { select: { tiers: true, active: true } } },
    });
    const per = new Map<string, { tiers: string; active: boolean }>();
    for (const r of righe) if (!per.has(r.valetId)) per.set(r.valetId, r.valetDeliveryRule);
    return per;
  }

  private async listiniValet(deliveries: { valetServiceId: string | null; valetId?: string | null }[]) {
    const valetIds = [...new Set(deliveries.map((d) => d.valetId).filter(Boolean) as string[])];
    if (!valetIds.length) return { perId: new Map<string, any>(), perValet: new Map<string, any[]>() };
    // Tutti i listini dei valet coinvolti, non solo quelli citati dalle
    // consegne: servono anche per la scelta quando la consegna non dice quale.
    const righe = await this.prisma.valetService.findMany({
      where: { valetId: { in: valetIds } },
      include: { serviceType: { select: { pricingModel: true, minHours: true } } },
    });
    const perId = new Map(righe.map((r) => [r.id, r]));
    const perValet = new Map<string, any[]>();
    for (const r of righe) {
      const arr = perValet.get(r.valetId) ?? [];
      arr.push(r);
      perValet.set(r.valetId, arr);
    }
    return { perId, perValet };
  }



  /**
   * Avanzamento del flusso stipendi:
   * DRAFT -> SENT (invio: archivia + genera la ricevuta DA FIRMARE)
   * -> [il valet firma la ricevuta] -> RECEIPT_PENDING (ricevuta firmata, da approvare)
   * -> APPROVED (solo se la ricevuta e' firmata) -> PAID.
   */
  async updateStatus(id: string, status: SalaryStatus) {
    const salary = await this.prisma.salary.findUnique({
      where: { id },
      include: { receipts: true },
    });
    if (!salary) throw new NotFoundException('Stipendio non trovato');

    const data: any = { status };
    if (status === SalaryStatus.SENT) {
      // L'invio archivia lo stipendio e genera la ricevuta da far firmare al valet.
      data.sentAt = new Date();
      data.archived = true;
      if (salary.receipts.length === 0) {
        const count = await this.prisma.receipt.count();
        data.receipts = {
          create: {
            number: `RIC-${new Date().getFullYear()}-${count + 1}`,
            signed: false,
          },
        };
      }
    }
    if (status === SalaryStatus.APPROVED) {
      // Si approva solo dopo che il valet ha firmato la ricevuta.
      if (!salary.receipts.some((r) => r.signed)) {
        throw new BadRequestException('La ricevuta deve essere firmata prima dell approvazione');
      }
      data.approvedAt = new Date();
    }
    if (status === SalaryStatus.PAID) data.paidAt = new Date();
    const updated = await this.prisma.salary.update({ where: { id }, data });

    // Al pagamento: crea lo storico in Pagamenti (una sola volta, alla transizione a PAID).
    if (status === SalaryStatus.PAID && salary.status !== SalaryStatus.PAID) {
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      await this.prisma.payment.create({
        data: {
          valetId: salary.valetId,
          salaryId: salary.id,
          type: PaymentType.SALARY,
          amount: salary.netAmount,
          status: PaymentStatus.PAID,
          description: `Stipendio ${fmt(salary.periodStart)} – ${fmt(salary.periodEnd)}`,
        },
      });
    }
    return updated;
  }

  /** Riapre uno stipendio dall'archivio: torna in bozza tra gli attivi.
   *  Consentito solo se non è ancora stato pagato (stato finanziario). */
  async reopen(id: string) {
    const salary = await this.prisma.salary.findUnique({ where: { id } });
    if (!salary) throw new NotFoundException('Stipendio non trovato');
    if (salary.status === SalaryStatus.PAID) {
      throw new BadRequestException('Uno stipendio già pagato non può essere riaperto');
    }
    // Riaprendo si annulla anche la ricevuta generata: andrà rigenerata al nuovo invio.
    await this.prisma.receipt.deleteMany({ where: { salaryId: id } });
    return this.prisma.salary.update({
      where: { id },
      data: {
        archived: false,
        status: SalaryStatus.DRAFT,
        sentAt: null,
        approvedAt: null,
        paidAt: null,
      },
    });
  }
}

@ApiTags('salaries')
@ApiBearerAuth()
@Controller('salaries')
export class SalariesController {
  constructor(private readonly salariesService: SalariesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista stipendi (il valet vede i propri). archived=true per l archivio' })
  @ApiQuery({ name: 'archived', required: false })
  @ApiQuery({ name: 'valetId', required: false })
  @ApiQuery({ name: 'stato', required: false, description: 'DRAFT | SENT | RECEIPT_PENDING | APPROVED | PAID' })
  @ApiQuery({ name: 'dal', required: false })
  @ApiQuery({ name: 'al', required: false })
  @ApiQuery({ name: 'cerca', required: false, description: 'Nome o cognome del valet' })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('archived') archived?: string,
    @Query('valetId') valetId?: string,
    @Query('stato') stato?: string,
    @Query('dal') dal?: string,
    @Query('al') al?: string,
    @Query('cerca') cerca?: string,
  ) {
    return this.salariesService.findAll(user, archived === 'true', { valetId, stato, dal, al, cerca });
  }

  @Get('pending')
  @ApiOperation({ summary: 'Il lavoro ancora da pagare, per valet (consegne senza stipendio)' })
  @ApiQuery({ name: 'valetId', required: false })
  @ApiQuery({ name: 'dal', required: false })
  @ApiQuery({ name: 'al', required: false })
  pending(
    @CurrentUser() user: JwtUser,
    @Query('valetId') valetId?: string,
    @Query('dal') dal?: string,
    @Query('al') al?: string,
  ) {
    return this.salariesService.pending(user, { valetId, dal, al });
  }

  @Get('pending/:valetId')
  @ApiOperation({ summary: 'Le consegne da pagare di un valet, una per una' })
  @ApiQuery({ name: 'dal', required: false })
  @ApiQuery({ name: 'al', required: false })
  pendingDetail(
    @CurrentUser() user: JwtUser,
    @Param('valetId') valetId: string,
    @Query('dal') dal?: string,
    @Query('al') al?: string,
  ) {
    return this.salariesService.pendingDetail(user, valetId, dal, al);
  }

  @Get('ricevuta/:valetId')
  @ApiOperation({ summary: 'La ricevuta di prestazione occasionale (senza P.IVA) in stile legacy, HTML stampabile' })
  @ApiQuery({ name: 'dal', required: false })
  @ApiQuery({ name: 'al', required: false })
  async ricevuta(
    @CurrentUser() user: JwtUser,
    @Param('valetId') valetId: string,
    @Query('dal') dal: string | undefined,
    @Query('al') al: string | undefined,
    @Res({ passthrough: true }) res: RispostaHttp,
  ) {
    const dati = await this.salariesService.recap(user, valetId, dal, al);
    const corpo = this.salariesService.ricevutaHtml(dati);
    if (!corpo) throw new BadRequestException('Il valet ha la P.IVA: il suo documento e la pro-forma fattura, non la ricevuta.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Ricevuta — ${dati.valet.lastName} ${dati.valet.firstName}</title>
<style>
  body { margin: 0; padding: 32px; background: #F5F5F7; color: #1d1d1f; font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .foglio { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 14px; padding: 40px; }
  .ricevuta .bollo-nota { font-size: 11px; color: #6e6e73; }
  .ricevuta table.conti { margin: 14px 0; min-width: 320px; border-collapse: collapse; }
  .ricevuta table.conti td { padding: 4px 10px; border-bottom: 1px solid #e5e5ea; }
  .ricevuta table.conti .num { text-align: right; font-variant-numeric: tabular-nums; }
  .ricevuta table.conti .finale td { font-weight: 650; border-bottom: 0; }
  .ricevuta table.firma { width: 100%; margin-top: 36px; }
  .ricevuta table.firma .destra { text-align: right; }
  @media print { body { background: #fff; padding: 0; } .foglio { border-radius: 0; } }
</style></head><body><div class="foglio">${corpo}</div></body></html>`;
  }

  @Get('recap/:valetId')
  @ApiOperation({ summary: 'Il recap paghe del periodo per un valet (JSON, o HTML con formato=html)' })
  @ApiQuery({ name: 'dal', required: false })
  @ApiQuery({ name: 'al', required: false })
  @ApiQuery({ name: 'formato', required: false, description: 'html per il documento stampabile' })
  async recap(
    @CurrentUser() user: JwtUser,
    @Param('valetId') valetId: string,
    @Query('dal') dal: string | undefined,
    @Query('al') al: string | undefined,
    @Query('formato') formato: string | undefined,
    @Res({ passthrough: true }) res: RispostaHttp,
  ) {
    const dati = await this.salariesService.recap(user, valetId, dal, al);
    if (formato !== 'html') return dati;
    // Si apre nel browser invece di scaricarsi: si guarda prima di mandarlo.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return this.salariesService.recapHtml(dati);
  }

  @Post('recap/:valetId/invia')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Manda il recap paghe al valet, via AI Mail' })
  inviaRecap(
    @CurrentUser() user: JwtUser,
    @Param('valetId') valetId: string,
    @Body() body: { dal?: string; al?: string; a?: string },
  ) {
    return this.salariesService.inviaRecap(user, valetId, body?.dal, body?.al, body?.a);
  }


  @Post('generate')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Genera stipendio periodo (pro-forma o ricevuta ritenuta, contanti detratti)' })
  generate(
    @Body() body: { valetId: string; periodStart: string; periodEnd: string },
  ) {
    return this.salariesService.generate(body.valetId, body.periodStart, body.periodEnd);
  }

  @Post(':id/reopen')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Riapre dallo archivio (solo se non pagato): torna in bozza' })
  reopen(@Param('id') id: string) {
    return this.salariesService.reopen(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Avanza il flusso: DRAFT->SENT->RECEIPT_PENDING->APPROVED->PAID' })
  updateStatus(@Param('id') id: string, @Body() body: { status: SalaryStatus }) {
    return this.salariesService.updateStatus(id, body.status);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [SalariesController],
  providers: [SalariesService],
})
export class SalariesModule {}
