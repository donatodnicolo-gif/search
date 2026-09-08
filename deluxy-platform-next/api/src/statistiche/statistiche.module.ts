import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { FinanceModule, FinanceService } from '../finance/finance.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ⭐ 06/09/2026 — STATISTICHE (richiesta utente, disegno della giuria di tre
 * agenti: controller di gestione = KPI e periodi; architetto UX = pagina;
 * architetto performance = dove si calcola).
 *
 * Regole che questo modulo rispetta:
 *  - I periodi sono giorni civili di Europe/Rome sul campo `date`; il periodo
 *    corrente è PARZIALE e si confronta col precedente «a pari giorni
 *    trascorsi» (1–6 set vs 1–6 ago), mai parziale contro pieno; «anno prima»
 *    = stesse date un anno indietro (per la settimana: stessa settimana ISO,
 *    cioè −364 giorni). Le date effettive dei due intervalli si restituiscono.
 *  - Tutto ciò che è aritmetica sulle colonne sta in SQL, i due periodi in UNA
 *    query (bucket corrente/confronto), nessun `take`: si conta tutto il periodo.
 *  - Un KPI senza dato si ESCLUDE e si dichiara quante righe mancano: mai zero
 *    al posto di «non so». Ogni media porta la sua base.
 *  - Puntualità: fascia promessa = `date` + deliveryTimeFrom/To (ora di Roma,
 *    Postgres applica l'ora legale); in orario tra From−30′ e To+10′, ritardo
 *    oltre To+10′, anticipo prima di From−30′; senza deliveredAt o fascia
 *    valida la consegna «non è valutabile» e non entra nel tasso.
 *  - Fee e margine passano dall'UNICA formula della Finanza (`corrispettivi`),
 *    ma solo finché le righe sono ≤ 2.000 per periodo (misura di casa: 54k
 *    righe = 24 s). Oltre, il KPI è «n/d: periodo troppo ampio» finché non
 *    esisterà la tabella persistita `DeliveryEconomia` (proposta della giuria).
 */
type Periodo = 'oggi' | 'settimana' | 'mese' | 'mese-scorso' | 'trimestre' | 'anno';
type Confronto = 'precedente' | 'anno-prima';
type Intervallo = { da: string; a: string };
type Bucket = 'corrente' | 'confronto';
/** ⭐ 06/09/2026 (regola utente): filtri per tipologia di servizio, provincia (città) e uno o più partner. */
type Filtri = { serviceTypeId?: string | null; pricingModel?: string | null; provinceId?: string | null; partnerIds?: string[]; valetIds?: string[] };
const MODELLI = ['VENDITA', 'PREZZO_FISSO', 'A_ORA', 'MAGAZZINO', 'CORPORATE'];

const CONCLUSE = ['delivered', 'approved', 'delivered_time_to_approve', 'archived'];
const TOLLERANZA_RITARDO_MIN = 10;
const TOLLERANZA_ANTICIPO_MIN = 30;
const TETTO_RIGHE_ECONOMIA = 2000;

function giornoRoma(d = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d);
}
function daIso(s: string): Date { return new Date(`${s}T00:00:00.000Z`); }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function piuGiorni(s: string, n: number): string { const d = daIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function giorniFra(a: string, b: string): number { return Math.round((daIso(b).getTime() - daIso(a).getTime()) / 86400000) + 1; }
function menoUnAnno(s: string): string {
  const d = daIso(s); const y = d.getUTCFullYear() - 1;
  const t = new Date(Date.UTC(y, d.getUTCMonth(), Math.min(d.getUTCDate(), new Date(Date.UTC(y, d.getUTCMonth() + 1, 0)).getUTCDate())));
  return iso(t);
}
function fineMese(s: string): string { const d = daIso(s); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); }
function inizioMese(s: string): string { return s.slice(0, 8) + '01'; }

/** Il periodo corrente (parziale fino a oggi) e il suo confronto a pari giorni. */
export function intervalli(periodo: Periodo, confronto: Confronto, oggi = giornoRoma()): { corrente: Intervallo; confronto: Intervallo; giorni: number; pieno: boolean } {
  const d = daIso(oggi);
  let da: string; let a = oggi; let pieno = false;
  switch (periodo) {
    case 'oggi': da = oggi; break;
    case 'settimana': { const wd = (d.getUTCDay() + 6) % 7; da = piuGiorni(oggi, -wd); break; }
    case 'mese': da = inizioMese(oggi); break;
    case 'mese-scorso': { const primo = inizioMese(oggi); da = inizioMese(piuGiorni(primo, -1)); a = fineMese(da); pieno = true; break; }
    case 'trimestre': { const m = d.getUTCMonth(); da = iso(new Date(Date.UTC(d.getUTCFullYear(), m - (m % 3), 1))); break; }
    case 'anno': da = `${d.getUTCFullYear()}-01-01`; break;
    default: throw new BadRequestException('Periodo non valido');
  }
  const giorni = giorniFra(da, a);
  let cDa: string; let cA: string;
  if (confronto === 'anno-prima') {
    if (periodo === 'settimana') { cDa = piuGiorni(da, -364); cA = piuGiorni(cDa, giorni - 1); }
    else { cDa = menoUnAnno(da); cA = pieno ? fineMese(cDa) : menoUnAnno(a); }
  } else {
    switch (periodo) {
      case 'oggi': cDa = piuGiorni(da, -1); cA = cDa; break;
      case 'settimana': cDa = piuGiorni(da, -7); cA = piuGiorni(cDa, giorni - 1); break;
      case 'mese': { cDa = inizioMese(piuGiorni(da, -1)); cA = piuGiorni(cDa, giorni - 1); if (cA > fineMese(cDa)) cA = fineMese(cDa); break; }
      case 'mese-scorso': { cDa = inizioMese(piuGiorni(da, -1)); cA = fineMese(cDa); break; }
      case 'trimestre': { const q = daIso(da); cDa = iso(new Date(Date.UTC(q.getUTCFullYear(), q.getUTCMonth() - 3, 1))); cA = piuGiorni(cDa, giorni - 1); break; }
      case 'anno': cDa = menoUnAnno(da); cA = menoUnAnno(a); break;
      default: cDa = da; cA = a;
    }
  }
  return { corrente: { da, a }, confronto: { da: cDa, a: cA }, giorni, pieno };
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const media = (somma: number, n: number): number | null => (n > 0 ? Math.round((somma / n) * 100) / 100 : null);
const pct = (parte: number, tot: number): number | null => (tot > 0 ? Math.round((parte / tot) * 1000) / 10 : null);

@Injectable()
export class StatisticheService {
  constructor(private readonly prisma: PrismaService, private readonly finance: FinanceService) {}

  private bounds(i: Intervallo) { return { da: daIso(i.da), a: new Date(`${i.a}T23:59:59.999Z`) }; }

  async calcola(periodo: Periodo, confronto: Confronto, filtri: Filtri = {}) {
    const iv = intervalli(periodo, confronto);
    const c = this.bounds(iv.corrente); const p = this.bounds(iv.confronto);
    const bucket = Prisma.sql`CASE WHEN d."date" BETWEEN ${c.da} AND ${c.a} THEN 'corrente' ELSE 'confronto' END`;
    // I filtri entrano nella stessa WHERE di tutte le query: un solo criterio, mai due letture diverse.
    const partnerIds = (filtri.partnerIds ?? []).filter(Boolean);
    const filtroSql = Prisma.join([
      Prisma.sql`TRUE`,
      ...(filtri.serviceTypeId ? [Prisma.sql`d."serviceTypeId" = ${filtri.serviceTypeId}`] : []),
      // ⭐ 06/09/2026 (regola utente): la MACROTIPOLOGIA (vendita, prezzo fisso, a ora,
      // magazzino, aziendale), non il singolo servizio (es. «Chanel Roma a ora»).
      ...(filtri.pricingModel ? [Prisma.sql`d."serviceTypeId" IN (SELECT id FROM platform."ServiceType" WHERE "pricingModel" = ${filtri.pricingModel})`] : []),
      ...(filtri.provinceId ? [Prisma.sql`d."provinceId" = ${filtri.provinceId}`] : []),
      ...(partnerIds.length ? [Prisma.sql`d."partnerId" IN (${Prisma.join(partnerIds)})`] : []),
      ...((filtri.valetIds ?? []).filter(Boolean).length ? [Prisma.sql`d."valetId" IN (${Prisma.join((filtri.valetIds ?? []).filter(Boolean))})`] : []),
    ], ' AND ');
    const dove = Prisma.sql`d."deletedAt" IS NULL AND ((d."date" BETWEEN ${c.da} AND ${c.a}) OR (d."date" BETWEEN ${p.da} AND ${p.a})) AND ${filtroSql}`;
    const concl = Prisma.sql`d.status IN ('delivered','approved','delivered_time_to_approve','archived')`;
    const oraOk = Prisma.sql`d."deliveryTimeTo" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`;
    const daOk = Prisma.sql`d."deliveryTimeFrom" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`;
    // Fascia promessa in ora di Roma; fascia notturna (fine < inizio) finisce il giorno dopo.
    const fine = Prisma.sql`((d."date"::date + d."deliveryTimeTo"::time + CASE WHEN ${daOk} AND d."deliveryTimeTo"::time < d."deliveryTimeFrom"::time THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE 'Europe/Rome')`;
    const inizio = Prisma.sql`((d."date"::date + COALESCE(CASE WHEN ${daOk} THEN d."deliveryTimeFrom"::time END, d."deliveryTimeTo"::time)) AT TIME ZONE 'Europe/Rome')`;
    const consegnato = Prisma.sql`(d."deliveredAt" AT TIME ZONE 'UTC')`;
    const valutabile = Prisma.sql`(${concl} AND d."deliveredAt" IS NOT NULL AND ${oraOk})`;
    const tardi = Prisma.sql`(${valutabile} AND ${consegnato} > ${fine} + ${Prisma.raw(`interval '${TOLLERANZA_RITARDO_MIN} minutes'`)})`;
    const presto = Prisma.sql`(${valutabile} AND ${consegnato} < ${inizio} - ${Prisma.raw(`interval '${TOLLERANZA_ANTICIPO_MIN} minutes'`)})`;
    const tempoOk = Prisma.sql`(${concl} AND d."startedAt" IS NOT NULL AND d."deliveredAt" IS NOT NULL AND d."deliveredAt" > d."startedAt" AND d."deliveredAt" - d."startedAt" <= interval '12 hours')`;
    const prezzo = Prisma.sql`(COALESCE(d.price,0) + COALESCE(d."additionalPrice",0) + COALESCE(d."ruleAdjustment",0))`;
    const paga = Prisma.sql`(COALESCE(d."valetSalary",0) + COALESCE(d."valetAdditionalPrice",0))`;
    const leadOk = Prisma.sql`(d."date"::date >= (d."createdAt" AT TIME ZONE 'Europe/Rome')::date)`;

    const [perTipo, perStato, topPartner, topValet, topProvince] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${bucket} AS bucket, st."pricingModel" AS "serviceTypeId", st."pricingModel" AS nome, st."pricingModel" AS modello,
          count(*)::int AS totali,
          count(*) FILTER (WHERE ${concl})::int AS concluse,
          count(*) FILTER (WHERE d.status = 'not_delivered')::int AS non_consegnate,
          count(*) FILTER (WHERE d.status IN ('cancelled','invalidated','cancellation_requested'))::int AS annullate,
          count(*) FILTER (WHERE d.status = 'not_accepted')::int AS non_accettate,
          count(*) FILTER (WHERE d.status IN ('created','assigned','in_preparation','accepted','in_delivery'))::int AS aperte,
          sum(${prezzo}) FILTER (WHERE ${concl} AND ${prezzo} > 0)::float8 AS prezzo_somma,
          count(*) FILTER (WHERE ${concl} AND ${prezzo} > 0)::int AS prezzo_n,
          sum(${paga}) FILTER (WHERE ${concl} AND ${paga} > 0)::float8 AS paga_somma,
          count(*) FILTER (WHERE ${concl} AND ${paga} > 0)::int AS paga_n,
          sum(d."distanceKm") FILTER (WHERE ${concl} AND d."distanceKm" > 0)::float8 AS km_somma,
          count(*) FILTER (WHERE ${concl} AND d."distanceKm" > 0)::int AS km_n,
          count(*) FILTER (WHERE ${concl} AND d."extraOutOfCity")::int AS fuori_citta,
          count(*) FILTER (WHERE ${valutabile})::int AS punt_n,
          count(*) FILTER (WHERE ${tardi})::int AS ritardo,
          count(*) FILTER (WHERE ${presto})::int AS anticipo,
          sum(extract(epoch FROM ${consegnato} - ${fine}) / 60) FILTER (WHERE ${tardi})::float8 AS ritardo_min_somma,
          sum(extract(epoch FROM ${inizio} - ${consegnato}) / 60) FILTER (WHERE ${presto})::float8 AS anticipo_min_somma,
          count(*) FILTER (WHERE ${tempoOk})::int AS tempo_n,
          sum(extract(epoch FROM d."deliveredAt" - d."startedAt") / 60) FILTER (WHERE ${tempoOk})::float8 AS tempo_min_somma,
          count(*) FILTER (WHERE ${leadOk})::int AS lead_n,
          sum(d."date"::date - (d."createdAt" AT TIME ZONE 'Europe/Rome')::date) FILTER (WHERE ${leadOk})::float8 AS lead_somma
        FROM platform."Delivery" d
        JOIN platform."ServiceType" st ON st.id = d."serviceTypeId"
        WHERE ${dove}
        GROUP BY 1, 2`),
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${bucket} AS bucket, d.status AS stato, count(*)::int AS n
        FROM platform."Delivery" d WHERE ${dove} GROUP BY 1, 2`),
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${bucket} AS bucket, p.id, p.insegna AS nome, count(*)::int AS n,
          count(*) FILTER (WHERE ${concl})::int AS concluse,
          count(*) FILTER (WHERE ${valutabile})::int AS punt_n,
          count(*) FILTER (WHERE ${tardi})::int AS ritardo
        FROM platform."Delivery" d JOIN platform."Partner" p ON p.id = d."partnerId"
        WHERE ${dove} GROUP BY 1, 2, 3`),
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${bucket} AS bucket, v.id, (v."firstName" || ' ' || v."lastName") AS nome, count(*)::int AS n,
          count(*) FILTER (WHERE ${concl})::int AS concluse,
          count(*) FILTER (WHERE ${valutabile})::int AS punt_n,
          count(*) FILTER (WHERE ${tardi})::int AS ritardo
        FROM platform."Delivery" d JOIN platform."Valet" v ON v.id = d."valetId"
        WHERE ${dove} GROUP BY 1, 2, 3`),
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${bucket} AS bucket, pr.id, (pr.name || ' (' || pr.code || ')') AS nome, count(*)::int AS n,
          count(*) FILTER (WHERE ${concl})::int AS concluse,
          count(*) FILTER (WHERE ${valutabile})::int AS punt_n,
          count(*) FILTER (WHERE ${tardi})::int AS ritardo
        FROM platform."Delivery" d JOIN platform."Province" pr ON pr.id = d."provinceId"
        WHERE ${dove} GROUP BY 1, 2, 3`),
    ]);

    const riassunto = (righe: any[]) => {
      const t = { totali: 0, concluse: 0, nonConsegnate: 0, annullate: 0, nonAccettate: 0, aperte: 0, prezzoSomma: 0, prezzoN: 0, pagaSomma: 0, pagaN: 0, kmSomma: 0, kmN: 0, fuoriCitta: 0, puntN: 0, ritardo: 0, anticipo: 0, ritardoMinSomma: 0, anticipoMinSomma: 0, tempoN: 0, tempoMinSomma: 0, leadN: 0, leadSomma: 0 };
      for (const r of righe) {
        t.totali += num(r.totali); t.concluse += num(r.concluse); t.nonConsegnate += num(r.non_consegnate); t.annullate += num(r.annullate);
        t.nonAccettate += num(r.non_accettate); t.aperte += num(r.aperte); t.prezzoSomma += num(r.prezzo_somma); t.prezzoN += num(r.prezzo_n);
        t.pagaSomma += num(r.paga_somma); t.pagaN += num(r.paga_n); t.kmSomma += num(r.km_somma); t.kmN += num(r.km_n); t.fuoriCitta += num(r.fuori_citta);
        t.puntN += num(r.punt_n); t.ritardo += num(r.ritardo); t.anticipo += num(r.anticipo); t.ritardoMinSomma += num(r.ritardo_min_somma); t.anticipoMinSomma += num(r.anticipo_min_somma);
        t.tempoN += num(r.tempo_n); t.tempoMinSomma += num(r.tempo_min_somma); t.leadN += num(r.lead_n); t.leadSomma += num(r.lead_somma);
      }
      const inOrario = t.puntN - t.ritardo - t.anticipo;
      return {
        totali: t.totali, concluse: t.concluse, aperte: t.aperte,
        nonConsegnate: t.nonConsegnate, annullate: t.annullate, nonAccettate: t.nonAccettate,
        tassoNonConsegnate: pct(t.nonConsegnate, t.concluse + t.nonConsegnate),
        tassoAnnullate: pct(t.annullate, t.totali),
        prezzoMedio: media(t.prezzoSomma, t.prezzoN), prezzoN: t.prezzoN, prezzoSenza: t.concluse - t.prezzoN,
        pagaMedia: media(t.pagaSomma, t.pagaN), pagaN: t.pagaN,
        kmMedi: media(t.kmSomma, t.kmN), kmN: t.kmN, kmSenza: t.concluse - t.kmN,
        pctFuoriCitta: pct(t.fuoriCitta, t.concluse),
        puntualita: {
          valutabili: t.puntN, nonValutabili: t.concluse - t.puntN,
          inOrario, ritardo: t.ritardo, anticipo: t.anticipo,
          pctInOrario: pct(inOrario, t.puntN), pctRitardo: pct(t.ritardo, t.puntN), pctAnticipo: pct(t.anticipo, t.puntN),
          ritardoMedioMin: media(t.ritardoMinSomma, t.ritardo), anticipoMedioMin: media(t.anticipoMinSomma, t.anticipo),
        },
        tempoMedioMin: media(t.tempoMinSomma, t.tempoN), tempoN: t.tempoN,
        leadTimeGiorni: media(t.leadSomma, t.leadN), leadN: t.leadN,
      };
    };

    const perBucket = (righe: any[], b: Bucket) => righe.filter((r) => r.bucket === b);
    const tipi = new Map<string, { serviceTypeId: string; nome: string; modello: string; corrente: any[]; confronto: any[] }>();
    for (const r of perTipo) {
      const e = tipi.get(r.serviceTypeId) ?? { serviceTypeId: r.serviceTypeId, nome: r.nome, modello: r.modello, corrente: [] as any[], confronto: [] as any[] };
      e[r.bucket as Bucket].push(r);
      tipi.set(r.serviceTypeId, e);
    }
    const perTipologia = [...tipi.values()]
      .map((e) => ({ serviceTypeId: e.serviceTypeId, nome: e.nome, modello: e.modello, corrente: riassunto(e.corrente), confronto: riassunto(e.confronto) }))
      .sort((x, y) => y.corrente.totali - x.corrente.totali);

    const stati = new Map<string, { stato: string; corrente: number; confronto: number }>();
    for (const r of perStato) {
      const e = stati.get(r.stato) ?? { stato: r.stato, corrente: 0, confronto: 0 };
      e[r.bucket as Bucket] += num(r.n);
      stati.set(r.stato, e);
    }

    const classifica = (righe: any[]) => {
      const m = new Map<string, any>();
      for (const r of righe) {
        const e = m.get(r.id) ?? { id: r.id, nome: r.nome, corrente: 0, confronto: 0, concluse: 0, puntN: 0, ritardo: 0 };
        if (r.bucket === 'corrente') { e.corrente += num(r.n); e.concluse += num(r.concluse); e.puntN += num(r.punt_n); e.ritardo += num(r.ritardo); }
        else e.confronto += num(r.n);
        m.set(r.id, e);
      }
      const tutte = [...m.values()].filter((e) => e.corrente > 0).sort((x, y) => y.corrente - x.corrente);
      const tot = tutte.reduce((s, e) => s + e.corrente, 0);
      const top = tutte.slice(0, 10).map((e) => ({
        id: e.id, nome: e.nome, corrente: e.corrente, confronto: e.confronto, pctDelTotale: pct(e.corrente, tot),
        // Puntualità solo con base sufficiente (giuria: ≥ 20 valutabili), altrimenti n/d.
        pctInOrario: e.puntN >= 20 ? pct(e.puntN - e.ritardo, e.puntN) : null, puntN: e.puntN,
      }));
      return { top, altri: tutte.length - top.length, altriConsegne: tot - top.reduce((s, e) => s + e.corrente, 0), totale: tot };
    };

    const totCorrente = riassunto(perBucket(perTipo, 'corrente'));
    const totConfronto = riassunto(perBucket(perTipo, 'confronto'));
    const economia = await this.economia(iv.corrente, iv.confronto, totCorrente.concluse, totConfronto.concluse, filtri);
    const smistamento = await this.smistamento(iv.corrente, iv.confronto, filtri);
    const etichette = {
      serviceType: filtri.serviceTypeId ? await this.prisma.serviceType.findUnique({ where: { id: filtri.serviceTypeId }, select: { id: true, name: true } }) : null,
      pricingModel: filtri.pricingModel ?? null,
      province: filtri.provinceId ? await this.prisma.province.findUnique({ where: { id: filtri.provinceId }, select: { id: true, code: true, name: true } }) : null,
      partners: partnerIds.length ? await this.prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, insegna: true } }) : [],
      valets: (filtri.valetIds ?? []).length ? await this.prisma.valet.findMany({ where: { id: { in: filtri.valetIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    };

    return {
      generatoAlle: new Date().toISOString(),
      periodo: { chiave: periodo, ...iv.corrente, giorni: iv.giorni, pieno: iv.pieno },
      confronto: { tipo: confronto, ...iv.confronto, giorni: giorniFra(iv.confronto.da, iv.confronto.a) },
      regole: { tolleranzaRitardoMin: TOLLERANZA_RITARDO_MIN, tolleranzaAnticipoMin: TOLLERANZA_ANTICIPO_MIN, concluse: CONCLUSE, tettoRigheEconomia: TETTO_RIGHE_ECONOMIA },
      filtri: etichette,
      totale: { corrente: totCorrente, confronto: totConfronto },
      perTipologia,
      perStato: [...stati.values()].sort((x, y) => y.corrente - x.corrente),
      top: { partner: classifica(topPartner), valet: classifica(topValet), province: classifica(topProvince) },
      economia,
      smistamento,
    };
  }

  /**
   * ⭐ 08/09/2026 (regola utente: «in statistiche mostrami anche quanti prodotti vanno in
   * automatico e quanti sono inseriti manualmente»).
   *
   * Quante VENDITE si sono smistate da sole e quante le ha smistate una persona. È la
   * misura di quanto lavora l'automatismo — e quindi di quanto rendono le regole di
   * riconciliazione: ogni patto scritto sposta righe dalla colonna «a mano» a quella
   * «automatica», e qui lo si vede.
   *
   * Tre famiglie, non due, perché due mentirebbero:
   *  · AUTOMATICA — una regola ha scelto il partner: patto prodotto/provincia, listino
   *    del prodotto unico, lista di priorità, unico partner della provincia, categoria;
   *  · A MANO — l'automatismo si è fermato e decide l'ufficio: prodotto fuori catalogo,
   *    ordine estero, provincia scoperta, presa in mano;
   *  · FUORI SMISTAMENTO — non è mai passata di lì: ordini già evasi altrove e recuperi
   *    del registro. Contarli fra i «manuali» gonfierebbe il lavoro dell'ufficio di
   *    numeri che nessuno ha fatto (in 30 giorni sono 76 righe su 577).
   *
   * Il criterio è il MOTIVO dell'assegnazione, che lo smistamento scrive su ogni vendita.
   * Dove il motivo manca si conta il partner: con un partner e senza spiegazione la
   * vendita è comunque stata assegnata da qualcosa, e si dichiara «senza motivo».
   */
  private async smistamento(corrente: Intervallo, confronto: Intervallo, filtri: Filtri = {}) {
    const conta = async (iv: Intervallo) => {
      const b = this.bounds(iv);
      const righe = await this.prisma.$queryRaw<{ famiglia: string; motivo: string | null; n: number }[]>(Prisma.sql`
        SELECT
          CASE
            WHEN s."assignmentReason" ILIKE '%recupero registro%'
              OR s."assignmentReason" ILIKE '%già evaso%'
              OR s."assignmentReason" ILIKE '%ordine già evaso%' THEN 'fuori'
            WHEN s."assignmentReason" ILIKE '%a mano%'
              OR s."assignmentReason" ILIKE '%decide una persona%'
              OR s."assignmentReason" ILIKE '%presa in mano%'
              OR s."assignmentReason" ILIKE '%si gestisce%' THEN 'mano'
            WHEN s."partnerId" IS NULL THEN 'mano'
            ELSE 'auto'
          END AS famiglia,
          s."assignmentReason" AS motivo,
          COUNT(*)::int AS n
        FROM platform."Sale" s
        WHERE s."createdAt" >= ${b.da} AND s."createdAt" <= ${b.a}
          ${filtri.provinceId ? Prisma.sql`AND s."provinceId" = ${filtri.provinceId}` : Prisma.empty}
          ${(filtri.partnerIds ?? []).filter(Boolean).length ? Prisma.sql`AND s."partnerId" IN (${Prisma.join((filtri.partnerIds ?? []).filter(Boolean))})` : Prisma.empty}
        GROUP BY 1, 2`);
      const t = { auto: 0, mano: 0, fuori: 0, totale: 0 };
      const motivi = new Map<string, { famiglia: string; motivo: string; n: number }>();
      for (const r of righe) {
        const n = Number(r.n) || 0;
        t[r.famiglia as 'auto' | 'mano' | 'fuori'] += n;
        t.totale += n;
        // Il motivo per esteso è lunghissimo: si tiene la prima frase, che dice la regola.
        const testo = (r.motivo ?? '(senza motivo)').split(/[.:·]/)[0].trim().slice(0, 70) || '(senza motivo)';
        const g = motivi.get(testo) ?? { famiglia: r.famiglia, motivo: testo, n: 0 };
        g.n += n;
        motivi.set(testo, g);
      }
      return {
        ...t,
        // Sul totale che È passato dallo smistamento: i «fuori» non c'entrano.
        percentualeAuto: t.auto + t.mano > 0 ? Math.round((t.auto / (t.auto + t.mano)) * 1000) / 10 : 0,
        motivi: [...motivi.values()].sort((x, y) => y.n - x.n).slice(0, 12),
      };
    };
    const [c, p] = await Promise.all([conta(corrente), conta(confronto)]);
    return { corrente: c, confronto: p };
  }

  /**
   * ⭐ 06/09/2026 (regola utente): «consenti anche di aprire il dettaglio di
   * quelle in ritardo». Le consegne in RITARDO del periodo corrente, con gli
   * stessi filtri e la stessa regola della puntualità (fascia promessa in ora
   * di Roma, tolleranza +10′), dalla più in ritardo. Tetto 500 righe DICHIARATO
   * nel payload (`totale` dice quante sono davvero).
   */
  async ritardi(periodo: Periodo, confronto: Confronto, filtri: Filtri = {}, limite = 500) {
    const iv = intervalli(periodo, confronto);
    const c = this.bounds(iv.corrente);
    const partnerIds = (filtri.partnerIds ?? []).filter(Boolean);
    const filtroSql = Prisma.join([
      Prisma.sql`TRUE`,
      ...(filtri.serviceTypeId ? [Prisma.sql`d."serviceTypeId" = ${filtri.serviceTypeId}`] : []),
      ...(filtri.pricingModel ? [Prisma.sql`d."serviceTypeId" IN (SELECT id FROM platform."ServiceType" WHERE "pricingModel" = ${filtri.pricingModel})`] : []),
      ...(filtri.provinceId ? [Prisma.sql`d."provinceId" = ${filtri.provinceId}`] : []),
      ...(partnerIds.length ? [Prisma.sql`d."partnerId" IN (${Prisma.join(partnerIds)})`] : []),
      ...((filtri.valetIds ?? []).filter(Boolean).length ? [Prisma.sql`d."valetId" IN (${Prisma.join((filtri.valetIds ?? []).filter(Boolean))})`] : []),
    ], ' AND ');
    const concl = Prisma.sql`d.status IN ('delivered','approved','delivered_time_to_approve','archived')`;
    const oraOk = Prisma.sql`d."deliveryTimeTo" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`;
    const daOk = Prisma.sql`d."deliveryTimeFrom" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`;
    const fine = Prisma.sql`((d."date"::date + d."deliveryTimeTo"::time + CASE WHEN ${daOk} AND d."deliveryTimeTo"::time < d."deliveryTimeFrom"::time THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE 'Europe/Rome')`;
    const consegnato = Prisma.sql`(d."deliveredAt" AT TIME ZONE 'UTC')`;
    const tardi = Prisma.sql`(${concl} AND d."deliveredAt" IS NOT NULL AND ${oraOk} AND ${consegnato} > ${fine} + ${Prisma.raw(`interval '${TOLLERANZA_RITARDO_MIN} minutes'`)})`;
    const dove = Prisma.sql`d."deletedAt" IS NULL AND d."date" BETWEEN ${c.da} AND ${c.a} AND ${filtroSql} AND ${tardi}`;
    const [righe, conteggio] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT d.id, d.code, d."date", d."deliveryTimeFrom" AS "fasciaDa", d."deliveryTimeTo" AS "fasciaA", d."deliveredAt", d."startedAt", d.status,
          d."recipientAddress" AS indirizzo, d."pickupAddress" AS ritiro, d."distanceKm" AS km, d."ddtNumber" AS ddt,
          p.insegna AS partner, p.id AS "partnerId", (v."firstName" || ' ' || v."lastName") AS valet, v.id AS "valetId", st.name AS servizio, st."pricingModel" AS modello, pr.code AS provincia,
          round(extract(epoch FROM ${consegnato} - ${fine}) / 60)::int AS "ritardoMin"
        FROM platform."Delivery" d
        JOIN platform."ServiceType" st ON st.id = d."serviceTypeId"
        JOIN platform."Partner" p ON p.id = d."partnerId"
        LEFT JOIN platform."Valet" v ON v.id = d."valetId"
        LEFT JOIN platform."Province" pr ON pr.id = d."provinceId"
        WHERE ${dove}
        ORDER BY "ritardoMin" DESC
        LIMIT ${limite}`),
      this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM platform."Delivery" d WHERE ${dove}`),
    ]);
    return { periodo: { chiave: periodo, ...iv.corrente }, totale: conteggio[0]?.n ?? righe.length, mostrate: righe.length, limite, righe };
  }

  /**
   * Fee e margine dalla Finanza (una formula sola), ma solo entro il tetto di
   * righe: oltre, «n/d» col motivo — non un numero calcolato su una fetta.
   */
  private async economia(corrente: Intervallo, confronto: Intervallo, nCorrente: number, nConfronto: number, filtri: Filtri = {}) {
    if (nCorrente > TETTO_RIGHE_ECONOMIA || nConfronto > TETTO_RIGHE_ECONOMIA) {
      return { disponibile: false, motivo: `periodo troppo ampio (${Math.max(nCorrente, nConfronto)} consegne, tetto ${TETTO_RIGHE_ECONOMIA}): fee e margine si leggono in Finanza`, corrente: null, confronto: null };
    }
    const partnerIds = (filtri.partnerIds ?? []).filter(Boolean);
    const valetIds = (filtri.valetIds ?? []).filter(Boolean);
    const conFiltri = Boolean(filtri.serviceTypeId || filtri.pricingModel || filtri.provinceId || partnerIds.length || valetIds.length);
    const conto = async (iv: Intervallo) => {
      let righe = await this.finance.corrispettivi(iv.da, iv.a, { limite: 5000, soloVendite: true });
      if (conFiltri) {
        // Stesso filtro delle altre query: si tengono le righe delle consegne che lo passano.
        const ammesse = new Set((await this.prisma.delivery.findMany({
          where: {
            deletedAt: null, date: { gte: daIso(iv.da), lte: new Date(`${iv.a}T23:59:59.999Z`) },
            ...(filtri.serviceTypeId ? { serviceTypeId: filtri.serviceTypeId } : {}),
            ...(filtri.pricingModel ? { serviceType: { pricingModel: filtri.pricingModel } } : {}),
            ...(filtri.provinceId ? { provinceId: filtri.provinceId } : {}),
            ...(partnerIds.length ? { partnerId: { in: partnerIds } } : {}),
            ...(valetIds.length ? { valetId: { in: valetIds } } : {}),
          },
          select: { id: true },
        })).map((d) => d.id));
        righe = righe.filter((r) => ammesse.has(r.deliveryId));
      }
      const t = { righe: righe.length, venduto: 0, pagato: 0, fee: 0, margine: 0, valet: 0, conVenduto: 0, stimate: 0, anomalie: 0 };
      for (const r of righe) {
        t.venduto += r.saleValue; t.pagato += r.partnerPrice; t.fee += r.feeContract; t.margine += r.totalMargin; t.valet += r.deliveryCost;
        if (r.saleValue > 0) t.conVenduto++;
        if (r.vendutoStimato) t.stimate++;
        if (r.anomalia) t.anomalie++;
      }
      const r2 = (n: number) => Math.round(n * 100) / 100;
      return {
        righe: t.righe, conVenduto: t.conVenduto, stimate: t.stimate, anomalie: t.anomalie,
        venduto: r2(t.venduto), pagato: r2(t.pagato), fee: r2(t.fee), margine: r2(t.margine), valet: r2(t.valet),
        feeMedia: media(t.fee, t.righe), feePct: pct(t.fee, t.venduto),
        margineMedio: media(t.margine, t.righe), marginePct: pct(t.margine, t.venduto),
        vendutoMedio: media(t.venduto, t.conVenduto),
      };
    };
    const [c, p] = await Promise.all([conto(corrente), conto(confronto)]);
    return { disponibile: true, motivo: null, corrente: c, confronto: p };
  }
}

@ApiTags('statistiche')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION)
@Controller('statistiche')
export class StatisticheController {
  constructor(private readonly service: StatisticheService) {}

  @Get('ritardi')
  @ApiOperation({ summary: 'Le consegne in ritardo del periodo corrente (stessi filtri e stessa regola della puntualità), dalla più in ritardo' })
  ritardi(
    @Query('periodo') periodo?: string,
    @Query('confronto') confronto?: string,
    @Query('serviceTypeId') serviceTypeId?: string,
    @Query('provinceId') provinceId?: string,
    @Query('partnerIds') partnerIds?: string,
    @Query('pricingModel') pricingModel?: string,
    @Query('valetIds') valetIds?: string,
  ) {
    if (pricingModel && !MODELLI.includes(pricingModel)) throw new BadRequestException('pricingModel non valido');
    const vids = String(valetIds ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    const p = (periodo ?? 'mese') as Periodo;
    const c = (confronto ?? 'precedente') as Confronto;
    if (!['oggi', 'settimana', 'mese', 'mese-scorso', 'trimestre', 'anno'].includes(p)) throw new BadRequestException('periodo non valido');
    if (!['precedente', 'anno-prima'].includes(c)) throw new BadRequestException('confronto non valido');
    const ids = String(partnerIds ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    return this.service.ritardi(p, c, { serviceTypeId: serviceTypeId || null, pricingModel: pricingModel || null, provinceId: provinceId || null, partnerIds: ids, valetIds: vids });
  }

  @Get()
  @ApiOperation({ summary: 'KPI del periodo (oggi · settimana · mese · mese-scorso · trimestre · anno) con confronto (precedente | anno-prima), per tipologia di servizio' })
  @ApiQuery({ name: 'periodo', required: false })
  @ApiQuery({ name: 'confronto', required: false })
  @ApiQuery({ name: 'serviceTypeId', required: false })
  @ApiQuery({ name: 'pricingModel', required: false, description: 'macrotipologia: VENDITA | PREZZO_FISSO | A_ORA | MAGAZZINO | CORPORATE' })
  @ApiQuery({ name: 'provinceId', required: false })
  @ApiQuery({ name: 'partnerIds', required: false, description: 'id partner separati da virgola' })
  calcola(
    @Query('periodo') periodo?: string,
    @Query('confronto') confronto?: string,
    @Query('serviceTypeId') serviceTypeId?: string,
    @Query('provinceId') provinceId?: string,
    @Query('partnerIds') partnerIds?: string,
    @Query('pricingModel') pricingModel?: string,
    @Query('valetIds') valetIds?: string,
  ) {
    if (pricingModel && !MODELLI.includes(pricingModel)) throw new BadRequestException('pricingModel non valido');
    const vids = String(valetIds ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    const p = (periodo ?? 'mese') as Periodo;
    const c = (confronto ?? 'precedente') as Confronto;
    if (!['oggi', 'settimana', 'mese', 'mese-scorso', 'trimestre', 'anno'].includes(p)) throw new BadRequestException('periodo non valido');
    if (!['precedente', 'anno-prima'].includes(c)) throw new BadRequestException('confronto non valido');
    const ids = String(partnerIds ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    return this.service.calcola(p, c, { serviceTypeId: serviceTypeId || null, pricingModel: pricingModel || null, provinceId: provinceId || null, partnerIds: ids, valetIds: vids });
  }
}

@Module({
  imports: [FinanceModule],
  controllers: [StatisticheController],
  providers: [StatisticheService],
})
export class StatisticheModule {}
