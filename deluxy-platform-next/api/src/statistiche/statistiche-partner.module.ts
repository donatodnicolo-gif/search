import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ⭐ 11/09/2026 — LE STATISTICHE DEL PARTNER (richiesta utente).
 *
 * «per i partner crea anche per loro una sezione statistiche dove possono vedere: tipologia di servizi
 * richiesti; fasce orarie con più consegne; giorni con più consegne; andamento vendite; prodotti più
 * venduti; indirizzi più serviti; luoghi (quindi hotel ecc) più serviti; clienti più serviti».
 *
 * DUE REGOLE PORTANO TUTTO IL DISEGNO.
 *
 * 1. **Si mostra solo ciò che il partner fa.** Chi ha solo servizi di vendita non ha fasce orarie, e
 *    vedersi un riquadro vuoto «Fasce orarie» fa pensare a un guasto. I riquadri sono legati ai servizi
 *    ABILITATI a listino (`PartnerService` → `ServiceType.pricingModel`), non a quello che è capitato:
 *    un partner di consegne senza consegne nel periodo scelto vede «nessuna consegna in questo periodo»,
 *    che è un'informazione, non l'assenza della sezione.
 *
 * 2. **Il partner vede SÉ STESSO.** Il `partnerId` non si prende mai dalla richiesta se chi chiama è un
 *    partner: viene dal token. L'ufficio può guardare le statistiche di un partner passandone l'id —
 *    serve per rispondere a chi chiede «quali hotel servo di più».
 *
 * ⚠️ I conteggi stanno in SQL (GROUP BY), non in JavaScript: sedicimila consegne non attraversano la rete
 * per essere contate qui. Ogni riquadro è una query sola, con lo stesso filtro di periodo.
 */

const CONSEGNA = ['PREZZO_FISSO', 'CORPORATE', 'MAGAZZINO'];
const A_ORA = ['A_ORA'];
const VENDITA = ['VENDITA'];
/** Le consegne che NON sono avvenute non raccontano dove si va: restano fuori da tutte le classifiche. */
const NON_FATTE = ['cancelled', 'cancelled_office', 'not_delivered', 'refused'];
/** Con 'ID' Postgres dà 1 = lunedì … 7 = domenica: l'ordine della settimana, non quello dell'alfabeto. */
const GIORNI_ISO = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

/** I modi di dire «prima» (regola utente, 11/09/2026: la scelta sta nei filtri). */
export type TipoConfronto = 'precedente' | 'anno' | 'personalizzato' | 'nessuno';

type Filtri = {
  da?: string; a?: string; serviceTypeId?: string; pricingModel?: string;
  confronto?: TipoConfronto; confrontoDa?: string; confrontoA?: string;
};
type Intervallo = { da: string; a: string };
type Riga = { nome: string; quantita: number; prima: number | null };

const daIso = (s: string) => new Date(`${s}T00:00:00.000Z`);
/** Il giorno DOPO quello indicato: gli intervalli si chiudono con «<», così il 31 entra tutto. */
const dopoIso = (s: string) => { const d = daIso(s); d.setUTCDate(d.getUTCDate() + 1); return d; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * I DUE TERMINI DI PARAGONE di un periodo (regola utente, 11/09/2026).
 *
 * - **precedente**: stessa lunghezza, finisce il giorno prima dell'inizio. Trenta giorni contro trenta,
 *   mai un mese in corso contro un mese pieno.
 * - **anno prima**: le stesse date dell'anno scorso. Per chi vende fiori o pasticceria la stagione conta
 *   più del mese appena passato: Natale si confronta con Natale.
 *
 * Senza due estremi non esiste un «prima»: si torna null, e chi legge lo vede scritto invece di trovarsi
 * accanto un numero inventato.
 */
function intervalliDiConfronto(da?: string, a?: string): { precedente: Intervallo | null; annoPrima: Intervallo | null } {
  if (!da || !a) return { precedente: null, annoPrima: null };
  const inizio = daIso(da);
  const fine = daIso(a);
  if (fine < inizio) return { precedente: null, annoPrima: null };
  const giorni = Math.round((fine.getTime() - inizio.getTime()) / 86400000) + 1;
  const finePrec = new Date(inizio); finePrec.setUTCDate(finePrec.getUTCDate() - 1);
  const iniPrec = new Date(finePrec); iniPrec.setUTCDate(iniPrec.getUTCDate() - (giorni - 1));
  const meno = (d: Date) => { const x = new Date(d); x.setUTCFullYear(x.getUTCFullYear() - 1); return x; };
  return {
    precedente: { da: iso(iniPrec), a: iso(finePrec) },
    annoPrima: { da: iso(meno(inizio)), a: iso(meno(fine)) },
  };
}

@Injectable()
export class StatistichePartnerService {
  constructor(private readonly prisma: PrismaService) {}

  /** I servizi che questo partner ha davvero a listino: decidono quali riquadri hanno senso. */
  private async modelliAbilitati(partnerId: string): Promise<string[]> {
    const righe = await this.prisma.partnerService.findMany({
      where: { partnerId },
      select: { serviceType: { select: { pricingModel: true } } },
    });
    return [...new Set(righe.map((r) => r.serviceType?.pricingModel).filter(Boolean) as string[])];
  }

  private dove(partnerId: string, f: Filtri): Prisma.DeliveryWhereInput {
    const w: Prisma.DeliveryWhereInput = {
      partnerId,
      deletedAt: null,
      status: { notIn: NON_FATTE },
    };
    if (f.da || f.a) {
      w.date = {
        ...(f.da ? { gte: new Date(`${f.da}T00:00:00.000Z`) } : {}),
        ...(f.a ? { lte: new Date(`${f.a}T23:59:59.999Z`) } : {}),
      };
    }
    if (f.serviceTypeId) w.serviceTypeId = f.serviceTypeId;
    if (f.pricingModel) w.serviceType = { pricingModel: f.pricingModel };
    return w;
  }

  /** Lo stesso filtro, in SQL: le query raw non possono riusare il `where` di Prisma. */
  private periodoSql(f: Filtri) {
    const pezzi: Prisma.Sql[] = [];
    if (f.da) pezzi.push(Prisma.sql`d."date" >= ${new Date(`${f.da}T00:00:00.000Z`)}`);
    if (f.a) pezzi.push(Prisma.sql`d."date" <= ${new Date(`${f.a}T23:59:59.999Z`)}`);
    if (f.serviceTypeId) pezzi.push(Prisma.sql`d."serviceTypeId" = ${f.serviceTypeId}`);
    return pezzi.length ? Prisma.sql` AND ${Prisma.join(pezzi, ' AND ')}` : Prisma.empty;
  }

  async perPartner(partnerId: string, f: Filtri) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, insegna: true },
    });
    if (!partner) throw new BadRequestException('Partner non trovato');

    const modelli = await this.modelliAbilitati(partnerId);
    const haConsegna = modelli.some((m) => CONSEGNA.includes(m));
    const haOra = modelli.some((m) => A_ORA.includes(m));
    const haVendita = modelli.some((m) => VENDITA.includes(m));
    const dove = this.dove(partnerId, f);
    const sql = this.periodoSql(f);
    const fatte = Prisma.sql`d."deletedAt" IS NULL AND d."status" NOT IN (${Prisma.join(NON_FATTE)})`;

    /**
     * ⭐ 11/09/2026 (regola utente): IL CONFRONTO COL PERIODO PRECEDENTE E CON L'ANNO PRIMA.
     *
     * «120 consegne» non dice niente da solo: dice qualcosa quando accanto c'è «erano 95». I due termini
     * di paragone sono quelli che si usano in azienda — il periodo appena passato (come sta andando adesso)
     * e le stesse date dell'anno scorso (come va rispetto alla stagione, che per i fiori e la pasticceria
     * conta più del mese precedente).
     *
     * ⚠️ Il confronto esiste solo se il periodo ha DUE ESTREMI. Su «Sempre» non c'è un «prima» con cui
     * fare i conti, e inventarne uno sarebbe peggio che non darlo: i riquadri lo dicono e basta.
     * ⚠️ Il periodo precedente ha la STESSA LUNGHEZZA e finisce il giorno prima dell'inizio: trenta giorni
     * contro trenta. Confrontare un mese in corso con un mese pieno è il modo classico di leggere un calo
     * che non esiste.
     */
    const tipo: TipoConfronto = f.confronto ?? 'precedente';
    const possibili = intervalliDiConfronto(f.da, f.a);
    const intervalloPrima: Intervallo | null =
      tipo === 'nessuno' ? null
      : tipo === 'anno' ? possibili.annoPrima
      : tipo === 'personalizzato' ? (f.confrontoDa && f.confrontoA ? { da: f.confrontoDa, a: f.confrontoA } : null)
      : possibili.precedente;

    // 1. TIPOLOGIA DI SERVIZI RICHIESTI, COI TRE PERIODI IN UNA QUERY SOLA.
    //    I tre conteggi si fanno con le somme condizionate, non con tre giri sul database: le righe da
    //    leggere sono le stesse, e leggerle tre volte costerebbe tre volte.
    const finestra = (iv: Intervallo | null) =>
      iv ? Prisma.sql`(d."date" >= ${daIso(iv.da)} AND d."date" < ${dopoIso(iv.a)})` : Prisma.sql`FALSE`;
    // Il «prima» di TUTTE le tabelle è uno solo: quello scelto nei filtri.
    const primaSql = finestra(intervalloPrima);
    const corrente = f.da || f.a
      ? Prisma.sql`(${f.da ? Prisma.sql`d."date" >= ${daIso(f.da)}` : Prisma.sql`TRUE`} AND ${f.a ? Prisma.sql`d."date" < ${dopoIso(f.a)}` : Prisma.sql`TRUE`})`
      : Prisma.sql`TRUE`;
    const perServizio = await this.prisma.$queryRaw<
      { sid: string | null; nome: string | null; modello: string | null; n: bigint; nprec: bigint; vend: number | null; vprec: number | null }[]
    >(Prisma.sql`
      SELECT d."serviceTypeId" AS sid, s."name" AS nome, s."pricingModel" AS modello,
             SUM(CASE WHEN ${corrente} THEN 1 ELSE 0 END)::bigint AS n,
             SUM(CASE WHEN ${primaSql} THEN 1 ELSE 0 END)::bigint AS nprec,
             SUM(CASE WHEN ${corrente} AND s."pricingModel" = 'VENDITA' THEN COALESCE(d."productValue", 0) ELSE 0 END)::float AS vend,
             SUM(CASE WHEN ${primaSql} AND s."pricingModel" = 'VENDITA' THEN COALESCE(d."productValue", 0) ELSE 0 END)::float AS vprec
      FROM platform."Delivery" d
      LEFT JOIN platform."ServiceType" s ON s."id" = d."serviceTypeId"
      WHERE d."partnerId" = ${partnerId} AND ${fatte}
        AND (${corrente} OR ${primaSql})
        ${f.serviceTypeId ? Prisma.sql`AND d."serviceTypeId" = ${f.serviceTypeId}` : Prisma.empty}
        ${f.pricingModel ? Prisma.sql`AND s."pricingModel" = ${f.pricingModel}` : Prisma.empty}
      GROUP BY 1, 2, 3
    `);
    const servizi = perServizio
      .map((r) => ({
        nome: r.nome ?? 'senza servizio',
        pricingModel: r.modello ?? null,
        quantita: Number(r.n),
        prima: intervalloPrima ? Number(r.nprec) : null,
      }))
      .filter((r) => r.quantita > 0 || (r.prima ?? 0) > 0)
      .sort((a, b) => b.quantita - a.quantita);
    const somma = (prendi: (r: (typeof perServizio)[number]) => number) => perServizio.reduce((s, r) => s + prendi(r), 0);
    const totale = somma((r) => Number(r.n));
    const confronto = {
      tipo,
      // Le date dei due modi automatici viaggiano lo stesso: servono a scrivere in chiaro nei filtri
      // con cosa si sta confrontando, senza farlo ricalcolare al browser.
      disponibili: possibili,
      periodo: intervalloPrima,
      totale: intervalloPrima ? somma((r) => Number(r.nprec)) : null,
      vendutoPrima: intervalloPrima ? somma((r) => r.vprec ?? 0) : null,
      venduto: somma((r) => r.vend ?? 0),
    };

    const vuoto: never[] = [];

    /**
     * ⭐ 11/09/2026 (regola utente: «il confronto va messo anche nelle varie tabelle») — UNA SOLA FORMA
     * DI CLASSIFICA, E PORTA IL PRIMA CON SÉ.
     *
     * Ogni riquadro è la stessa domanda su una colonna diversa: quante volte, e quante volte PRIMA. Si
     * fa con due somme condizionate sulle stesse righe — le righe del periodo scelto e quelle del periodo
     * di confronto, lette insieme — invece di due giri sul database per ogni riquadro.
     *
     * ⚠️ Le voci che esistono SOLO nel periodo di confronto restano in classifica con zero: «al Four
     * Seasons ci andavi 40 volte e ora nessuna» è esattamente ciò che un confronto deve far vedere, e
     * nasconderle racconterebbe solo le buone notizie.
     */
    const classifica = async (
      chiave: Prisma.Sql,
      opzioni: { da?: Prisma.Sql; peso?: Prisma.Sql; filtro?: Prisma.Sql; limite?: number } = {},
    ): Promise<{ nome: string; quantita: number; prima: number | null }[]> => {
      const peso = opzioni.peso ?? Prisma.sql`1`;
      const righe = await this.prisma.$queryRaw<{ k: string | null; n: number | null; p: number | null }[]>(Prisma.sql`
        SELECT ${chiave} AS k,
               SUM(CASE WHEN ${corrente} THEN ${peso} ELSE 0 END)::float AS n,
               SUM(CASE WHEN ${primaSql} THEN ${peso} ELSE 0 END)::float AS p
        FROM platform."Delivery" d
        ${opzioni.da ?? Prisma.empty}
        LEFT JOIN platform."ServiceType" s ON s."id" = d."serviceTypeId"
        WHERE d."partnerId" = ${partnerId} AND ${fatte}
          AND (${corrente} OR ${primaSql})
          ${f.serviceTypeId ? Prisma.sql`AND d."serviceTypeId" = ${f.serviceTypeId}` : Prisma.empty}
          ${f.pricingModel ? Prisma.sql`AND s."pricingModel" = ${f.pricingModel}` : Prisma.empty}
          ${opzioni.filtro ?? Prisma.empty}
        GROUP BY 1
        HAVING ${chiave} IS NOT NULL AND ${chiave} <> ''
        ORDER BY 2 DESC, 3 DESC
        LIMIT ${opzioni.limite ?? 20}
      `);
      return righe.map((r) => ({
        nome: String(r.k ?? ''),
        quantita: Math.round(Number(r.n ?? 0)),
        prima: intervalloPrima ? Math.round(Number(r.p ?? 0)) : null,
      }));
    };

    // 2. FASCE ORARIE — solo per chi fa consegne o servizi a ora.
    const chiediFasce = () => classifica(Prisma.sql`d."deliveryTimeFrom"`, { limite: 24 });

    // 3. GIORNI DELLA SETTIMANA — il giorno si legge nell'ora di Roma: con l'UTC una consegna della
    //    domenica sera cadrebbe di lunedì.
    const chiediGiorni = async () => {
      const righe = await classifica(
        Prisma.sql`to_char(d."date" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome', 'ID')`,
        { limite: 7 },
      );
      // 'ID' dà 1 = lunedì … 7 = domenica: l'ordine della settimana, non quello dell'alfabeto.
      return righe.map((r) => ({ ...r, nome: GIORNI_ISO[Number(r.nome)] ?? r.nome }));
    };

    // 4. ANDAMENTO VENDITE — quante e quanto, mese per mese. Qui il confronto è già nel grafico: i mesi
    //    si vedono uno accanto all'altro, e affiancarne un altro periodo lo renderebbe illeggibile.
    const chiediVendite = async () =>
      (
        await this.prisma.$queryRaw<{ mese: string; n: bigint; valore: number | null }[]>(Prisma.sql`
          SELECT to_char(d."date" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome', 'YYYY-MM') AS mese,
                 COUNT(*)::bigint AS n,
                 SUM(COALESCE(d."productValue", 0))::float AS valore
          FROM platform."Delivery" d
          JOIN platform."ServiceType" s ON s."id" = d."serviceTypeId"
          WHERE d."partnerId" = ${partnerId} AND s."pricingModel" = 'VENDITA' AND ${fatte}
            AND (${corrente} OR ${primaSql})
          GROUP BY 1 ORDER BY 1 ASC
        `)
      ).map((r) => ({ mese: r.mese, quantita: Number(r.n), valore: r.valore ?? 0 }));

    // 5. PRODOTTI PIÙ VENDUTI — dalla FOTOGRAFIA sulla riga di consegna (`productName`), non dal
    //    catalogo: un prodotto rinominato o cancellato non deve riscrivere la storia. Qui si contano i
    //    PEZZI, non le consegne: è la domanda «cosa vendo di più».
    const chiediProdotti = () =>
      classifica(Prisma.sql`COALESCE(NULLIF(dp."productName", ''), pr."name")`, {
        da: Prisma.sql`JOIN platform."DeliveryProduct" dp ON dp."deliveryId" = d."id"
        LEFT JOIN platform."Product" pr ON pr."id" = dp."productId"`,
        peso: Prisma.sql`dp."quantity"`,
      });

    // 6-7-8. INDIRIZZI, LUOGHI E CLIENTI — solo per chi fa consegne: sono la mappa del suo giro.
    const chiediIndirizzi = () => classifica(Prisma.sql`d."recipientAddress"`);
    const chiediLuoghi = () => classifica(Prisma.sql`d."recipientPlace"`);
    const chiediClienti = () =>
      classifica(Prisma.sql`TRIM(COALESCE(d."recipientFirstName", '') || ' ' || COALESCE(d."recipientLastName", ''))`, {
        // ⚠️ «. .», «varie varie»: segnaposto messi al posto del nome quando il destinatario non si sa.
        // Sulla prova con Clivati «. .» usciva PRIMO con 2.775 consegne, e una classifica guidata da un
        // segnaposto non dice niente a nessuno. Serve un nome con almeno tre lettere.
        filtro: Prisma.sql`AND length(regexp_replace(COALESCE(d."recipientFirstName", '') || COALESCE(d."recipientLastName", ''), '[^[:alpha:]]', '', 'g')) >= 3
          AND lower(TRIM(COALESCE(d."recipientFirstName", '') || ' ' || COALESCE(d."recipientLastName", ''))) NOT IN ('varie varie', 'vari vari', 'cliente cliente')`,
      });

    /**
     * ⚠️⚠️ TRE QUERY ALLA VOLTA, NON SETTE.
     *
     * In fila queste classifiche facevano 6,9 s sul partner più grosso (Clivati, 7.962 consegne): una
     * pagina che si apre in sette secondi non si guarda. Insieme scendono al tempo della più lenta.
     *
     * Ma non tutte insieme: il 10/09 quattro query in parallelo per ogni riga dell'elenco consegne hanno
     * esaurito il pool del pooler (limite 3) e l'app ha risposto «Internal server error» per minuti.
     * Tre alla volta è il numero che quel guasto ha insegnato.
     */
    const aOnde = async (lavori: (() => Promise<unknown>)[], quante = 3): Promise<unknown[]> => {
      const esiti: unknown[] = [];
      for (let i = 0; i < lavori.length; i += quante) {
        esiti.push(...(await Promise.all(lavori.slice(i, i + quante).map((fn) => fn()))));
      }
      return esiti;
    };
    const niente = async () => vuoto;
    const [fasce, giorni, vendite, prodotti, indirizzi, luoghi, clienti] = (await aOnde([
      haConsegna || haOra ? chiediFasce : niente,
      haConsegna || haOra ? chiediGiorni : niente,
      haVendita ? chiediVendite : niente,
      haVendita ? chiediProdotti : niente,
      haConsegna ? chiediIndirizzi : niente,
      haConsegna ? chiediLuoghi : niente,
      haConsegna ? chiediClienti : niente,
    ])) as [
      Riga[],
      Riga[],
      { mese: string; quantita: number; valore: number }[],
      Riga[],
      Riga[],
      Riga[],
      Riga[],
    ];

    return {
      partner,
      periodo: { da: f.da ?? null, a: f.a ?? null },
      mostra: { consegna: haConsegna, ora: haOra, vendita: haVendita },
      totale,
      confronto,
      servizi,
      fasce,
      giorni,
      vendite,
      prodotti,
      indirizzi,
      luoghi,
      clienti,
    };
  }
}

@ApiTags('statistiche')
@ApiBearerAuth()
@Roles(Role.PARTNER, Role.ADMIN, Role.OPERATION)
@Controller('statistiche-partner')
export class StatistichePartnerController {
  constructor(private readonly service: StatistichePartnerService) {}

  @Get()
  @ApiOperation({ summary: 'Statistiche di un partner: servizi, fasce, giorni, vendite, prodotti, indirizzi, luoghi, clienti' })
  @ApiQuery({ name: 'da', required: false })
  @ApiQuery({ name: 'a', required: false })
  @ApiQuery({ name: 'serviceTypeId', required: false })
  @ApiQuery({ name: 'pricingModel', required: false })
  @ApiQuery({ name: 'partnerId', required: false, description: 'Solo ufficio: di quale partner' })
  @ApiQuery({ name: 'confronto', required: false, enum: ['precedente', 'anno', 'personalizzato', 'nessuno'] })
  @ApiQuery({ name: 'confrontoDa', required: false })
  @ApiQuery({ name: 'confrontoA', required: false })
  async statistiche(
    @CurrentUser() user: JwtUser,
    @Query('da') da?: string,
    @Query('a') a?: string,
    @Query('serviceTypeId') serviceTypeId?: string,
    @Query('pricingModel') pricingModel?: string,
    @Query('partnerId') partnerId?: string,
    @Query('confronto') confronto?: TipoConfronto,
    @Query('confrontoDa') confrontoDa?: string,
    @Query('confrontoA') confrontoA?: string,
  ) {
    // ⚠️ Il partner vede SÉ STESSO: l'id arriva dal token, mai dalla richiesta. Se arrivasse da fuori,
    // cambiare un parametro nell'indirizzo aprirebbe le statistiche di un concorrente.
    const id = user.role === Role.PARTNER ? user.partnerId : partnerId ?? user.partnerId;
    if (!id) throw new ForbiddenException('Nessun partner da mostrare');
    return this.service.perPartner(id, { da, a, serviceTypeId, pricingModel, confronto, confrontoDa, confrontoA });
  }
}

@Module({
  controllers: [StatistichePartnerController],
  providers: [StatistichePartnerService],
  exports: [StatistichePartnerService],
})
export class StatistichePartnerModule {}
