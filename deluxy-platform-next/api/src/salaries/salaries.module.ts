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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { PaymentStatus, PaymentType, Role, SalaryDocumentType, SalaryStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
        id: true, valetId: true, valetServiceId: true, date: true,
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

    type Riga = {
      valetId: string; deliveriesCount: number; grossAmount: number; cashDeductions: number;
      unpaidCount: number; ruleExcludedCount: number; fromListino: number; from: Date; to: Date;
    };
    const per = new Map<string, Riga>();
    for (const d of deliveries) {
      if (!d.valetId) continue;
      const calcolo = pagaConsegna(
        d as any,
        scegliListinoValet(d as any, listini.perId, listini.perValet),
        (d as any).deliveryRule ?? null,
        (d as any).valetDeliveryRule ?? null,
        (d as any)._count?.pickups ?? 0,
      );
      const r = per.get(d.valetId) ?? {
        valetId: d.valetId, deliveriesCount: 0, grossAmount: 0, cashDeductions: 0,
        unpaidCount: 0, ruleExcludedCount: 0, fromListino: 0, from: d.date, to: d.date,
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
      },
    };
  }

  /** Le consegne da pagare di UN valet, una per una (per il dettaglio). */
  async pendingDetail(user: JwtUser, valetId: string, dal?: string, al?: string) {
    if (user.role === Role.VALET && user.valetId !== valetId) {
      throw new NotFoundException('Valet non trovato');
    }
    const where: any = { ...SalariesService.DA_PAGARE, valetId };
    const data: any = {};
    if (dal) data.gte = new Date(dal);
    if (al) data.lte = new Date(al);
    if (Object.keys(data).length) where.date = data;

    const deliveries = await this.prisma.delivery.findMany({
      where,
      select: {
        id: true, code: true, date: true, status: true, valetServiceId: true, valetId: true,
        valetSalary: true, valetAdditionalPrice: true, hours: true, extraKm: true,
        paymentOnDelivery: true, paymentAmount: true,
        recipientAddress: true,
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
    return {
      deliveries: deliveries.map((d) => {
        const calcolo = pagaConsegna(
        d as any,
        scegliListinoValet(d as any, listini.perId, listini.perValet),
        (d as any).deliveryRule ?? null,
        (d as any).valetDeliveryRule ?? null,
        (d as any)._count?.pickups ?? 0,
      );
        return {
          id: d.id, code: d.code, date: d.date, status: d.status,
          address: d.recipientAddress,
          service: d.serviceType?.name ?? '—',
          cash: d.paymentOnDelivery ? (d.paymentAmount ?? 0) : 0,
          amount: calcolo?.amount ?? null,
          origine: calcolo?.origine ?? null,
          /// Esclusa da una regola carnet, non per un dato mancante.
          esclusaDaRegola: d.deliveryRule?.toPay === false,
          regola: d.deliveryRule?.toPay === false ? d.deliveryRule?.name ?? null : null,
        };
      }),
      troncato: deliveries.length === 500,
    };
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

    const lines: { deliveryId: string; date: Date; description: string | null; origin: string; amount: number }[] = [];
    const nonPagabili: { code: number; date: Date }[] = [];
    for (const d of deliveries) {
      const calcolo = pagaConsegna(
        d as any,
        scegliListinoValet(d as any, listini.perId, listini.perValet),
        (d as any).deliveryRule ?? null,
        (d as any).valetDeliveryRule ?? null,
        (d as any)._count?.pickups ?? 0,
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
        description: `#${d.code} ${d.recipientAddress ?? ''}`.trim(),
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
    status: { in: ['delivered', 'approved'] },

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
  controllers: [SalariesController],
  providers: [SalariesService],
})
export class SalariesModule {}
