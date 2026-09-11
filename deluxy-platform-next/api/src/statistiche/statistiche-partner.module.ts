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
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

type Filtri = { da?: string; a?: string; serviceTypeId?: string; pricingModel?: string };

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

    // 1. TIPOLOGIA DI SERVIZI RICHIESTI — sempre: è la fotografia di cosa chiede questo partner.
    const perServizio = await this.prisma.delivery.groupBy({
      by: ['serviceTypeId'],
      where: dove,
      _count: { _all: true },
    });
    const tipi = await this.prisma.serviceType.findMany({
      where: { id: { in: perServizio.map((r) => r.serviceTypeId).filter(Boolean) as string[] } },
      select: { id: true, name: true, pricingModel: true },
    });
    const nomeTipo = new Map(tipi.map((t) => [t.id, t]));
    const servizi = perServizio
      .map((r) => ({
        nome: nomeTipo.get(r.serviceTypeId ?? '')?.name ?? 'senza servizio',
        pricingModel: nomeTipo.get(r.serviceTypeId ?? '')?.pricingModel ?? null,
        quantita: r._count._all,
      }))
      .sort((a, b) => b.quantita - a.quantita);
    const totale = servizi.reduce((s, r) => s + r.quantita, 0);

    const vuoto: never[] = [];

    // 2. FASCE ORARIE — solo per chi fa consegne o servizi a ora.
    const chiediFasce = async () =>
      (await this.prisma.delivery.groupBy({
          by: ['deliveryTimeFrom'],
          where: { ...dove, NOT: { deliveryTimeFrom: null } },
          _count: { _all: true },
        }))
          .map((r) => ({ fascia: r.deliveryTimeFrom as string, quantita: r._count._all }))
          .sort((a, b) => b.quantita - a.quantita)
          .slice(0, 24);

    // 3. GIORNI DELLA SETTIMANA — il giorno si legge nell'ora di Roma: con l'UTC una consegna
    //    della domenica sera cadrebbe di lunedì.
    const chiediGiorni = async () =>
      (
          await this.prisma.$queryRaw<{ dow: number; n: bigint }[]>(Prisma.sql`
            SELECT EXTRACT(DOW FROM (d."date" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome'))::int AS dow,
                   COUNT(*)::bigint AS n
            FROM platform."Delivery" d
            WHERE d."partnerId" = ${partnerId} AND ${fatte}${sql}
            GROUP BY 1 ORDER BY 2 DESC
          `)
        ).map((r) => ({ giorno: GIORNI[r.dow] ?? String(r.dow), quantita: Number(r.n) }));

    // 4. ANDAMENTO VENDITE — quante e quanto, mese per mese. Il valore è quello della MERCE
    //    (`productValue`): il prezzo della consegna è un'altra cosa e sommarli mescolerebbe due conti.
    const chiediVendite = async () =>
      (
          await this.prisma.$queryRaw<{ mese: string; n: bigint; valore: number | null }[]>(Prisma.sql`
            SELECT to_char(d."date" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome', 'YYYY-MM') AS mese,
                   COUNT(*)::bigint AS n,
                   SUM(COALESCE(d."productValue", 0))::float AS valore
            FROM platform."Delivery" d
            JOIN platform."ServiceType" s ON s."id" = d."serviceTypeId"
            WHERE d."partnerId" = ${partnerId} AND s."pricingModel" = 'VENDITA' AND ${fatte}${sql}
            GROUP BY 1 ORDER BY 1 ASC
          `)
        ).map((r) => ({ mese: r.mese, quantita: Number(r.n), valore: r.valore ?? 0 }));

    // 5. PRODOTTI PIÙ VENDUTI — dalla FOTOGRAFIA sulla riga di consegna (`productName`), non dal
    //    catalogo: un prodotto rinominato o cancellato non deve riscrivere la storia.
    const chiediProdotti = async () =>
      (
          await this.prisma.$queryRaw<{ nome: string; pezzi: bigint; consegne: bigint }[]>(Prisma.sql`
            SELECT COALESCE(NULLIF(dp."productName", ''), p."name", 'senza nome') AS nome,
                   SUM(dp."quantity")::bigint AS pezzi,
                   COUNT(DISTINCT d."id")::bigint AS consegne
            FROM platform."DeliveryProduct" dp
            JOIN platform."Delivery" d ON d."id" = dp."deliveryId"
            LEFT JOIN platform."Product" p ON p."id" = dp."productId"
            WHERE d."partnerId" = ${partnerId} AND ${fatte}${sql}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 20
          `)
        ).map((r) => ({ nome: r.nome, pezzi: Number(r.pezzi), consegne: Number(r.consegne) }));

    // 6-7-8. INDIRIZZI, LUOGHI E CLIENTI — solo per chi fa consegne: sono la mappa del suo giro.
    const chiediIndirizzi = async () =>
      (await this.prisma.delivery.groupBy({
        by: ['recipientAddress'],
        where: { ...dove, NOT: { recipientAddress: '' } },
        _count: { _all: true },
        orderBy: { _count: { recipientAddress: 'desc' } },
        take: 20,
      })).map((r) => ({ indirizzo: r.recipientAddress ?? '', quantita: r._count._all }));

    const chiediLuoghi = async () =>
      (await this.prisma.delivery.groupBy({
        by: ['recipientPlace'],
        where: { ...dove, NOT: { recipientPlace: null } },
        _count: { _all: true },
        orderBy: { _count: { recipientPlace: 'desc' } },
        take: 20,
      })).map((r) => ({ luogo: r.recipientPlace ?? '', quantita: r._count._all }));

    const chiediClienti = async () =>
      (
        await this.prisma.$queryRaw<{ nome: string; n: bigint }[]>(Prisma.sql`
          SELECT TRIM(COALESCE(d."recipientFirstName", '') || ' ' || COALESCE(d."recipientLastName", '')) AS nome,
                 COUNT(*)::bigint AS n
          FROM platform."Delivery" d
          WHERE d."partnerId" = ${partnerId} AND ${fatte}${sql}
            -- ⚠️ «. .», «varie varie»: segnaposto messi al posto del nome quando il destinatario non si sa.
            -- Sulla prova con Clivati «. .» usciva PRIMO con 2.775 consegne, e una classifica guidata da un
            -- segnaposto non dice niente a nessuno. Serve un nome con almeno tre lettere.
            AND length(regexp_replace(COALESCE(d."recipientFirstName", '') || COALESCE(d."recipientLastName", ''), '[^[:alpha:]]', '', 'g')) >= 3
            AND lower(TRIM(COALESCE(d."recipientFirstName", '') || ' ' || COALESCE(d."recipientLastName", ''))) NOT IN ('varie varie', 'vari vari', 'cliente cliente')
          GROUP BY 1 ORDER BY 2 DESC LIMIT 20
        `)
      ).map((r) => ({ nome: r.nome, quantita: Number(r.n) }));

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
        esiti.push(...(await Promise.all(lavori.slice(i, i + quante).map((f) => f()))));
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
      { fascia: string; quantita: number }[],
      { giorno: string; quantita: number }[],
      { mese: string; quantita: number; valore: number }[],
      { nome: string; pezzi: number; consegne: number }[],
      { indirizzo: string; quantita: number }[],
      { luogo: string; quantita: number }[],
      { nome: string; quantita: number }[],
    ];

    return {
      partner,
      periodo: { da: f.da ?? null, a: f.a ?? null },
      mostra: { consegna: haConsegna, ora: haOra, vendita: haVendita },
      totale,
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
  async statistiche(
    @CurrentUser() user: JwtUser,
    @Query('da') da?: string,
    @Query('a') a?: string,
    @Query('serviceTypeId') serviceTypeId?: string,
    @Query('pricingModel') pricingModel?: string,
    @Query('partnerId') partnerId?: string,
  ) {
    // ⚠️ Il partner vede SÉ STESSO: l'id arriva dal token, mai dalla richiesta. Se arrivasse da fuori,
    // cambiare un parametro nell'indirizzo aprirebbe le statistiche di un concorrente.
    const id = user.role === Role.PARTNER ? user.partnerId : partnerId ?? user.partnerId;
    if (!id) throw new ForbiddenException('Nessun partner da mostrare');
    return this.service.perPartner(id, { da, a, serviceTypeId, pricingModel });
  }
}

@Module({
  controllers: [StatistichePartnerController],
  providers: [StatistichePartnerService],
  exports: [StatistichePartnerService],
})
export class StatistichePartnerModule {}
