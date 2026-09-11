import { Controller, ForbiddenException, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ⭐ 11/09/2026 — MERCE IN SEDE (richiesta utente: «una sezione stock dove mostri lo stock che un partner
 * o un valet ha in sede di consegna», con «prodotti da ritirare, prodotti in consegna, prodotti
 * consegnati»). Disegno rivisto dal custode UX&UI prima di scrivere una riga.
 *
 * DA DOVE VIENE IL NUMERO. Non da un magazzino: un magazzino con le sedi, qui, non esiste. `Product.stock`
 * è **un intero unico e globale**, senza luogo, senza partner, senza valet — e all'11/09 è valorizzato su
 * 7 prodotti in tutto, con 8 movimenti in tutto il database. Quindi la merce «in sede» si RICAVA dalle
 * consegne aperte, che è l'unico fatto osservabile: se una consegna esiste e non è ancora partita, quella
 * merce è dal partner; se è in viaggio, ce l'ha il valet.
 *
 * LE QUATTRO COLONNE, e perché sono quattro e non tre:
 *  · **da ritirare** — created, assigned, in_preparation, accepted → la tiene il PARTNER;
 *  · **in consegna** — in_delivery → la tiene il VALET (o il partner, sulle consegne da fornitore);
 *  · **in sospeso** — not_delivered → sta da qualche parte, e dove lo dice `productManagement`;
 *  · **consegnati** — delivered, delivered_time_to_approve, approved → non la tiene più nessuno.
 *
 * ⚠️ La quarta colonna l'ha imposta il custode UX ed è la più importante: la merce non consegnata è
 * esattamente quella che il pop-up del valet deve smistare. Senza una colonna sua resterebbe invisibile,
 * cioè proprio il buco che questa sezione dovrebbe chiudere.
 *
 * ⚠️ «Consegnati» NON è una giacenza, è un FLUSSO: cresce per sempre. Per questo ha un periodo, e il
 * periodo viaggia nella risposta perché l'intestazione lo scriva. Le prime tre colonne sono la fotografia
 * di adesso e il periodo non le tocca: mescolarle darebbe una colonna che non vuol dire niente.
 *
 * ⚠️ «Da ritirare» è un IMPEGNO, non una presenza fisica: un bouquet non esiste finché il fioraio non lo
 * fa. La pagina lo dichiara; se qualcuno la legge come inventario, sbaglia.
 */

/** Gli stati, raggruppati per «chi ha in mano la merce». Una lista sola, usata da SQL e da TypeScript. */
const FASI = {
  daRitirare: ['created', 'assigned', 'in_preparation', 'accepted'],
  inConsegna: ['in_delivery'],
  inSospeso: ['not_delivered'],
  consegnati: ['delivered', 'delivered_time_to_approve', 'approved'],
} as const;
/** Annullate, non accettate, invalidate: la merce non è mai partita o è già rientrata. Fuori conto. */
const TUTTE = [...FASI.daRitirare, ...FASI.inConsegna, ...FASI.inSospeso, ...FASI.consegnati];

/** Le destinazioni della merce non consegnata: sono i valori che il legacy scriveva in `productManagement`. */
export const DESTINAZIONI = ['returnToBoutique', 'keptInCar', 'deluxyWareHouse'] as const;

/**
 * ⭐⭐ 11/09/2026 (regola utente) — DUE PAGINE, NON UNA.
 *
 * «Qui vanno messi solo stock di consegne ancora da fare. La selezione delle date va fatta in ottica
 * prospettica: da oggi, domani o periodo personalizzato. Riguardo al passato fai una sezione storico.»
 *
 * La prima versione mescolava le due cose: nella stessa tabella la merce da consegnare domani e quella
 * di una consegna fallita l'anno scorso. Sono due domande diverse e si guardano in due momenti diversi:
 *  · **da fare** — che merce mi aspetta, oggi e nei prossimi giorni. Guarda AVANTI.
 *  · **storico** — che cosa è stato consegnato, e che cosa è rimasto per strada. Guarda INDIETRO.
 */
type Vista = 'daFare' | 'storico';
type Filtri = { da?: string; a?: string; q?: string; partnerId?: string; valetId?: string; vista?: Vista };

/**
 * ⭐⭐ 11/09/2026 (regola utente: «tutto ciò che è stato consegnato non deve essere da ritirare»).
 *
 * IL FATTO. «Da ritirare» e «in consegna» dicono dove sta la merce ADESSO. Ma una consegna del 27 luglio
 * ancora in stato «accettata» non è merce sul bancone: è una consegna che nessuno ha chiuso. Misurato
 * l'11/09 su tutto l'archivio: **1.014 pezzi su 1.654** in quelle due colonne avevano una data già
 * passata — quasi due terzi. Il caso che l'ha fatta scoprire: la #61910 di Lijoi Roma, 320 rose rosse
 * ferme dal 27 luglio, da sole il 98% del «da ritirare» di quel partner.
 *
 * LA REGOLA. Le colonne di «adesso» contano solo le consegne di oggi o dei giorni a venire. Le altre non
 * spariscono: si contano a parte come ARRETRATE, perché sono lavoro da chiudere, non merce da ritirare.
 * Nascondere un difetto non è lo stesso che risolverlo.
 */
const SOLO_DA_OGGI = Prisma.sql`d."date" >= CURRENT_DATE`;

/**
 * ⚠️⚠️ CHI HA IN MANO LA MERCE: UNA REGOLA SOLA, per il livello 1 e per il livello 2.
 *
 * Prima il livello 1 attribuiva col criterio giusto (il partner ha ciò che è sul suo bancone o che gli è
 * tornato indietro; il valet ciò che porta o che si è tenuto) e il livello 2 contava invece TUTTO ciò che
 * passava da quel partner. Risultato: la boutique diceva «in sospeso 3», ci entravi e i prodotti ne
 * sommavano quaranta. Un elenco che non fa il numero da cui sei partito toglie fiducia a tutta la pagina.
 */
function attribuzione(tipo: 'partner' | 'valet' | null, vista: Vista): Prisma.Sql {
  const daFare = vista !== 'storico';
  if (tipo === 'partner') {
    return daFare
      ? Prisma.sql`(
          d."status" IN (${Prisma.join(FASI.daRitirare.map((x) => Prisma.sql`${x}`), ', ')})
          OR (d."status" = 'in_delivery' AND COALESCE(d."deliveredByPartner", false))
        )`
      : Prisma.sql`(
          (d."status" = 'not_delivered' AND d."productManagement" = 'returnToBoutique')
          OR d."status" IN (${Prisma.join(FASI.consegnati.map((x) => Prisma.sql`${x}`), ', ')})
        )`;
  }
  if (tipo === 'valet') {
    return daFare
      ? Prisma.sql`(d."status" = 'in_delivery' AND NOT COALESCE(d."deliveredByPartner", false))`
      : Prisma.sql`(
          (d."status" = 'not_delivered' AND d."productManagement" = 'keptInCar')
          OR d."status" IN (${Prisma.join(FASI.consegnati.map((x) => Prisma.sql`${x}`), ', ')})
        )`;
  }
  return Prisma.sql`TRUE`;
}

@Injectable()
export class MerceInSedeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Il periodo. Su «da fare» è prospettico e senza indicazione vale OGGI; su «storico» guarda indietro e
   * senza indicazione vale l'ultimo mese.
   */
  private periodo(f: Filtri): { da: Date; a: Date; etichetta: string } {
    const oggi = new Date();
    const g = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    if (f.da || f.a) {
      return {
        da: f.da ? new Date(`${f.da}T00:00:00.000Z`) : g(oggi),
        a: f.a ? new Date(`${f.a}T23:59:59.999Z`) : new Date(g(oggi).getTime() + 86_399_999),
        etichetta: `${f.da ?? '…'} → ${f.a ?? '…'}`,
      };
    }
    if (f.vista === 'storico') {
      const trenta = new Date(g(oggi).getTime() - 30 * 86_400_000);
      return { da: trenta, a: new Date(g(oggi).getTime() + 86_399_999), etichetta: 'ultimo mese' };
    }
    return { da: g(oggi), a: new Date(g(oggi).getTime() + 86_399_999), etichetta: 'oggi' };
  }

  /**
   * Il perimetro di chi guarda. È la stessa regola delle consegne, ripetuta qui perché questa lettura non
   * passa da `findAll`: un partner vede la sua merce, un valet la sua, l'ufficio tutto.
   *
   * ⚠️ Non si accetta `partnerId`/`valetId` da chi non è ufficio: cambiare un parametro nell'indirizzo
   * aprirebbe la merce di un concorrente.
   */
  /** Di che tipo è il detentore che stiamo guardando: decide la regola di attribuzione. */
  private tipoDetentore(user: JwtUser, f: Filtri): 'partner' | 'valet' | null {
    if (user.role === Role.PARTNER) return 'partner';
    if (user.role === Role.VALET) return 'valet';
    if (f.partnerId) return 'partner';
    if (f.valetId) return 'valet';
    return null;
  }

  private perimetro(user: JwtUser, f: Filtri): Prisma.Sql {
    if (user.role === Role.PARTNER) {
      if (!user.partnerId) throw new ForbiddenException('Nessun partner collegato a questo utente');
      return Prisma.sql`d."partnerId" = ${user.partnerId}`;
    }
    if (user.role === Role.VALET) {
      if (!user.valetId) throw new ForbiddenException('Nessun valet collegato a questo utente');
      return Prisma.sql`d."valetId" = ${user.valetId}`;
    }
    const pezzi: Prisma.Sql[] = [];
    if (f.partnerId) pezzi.push(Prisma.sql`d."partnerId" = ${f.partnerId}`);
    if (f.valetId) pezzi.push(Prisma.sql`d."valetId" = ${f.valetId}`);
    return pezzi.length ? Prisma.join(pezzi, ' AND ') : Prisma.sql`TRUE`;
  }

  /** Le quattro somme, scritte una volta sola. */
  private somme() {
    const somma = (stati: readonly string[], soloDaOggi = false) =>
      Prisma.sql`SUM(CASE WHEN d."status" IN (${Prisma.join(stati.map((s) => Prisma.sql`${s}`), ', ')})${soloDaOggi ? Prisma.sql` AND ${SOLO_DA_OGGI}` : Prisma.empty} THEN dp."quantity" ELSE 0 END)::int`;
    return {
      daRitirare: somma(FASI.daRitirare, true),
      inConsegna: somma(FASI.inConsegna, true),
      inSospeso: somma(FASI.inSospeso),
      consegnati: somma(FASI.consegnati),
    };
  }

  /** Il periodo si applica a TUTTE le fasi: su «da fare» è la finestra prospettica, su «storico» quella passata. */
  private dentroIlPeriodo(p: { da: Date; a: Date }): Prisma.Sql {
    return Prisma.sql`d."date" >= ${p.da} AND d."date" <= ${p.a}`;
  }

  /**
   * ⭐ 11/09/2026 (regola utente: «cancellazione richiesta si indicano a parte») — I CONTATORI.
   *
   * Tre cose che NON stanno nelle colonne, e ognuna per una ragione sua:
   *  · **cancellazione richiesta** — la merce sta ancora da qualche parte, ma lo stato precedente non è
   *    più leggibile: non si sa se è in negozio o già sul mezzo. Metterla in una colonna vorrebbe dire
   *    scegliere al posto dei fatti; qui si dichiara e basta, in attesa che l'ufficio decida.
   *  · **arretrate** — consegne mai chiuse con data passata: lavoro da fare, non merce da ritirare.
   *  · **destinazione da stabilire** — merce non consegnata di cui nessuno ha detto dove sia finita.
   *
   * ⚠️ Rispettano il perimetro di chi guarda e la ricerca: se no le pillole e la tabella parlerebbero
   * di due popolazioni diverse.
   */
  private async contatori(user: JwtUser, f: Filtri) {
    const inLista = (stati: readonly string[]) => Prisma.join(stati.map((x) => Prisma.sql`${x}`), ', ');
    const conta = (dove: Prisma.Sql) => this.prisma.$queryRaw<{ pezzi: number; consegne: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(dp."quantity"), 0)::int AS pezzi, COUNT(DISTINCT d."id")::int AS consegne
      FROM platform."DeliveryProduct" dp
      JOIN platform."Delivery" d ON d."id" = dp."deliveryId"
      WHERE d."deletedAt" IS NULL AND dp."deletedAt" IS NULL
        AND ${dove}
        AND ${this.perimetro(user, f)}
        ${f.q ? Prisma.sql`AND COALESCE(dp."productName", '') ILIKE ${'%' + f.q + '%'}` : Prisma.empty}
    `);
    const num = (r: { pezzi: number; consegne: number }[]) => ({ pezzi: Number(r[0]?.pezzi ?? 0), consegne: Number(r[0]?.consegne ?? 0) });
    const [arretrate, daStabilire, cancellazioni] = await Promise.all([
      conta(Prisma.sql`d."status" IN (${inLista([...FASI.daRitirare, ...FASI.inConsegna])}) AND d."date" < CURRENT_DATE`),
      conta(Prisma.sql`d."status" IN (${inLista(FASI.inSospeso)})
        AND COALESCE(NULLIF(d."productManagement", ''), 'none') = 'none'
        AND d."date" >= ${new Date(Date.now() - 90 * 86400000)}`),
      conta(Prisma.sql`d."status" = 'cancellation_requested'`),
    ]);
    return {
      arretrate: num(arretrate),
      daStabilire: num(daStabilire),
      daStabilireGiorni: 90,
      cancellazioniRichieste: num(cancellazioni),
    };
  }

  /**
   * LIVELLO 1 (solo ufficio): chi ha la merce. Una riga per partner e una per valet.
   *
   * ⚠️ Non si somma tutto insieme: merce in venti negozi diversi non è un mucchio, e un totale unico non
   * avrebbe senso fisico. Il soggetto della riga è il DETENTORE.
   */
  async perDetentore(user: JwtUser, f: Filtri) {
    if (user.role !== Role.ADMIN && user.role !== Role.OPERATION) {
      throw new ForbiddenException('Questa vista è dell’ufficio: tu vedi la tua merce');
    }
    const p = this.periodo(f);
    const inLista = (stati: readonly string[]) => Prisma.join(stati.map((x) => Prisma.sql`${x}`), ', ');
    const periodoConsegnati = Prisma.sql`d."date" >= ${p.da} AND d."date" <= ${p.a}`;

    /**
     * ⚠️ LA MERCE SI ATTRIBUISCE A CHI CE L'HA IN MANO, non a chi compare sulla consegna.
     *  · da ritirare → sempre il PARTNER (è sul suo bancone, o lo deve preparare);
     *  · in consegna → il VALET, tranne sulle consegne «da fornitore», dove la porta il partner stesso;
     *  · in sospeso → dipende da dove il valet ha detto di averla messa (`productManagement`):
     *    riportata in boutique = partner, tenuta in auto = valet, magazzino Deluxy = nessuno dei due.
     * Senza questa distinzione una boutique si vedrebbe addosso merce che sta nel bagagliaio di qualcuno.
     */
    /**
     * ⚠️ IL PERIODO VALE PER TUTTE LE COLONNE, e la sezione decide QUALI colonne esistono.
     *
     * Prima il livello 1 ignorava entrambi: cambiando «oggi» in «domani» i numeri restavano identici, e
     * su «da fare» comparivano i consegnati, cioè il passato dentro la pagina del futuro. Una tabella che
     * non reagisce ai suoi stessi filtri insegna a non fidarsi dei filtri.
     */
    const dentro = this.dentroIlPeriodo(p);
    const daFare = (f.vista ?? 'daFare') !== 'storico';

    const partner = await this.prisma.$queryRaw<{ id: string; nome: string; daritirare: number; inconsegna: number; insospeso: number; consegnati: number }[]>(Prisma.sql`
      SELECT d."partnerId" AS id, MAX(pa."insegna") AS nome,
             SUM(CASE WHEN d."status" IN (${inLista(FASI.daRitirare)}) AND ${dentro} THEN dp."quantity" ELSE 0 END)::int AS daritirare,
             SUM(CASE WHEN d."status" IN (${inLista(FASI.inConsegna)}) AND d."deliveredByPartner" AND ${dentro} THEN dp."quantity" ELSE 0 END)::int AS inconsegna,
             SUM(CASE WHEN d."status" IN (${inLista(FASI.inSospeso)}) AND d."productManagement" = 'returnToBoutique' AND ${dentro} THEN dp."quantity" ELSE 0 END)::int AS insospeso,
             SUM(CASE WHEN d."status" IN (${inLista(FASI.consegnati)}) AND ${dentro} THEN dp."quantity" ELSE 0 END)::int AS consegnati
      FROM platform."DeliveryProduct" dp
      JOIN platform."Delivery" d ON d."id" = dp."deliveryId"
      LEFT JOIN platform."Partner" pa ON pa."id" = d."partnerId"
      WHERE d."deletedAt" IS NULL AND dp."deletedAt" IS NULL AND d."partnerId" IS NOT NULL
        AND ${this.perimetro(user, f)}
        AND ${attribuzione('partner', f.vista ?? 'daFare')}
        AND ${dentro}
        ${f.q ? Prisma.sql`AND COALESCE(dp."productName", '') ILIKE ${'%' + f.q + '%'}` : Prisma.empty}
      GROUP BY 1
      ORDER BY 3 DESC
      LIMIT 200
    `);

    const valet = await this.prisma.$queryRaw<{ id: string; nome: string; inconsegna: number; insospeso: number; consegnati: number }[]>(Prisma.sql`
      SELECT d."valetId" AS id,
             MAX(TRIM(COALESCE(v."firstName", '') || ' ' || COALESCE(v."lastName", ''))) AS nome,
             SUM(CASE WHEN d."status" IN (${inLista(FASI.inConsegna)}) AND NOT COALESCE(d."deliveredByPartner", false) AND ${dentro} THEN dp."quantity" ELSE 0 END)::int AS inconsegna,
             SUM(CASE WHEN d."status" IN (${inLista(FASI.inSospeso)}) AND d."productManagement" = 'keptInCar' AND ${dentro} THEN dp."quantity" ELSE 0 END)::int AS insospeso,
             SUM(CASE WHEN d."status" IN (${inLista(FASI.consegnati)}) AND ${dentro} THEN dp."quantity" ELSE 0 END)::int AS consegnati
      FROM platform."DeliveryProduct" dp
      JOIN platform."Delivery" d ON d."id" = dp."deliveryId"
      LEFT JOIN platform."Valet" v ON v."id" = d."valetId"
      WHERE d."deletedAt" IS NULL AND dp."deletedAt" IS NULL AND d."valetId" IS NOT NULL
        AND ${this.perimetro(user, f)}
        AND ${attribuzione('valet', f.vista ?? 'daFare')}
        AND ${dentro}
        ${f.q ? Prisma.sql`AND COALESCE(dp."productName", '') ILIKE ${'%' + f.q + '%'}` : Prisma.empty}
      GROUP BY 1
      ORDER BY 3 DESC
      LIMIT 200
    `);

    const magazzino = await this.prisma.$queryRaw<{ pezzi: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(dp."quantity"), 0)::int AS pezzi
      FROM platform."DeliveryProduct" dp
      JOIN platform."Delivery" d ON d."id" = dp."deliveryId"
      WHERE d."deletedAt" IS NULL AND dp."deletedAt" IS NULL
        AND d."status" IN (${inLista(FASI.inSospeso)}) AND d."productManagement" = 'deluxyWareHouse'
        AND ${this.perimetro(user, f)}
        ${f.q ? Prisma.sql`AND COALESCE(dp."productName", '') ILIKE ${'%' + f.q + '%'}` : Prisma.empty}
    `);

    const contatori = await this.contatori(user, f);

    const num = (v: unknown) => Number(v ?? 0);
    return {
      periodo: p.etichetta,
      righe: [
        ...partner.map((r) => ({ tipo: 'partner' as const, id: r.id, nome: r.nome ?? '—',
          daRitirare: num(r.daritirare), inConsegna: num(r.inconsegna), inSospeso: num(r.insospeso), consegnati: num(r.consegnati) })),
        ...valet.map((r) => ({ tipo: 'valet' as const, id: r.id, nome: r.nome || '—',
          daRitirare: 0, inConsegna: num(r.inconsegna), inSospeso: num(r.insospeso), consegnati: num(r.consegnati) })),
      ]
        .filter((r) => (daFare ? r.daRitirare + r.inConsegna > 0 : r.consegnati + r.inSospeso > 0))
        .sort((a, b) => (daFare
          ? (b.daRitirare + b.inConsegna) - (a.daRitirare + a.inConsegna)
          : (b.inSospeso + b.consegnati) - (a.inSospeso + a.consegnati))),
      magazzino: num(magazzino[0]?.pezzi),
      ...contatori,
    };
  }

  /**
   * LIVELLO 2: una riga per PRODOTTO, con le quattro quantità affiancate.
   *
   * È la forma che il custode UX ha imposto contro le «tre tabelle» della richiesta: la domanda vera è
   * «di quelle dodici rose, quante sono ancora in negozio e quante sono in giro?», e con tre tabelle
   * quella risposta costa due salti e due numeri da ricordare a memoria.
   */
  async perProdotto(user: JwtUser, f: Filtri) {
    const p = this.periodo(f);
    const s = this.somme();
    const righe = await this.prisma.$queryRaw<{
      nome: string; variante: string | null;
      daritirare: number; inconsegna: number; insospeso: number; consegnati: number;
      giacenza: number | null; controllata: boolean | null;
    }[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(dp."productName", ''), 'senza nome') AS nome,
             NULLIF(dp."variantName", '') AS variante,
             ${s.daRitirare} AS daritirare,
             ${s.inConsegna} AS inconsegna,
             ${s.inSospeso} AS insospeso,
             ${s.consegnati} AS consegnati,
             MAX(pr."stock")::int AS giacenza,
             BOOL_OR(pr."controlStock") AS controllata
      FROM platform."DeliveryProduct" dp
      JOIN platform."Delivery" d ON d."id" = dp."deliveryId"
      LEFT JOIN platform."Product" pr ON pr."id" = dp."productId"
      WHERE d."deletedAt" IS NULL AND dp."deletedAt" IS NULL
        AND d."status" IN (${Prisma.join(TUTTE.map((x) => Prisma.sql`${x}`), ', ')})
        AND ${this.perimetro(user, f)}
        AND ${attribuzione(this.tipoDetentore(user, f), f.vista ?? 'daFare')}
        ${f.q ? Prisma.sql`AND COALESCE(dp."productName", '') ILIKE ${'%' + f.q + '%'}` : Prisma.empty}
        AND (d."status" NOT IN (${Prisma.join(FASI.consegnati.map((x) => Prisma.sql`${x}`), ', ')})
             OR (d."date" >= ${p.da} AND d."date" <= ${p.a}))
      GROUP BY 1, 2
      HAVING ${s.daRitirare} + ${s.inConsegna} + ${s.inSospeso} + ${s.consegnati} > 0
      ORDER BY 5 DESC, 3 DESC, 1 ASC
      LIMIT 300
    `);
    const contatori = await this.contatori(user, f);
    return {
      periodo: p.etichetta,
      ...contatori,
      righe: righe.map((r) => ({
        nome: r.nome,
        variante: r.variante,
        daRitirare: Number(r.daritirare ?? 0),
        inConsegna: Number(r.inconsegna ?? 0),
        inSospeso: Number(r.insospeso ?? 0),
        consegnati: Number(r.consegnati ?? 0),
        // La giacenza si mostra SOLO dove è davvero governata: un flag senza numero non è una giacenza.
        giacenza: r.controllata && r.giacenza != null ? Number(r.giacenza) : null,
      })),
    };
  }

  /**
   * LIVELLO 3: le consegne dietro a un numero. Nessuna cifra senza l'elenco che la genera — se no è un
   * totale che nessuno può verificare.
   */
  async consegneDiProdotto(user: JwtUser, nome: string, fase: keyof typeof FASI, f: Filtri, variante?: string | null) {
    const stati = FASI[fase] ?? FASI.daRitirare;
    const p = this.periodo(f);
    const righe = await this.prisma.$queryRaw<{
      code: number; data: Date; stato: string; quantita: number;
      partner: string | null; valet: string | null; destinatario: string | null;
      luogo: string | null; destinazione: string | null;
    }[]>(Prisma.sql`
      SELECT d."code", d."date" AS data, d."status" AS stato, dp."quantity"::int AS quantita,
             pa."insegna" AS partner,
             NULLIF(TRIM(COALESCE(v."firstName", '') || ' ' || COALESCE(v."lastName", '')), '') AS valet,
             NULLIF(TRIM(COALESCE(d."recipientFirstName", '') || ' ' || COALESCE(d."recipientLastName", '')), '') AS destinatario,
             d."recipientPlace" AS luogo,
             d."productManagement" AS destinazione
      FROM platform."DeliveryProduct" dp
      JOIN platform."Delivery" d ON d."id" = dp."deliveryId"
      LEFT JOIN platform."Partner" pa ON pa."id" = d."partnerId"
      LEFT JOIN platform."Valet" v ON v."id" = d."valetId"
      WHERE d."deletedAt" IS NULL AND dp."deletedAt" IS NULL
        AND COALESCE(NULLIF(dp."productName", ''), 'senza nome') = ${nome}
        -- ⚠️ La variante fa parte della chiave anche qui: «Rosa rossa / stelo lungo» e «Rosa rossa /
        -- stelo corto» sono due righe diverse in tabella e devono restare due elenchi diversi.
        AND NULLIF(dp."variantName", '') IS NOT DISTINCT FROM ${variante ?? null}
        AND d."status" IN (${Prisma.join(stati.map((x) => Prisma.sql`${x}`), ', ')})
        ${fase === 'daRitirare' || fase === 'inConsegna' ? Prisma.sql`AND ${SOLO_DA_OGGI}` : Prisma.empty}
        AND ${this.perimetro(user, f)}
        AND ${attribuzione(this.tipoDetentore(user, f), f.vista ?? 'daFare')}
        ${stati === FASI.consegnati ? Prisma.sql`AND d."date" >= ${p.da} AND d."date" <= ${p.a}` : Prisma.empty}
      ORDER BY d."date" DESC
      LIMIT 100
    `);
    return righe.map((r) => ({ ...r, quantita: Number(r.quantita) }));
  }
}

@ApiTags('stock')
@ApiBearerAuth()
// ⚠️ Niente PROJECT_MANAGER: non accede alle consegne, e questa pagina è fatta di link alle consegne.
@Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER, Role.VALET)
@Controller('merce-in-sede')
export class MerceInSedeController {
  constructor(private readonly service: MerceInSedeService) {}

  @Get('detentori')
  @ApiOperation({ summary: 'Chi ha la merce: una riga per partner e per valet (solo ufficio)' })
  @ApiQuery({ name: 'da', required: false }) @ApiQuery({ name: 'a', required: false })
  detentori(@CurrentUser() user: JwtUser, @Query('da') da?: string, @Query('a') a?: string, @Query('q') q?: string) {
    return this.service.perDetentore(user, { da, a, q });
  }

  @Get()
  @ApiOperation({ summary: 'La merce per prodotto: da ritirare, in consegna, in sospeso, consegnati nel periodo' })
  @ApiQuery({ name: 'partnerId', required: false, description: 'Solo ufficio' })
  @ApiQuery({ name: 'valetId', required: false, description: 'Solo ufficio' })
  prodotti(
    @CurrentUser() user: JwtUser,
    @Query('da') da?: string, @Query('a') a?: string, @Query('q') q?: string,
    @Query('partnerId') partnerId?: string, @Query('valetId') valetId?: string,
  ) {
    return this.service.perProdotto(user, { da, a, q, partnerId, valetId });
  }

  @Get('consegne')
  @ApiOperation({ summary: 'Le consegne dietro a un numero: nessuna cifra senza il suo elenco' })
  consegne(
    @CurrentUser() user: JwtUser,
    @Query('prodotto') prodotto: string,
    @Query('fase') fase: 'daRitirare' | 'inConsegna' | 'inSospeso' | 'consegnati',
    @Query('da') da?: string, @Query('a') a?: string,
    @Query('partnerId') partnerId?: string, @Query('valetId') valetId?: string,
    @Query('variante') variante?: string,
  ) {
    return this.service.consegneDiProdotto(user, prodotto, fase, { da, a, partnerId, valetId }, variante || null);
  }
}

@Module({
  controllers: [MerceInSedeController],
  providers: [MerceInSedeService],
  exports: [MerceInSedeService],
})
export class MerceInSedeModule {}
