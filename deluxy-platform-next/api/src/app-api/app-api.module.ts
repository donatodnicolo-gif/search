import { createHash } from 'crypto';
import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.module';

// ─────────────────────────────────────────────────────────────────────────────
// IL CANALE APP-TO-APP della piattaforma (standard Deluxy §4.3 e §7).
//
// Le altre app Deluxy non hanno una sessione utente: si presentano con una
// chiave (`x-api-key`, in alternativa `Authorization: Bearer`) creata con
// `api/scripts/crea-chiave-app.mjs`. Nel database vive SOLO lo SHA-256.
//
// Prima rotta: lo stato di una VENDITA smistata, cercata per riferimento
// esterno (`source` + `externalOrderId`). La legge Deluxy Orders nel suo cron
// per il ritorno del giro dell'ordine: se il partner ha accettato, quanto gli
// va (importo meno lo sconto cristallizzato), se la consegna è nata e com'è
// finita. Senza questa rotta il ciclo proposta→accettazione resterebbe
// invisibile fuori dalla piattaforma, e il margine in Orders senza ingredienti.
//
// Le rotte stanno sotto `/api/v1/app/…`: il prefisso dice il canale, e il
// guard è UNO per tutto il controller — una rotta aggiunta domani non può
// nascere senza chiave per dimenticanza.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AppApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const grezza =
      (req.headers['x-api-key'] as string | undefined)?.trim() ||
      (req.headers['authorization'] as string | undefined)
        ?.replace(/^Bearer\s+/i, '')
        .trim();
    if (!grezza) {
      throw new UnauthorizedException('Chiave API mancante (header x-api-key).');
    }
    // Si confronta lo SHA-256, mai il valore: la ricerca per hash è anche un
    // confronto a tempo costante di fatto (indice unico, nessun ===
    // carattere per carattere sulla chiave in chiaro).
    const hash = createHash('sha256').update(grezza).digest('hex');
    const record = await this.prisma.appApiKey.findUnique({ where: { hash } });
    if (!record || !record.attiva) {
      throw new UnauthorizedException('Chiave API non valida o disattivata.');
    }
    // Traccia d'uso best-effort: un fallimento qui non deve negare la risposta.
    void this.prisma.appApiKey
      .update({ where: { id: record.id }, data: { ultimoUso: new Date() } })
      .catch(() => undefined);
    req.appChiave = { nome: record.nome, scrittura: record.scrittura };
    return true;
  }
}

/**
 * Il nome del negozio in una grafia sola.
 *
 * ⚠️ In banca dati «ShopifySale» e «shopifysale» sono lo STESSO canale scritto
 * in due modi (6.338 consegne contro 1.258): raggruppare per stringa esatta
 * produce due righe, e chi ne legge una sottostima quel negozio di un quinto.
 * L'etichetta che torna è la grafia canonica, non la prima incontrata: «la
 * prima dell'elenco» cambierebbe da sola aggiungendo una riga.
 */
const NEGOZI_NOTI = ['ShopifySale', 'FlowersSales', 'CakeSales', 'BusinessSales'];
function canonico(shop: string | null | undefined): string {
  const s = (shop ?? '').trim();
  if (!s) return 'senza negozio';
  return NEGOZI_NOTI.find((x) => x.toLowerCase() === s.toLowerCase()) ?? s;
}

@Injectable()
export class AppApiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le vendite di una sorgente aggiornate da un momento in poi: è la rotta del
   * PULL incrementale di Deluxy Orders (una chiamata a giro di cron, non una
   * per ordine). Il formato di ogni voce è lo stesso del by-ref.
   */
  async venditeAggiornate(source: string, aggiornateDa: string | undefined, limite: number) {
    const da = aggiornateDa ? new Date(aggiornateDa) : null;
    if (aggiornateDa && Number.isNaN(da?.getTime())) {
      throw new NotFoundException('aggiornateDa non è una data ISO valida.');
    }
    const vendite = await this.prisma.sale.findMany({
      where: { source, ...(da ? { updatedAt: { gte: da } } : {}) },
      orderBy: { updatedAt: 'asc' },
      take: Math.min(200, Math.max(1, limite)),
      include: {
        partner: { select: { id: true, insegna: true } },
        province: { select: { code: true } },
        product: { select: { id: true, name: true, type: true } },
      },
    });
    const consegne = new Map(
      (
        await this.prisma.delivery.findMany({
          where: { id: { in: vendite.map((s) => s.deliveryId).filter((x): x is string => !!x) } },
          select: {
            id: true,
            status: true,
            date: true,
            deliveryTimeFrom: true,
            deliveryTimeTo: true,
            valetId: true,
          },
        })
      ).map((d) => [d.id, d]),
    );
    return {
      totale: vendite.length,
      vendite: vendite.map((s) => this.serializza(s, s.deliveryId ? consegne.get(s.deliveryId) ?? null : null)),
    };
  }

  private serializza(
    s: {
      id: string;
      status: string;
      amount: number;
      discountPercent: number;
      externalOrderId: string | null;
      partner: { id: string; insegna: string | null } | null;
      province: { code: string } | null;
      product: { id: string; name: string; type: string } | null;
      createdAt: Date;
      updatedAt: Date;
    },
    consegna: {
      id: string;
      status: string;
      date: Date | null;
      deliveryTimeFrom: string | null;
      deliveryTimeTo: string | null;
      valetId: string | null;
    } | null,
  ) {
    const costoPartner = Math.round(s.amount * (1 - s.discountPercent / 100) * 100) / 100;
    return {
      vendita: {
        id: s.id,
        riferimentoEsterno: s.externalOrderId,
        stato: s.status,
        importo: s.amount,
        scontoPercento: s.discountPercent,
        costoPartner,
        partner: s.partner ? { id: s.partner.id, insegna: s.partner.insegna } : null,
        provincia: s.province?.code ?? null,
        prodotto: s.product ? { id: s.product.id, nome: s.product.name, tipo: s.product.type } : null,
        creataIl: s.createdAt.toISOString(),
        aggiornataIl: s.updatedAt.toISOString(),
      },
      consegna: consegna
        ? {
            id: consegna.id,
            stato: consegna.status,
            data: consegna.date ? consegna.date.toISOString() : null,
            fascia:
              consegna.deliveryTimeFrom && consegna.deliveryTimeTo
                ? `${consegna.deliveryTimeFrom}-${consegna.deliveryTimeTo}`
                : null,
            conValet: Boolean(consegna.valetId),
          }
        : null,
    };
  }

  /**
   * IL COSTO DELLE CONSEGNE del periodo — per il conto economico di Deluxy
   * Budgets (27/08/2026, richiesta dell'utente: «per costi di servizi di
   * consegne i valori delle consegne da app delivery, comprese le aggiunte
   * delle ritenute per quelli non in partita IVA»).
   *
   * ⭐ **Perché la rotta sta QUI e non in Orders.** Il costo di una consegna è
   * un dato della piattaforma: lo compone lei dalla paga del valet, dalla
   * regola del giro e dal contratto del singolo valet. Orders ne riceve una
   * copia per ordine (costoConsegna) perché è un ingrediente del SUO margine,
   * ma la casa del numero è questa — e Budgets deve leggerlo dal proprietario
   * (Standard Deluxy §7), non di sponda.
   *
   * **Come si compone il costo di una consegna**, con le tre decisioni prese
   * dall'utente che lo rendono diverso dalla paga scritta sulla riga:
   *
   *   paga     = 0 se la consegna non è pagabile (regola carnet: una sola
   *              consegna del giro porta la paga), altrimenti
   *              valetSalary + il PLUS FINO A 5 € — il plus più grande è il
   *              rimborso di un acquisto fatto per noi, non il prezzo del
   *              viaggio — e il MINUS non si sottrae mai (è contante trattenuto
   *              dal valet, un suo debito: la consegna è costata la paga piena)
   *   ritenuta = per i valet SENZA partita IVA soltanto:
   *              paga × (1 − % rimborso della scheda) × 25%
   *   costo    = paga + ritenuta
   *
   * ⚠️ **La ritenuta è un costo IN PIÙ, non una trattenuta.** Al valet senza
   * P.IVA si bonifica la paga intera; il 20% sul corrispettivo lordo lo versa
   * Deluxy all'erario per conto suo. Chi legge la paga credendola il costo
   * sottostima di quella cifra — per questo qui viaggiano separate: si può
   * mostrare l'una accanto all'altra invece di doverle sciogliere a valle.
   *
   * ⚠️ plusNelCosto è la stessa funzione che usano la Finanza e la
   * pubblicazione verso Orders: se le tre righe divergessero, il costo
   * pubblicato smetterebbe di ricomporre il margine — difetto già pagato.
   */
  async costiConsegne(dal?: string, al?: string) {
    const daData = dal ? new Date(`${dal}T00:00:00+01:00`) : null;
    const aData = al ? new Date(`${al}T00:00:00+01:00`) : null;
    if ((dal && Number.isNaN(daData?.getTime())) || (al && Number.isNaN(aData?.getTime()))) {
      throw new NotFoundException('dal/al devono essere date ISO (AAAA-MM-GG).');
    }

    const consegne = await this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        valetId: { not: null },
        // Il segnaposto «Consegna Partner» non è una persona da pagare.
        valet: { placeholder: false },
        // Gli stessi stati che generano la paga negli stipendi: una consegna
        // ancora da approvare non è un costo, è una richiesta.
        status: { in: ['delivered', 'approved', 'not_delivered'] },
        ...(daData || aData
          ? { date: { ...(daData ? { gte: daData } : {}), ...(aData ? { lt: aData } : {}) } }
          : {}),
      },
      select: {
        date: true,
        shop: true,
        status: true,
        payable: true,
        valetSalary: true,
        valetAdditionalPrice: true,
        serviceType: { select: { pricingModel: true } },
        valet: { select: { id: true, hasVat: true, withholdingPercent: true } },
      },
    });

    type Conto = { consegne: number; paga: number; ritenute: number; costo: number; nonPagabili: number };
    const vuoto = (): Conto => ({ consegne: 0, paga: 0, ritenute: 0, costo: 0, nonPagabili: 0 });
    const mesi: Conto[] = Array.from({ length: 12 }, vuoto);
    const perShop = new Map<string, Conto>();
    const tot = vuoto();
    const senzaPiva = new Set<string>();
    const conPiva = new Set<string>();

    let nonConsegnateTenute = 0;
    let nonConsegnateScartate = 0;

    for (const d of consegne) {
      // ⭐ UNA CONSEGNA NON ANDATA SI PAGA SOLO SE IL SERVIZIO È A ORA
      // (decisione dell'utente del 27/08, caso 62372: l'ora è stata lavorata
      // comunque). È la stessa regola di `nonConsegnataPagabile` negli
      // stipendi. ⚠️ Lì il modello di prezzo si prende prima dal LISTINO del
      // valet e solo dopo dal servizio della consegna; qui si guarda il
      // servizio, perché scegliere il listino vuol dire rifare mezza logica
      // degli stipendi e due copie della stessa regola divergono sempre. La
      // differenza vive solo sulle non consegnate — nel 2026 sono 194 righe per
      // 1.311 € — e il conto qui sotto la dichiara invece di nasconderla.
      if (d.status === 'not_delivered' && d.serviceType?.pricingModel !== 'A_ORA') {
        nonConsegnateScartate++;
        continue;
      }
      if (d.status === 'not_delivered') nonConsegnateTenute++;
      const paga =
        d.payable === false
          ? 0
          : Math.max(0, (d.valetSalary ?? 0) + FinanceService.plusNelCosto(d.valetAdditionalPrice));
      const senzaPartitaIva = d.valet?.hasVat === false;
      const ritenuta =
        paga > 0 && senzaPartitaIva
          ? paga * (1 - (d.valet?.withholdingPercent ?? 0) / 100) * 0.25
          : 0;
      if (d.valet?.id) (senzaPartitaIva ? senzaPiva : conPiva).add(d.valet.id);

      // Mese di CALENDARIO ITALIANO: una consegna delle 00:30 del 1° marzo è
      // di marzo, non di febbraio.
      const mese =
        Number(
          new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', month: 'numeric' }).format(d.date),
        ) - 1;
      // ⚠️ LO STESSO NEGOZIO È SCRITTO IN DUE MODI in banca dati —
      // «ShopifySale» (6.338 consegne) e «shopifysale» (1.258) — e chi
      // raggruppa per stringa esatta si ritrova due righe, ne legge una e
      // sottostima di un quinto. Si raggruppa senza distinzione di maiuscole,
      // tenendo come etichetta la grafia più frequente.
      const shop = canonico(d.shop);
      const s = perShop.get(shop) ?? vuoto();
      for (const c of [mesi[mese], s, tot]) {
        if (!c) continue;
        c.consegne++;
        c.paga += paga;
        c.ritenute += ritenuta;
        c.costo += paga + ritenuta;
        if (d.payable === false) c.nonPagabili++;
      }
      perShop.set(shop, s);
    }

    const tondo = (c: Conto) => ({
      ...c,
      paga: Math.round(c.paga * 100) / 100,
      ritenute: Math.round(c.ritenute * 100) / 100,
      costo: Math.round(c.costo * 100) / 100,
    });

    return {
      periodo: { dal: dal ?? null, al: al ?? null, fuso: 'Europe/Rome' },
      regola:
        'costo = paga + ritenuta. paga = 0 se la consegna non è pagabile, altrimenti valetSalary + il plus fino a 5 € (il plus maggiore è rimborso di acquisti; il minus è contante trattenuto dal valet e non si sottrae). ritenuta = paga × (1 − % rimborso) × 25%, SOLO per i valet senza partita IVA: la versa Deluxy all erario IN PIÙ rispetto al bonifico, quindi è costo, non trattenuta.',
      totali: {
        ...tondo(tot),
        valetSenzaPartitaIva: senzaPiva.size,
        valetConPartitaIva: conPiva.size,
        // Le non consegnate: quante sono entrate (servizio a ora) e quante no.
        // Un totale che non dice cosa ha scartato si legge come completo.
        nonConsegnateTenute,
        nonConsegnateScartate,
      },
      mesi: mesi.map((c, i) => ({ mese: i + 1, ...tondo(c) })),
      // `shop` è il canale come lo conosce la piattaforma (ShopifySale,
      // CakeSales, FlowersSales, BusinessSales): si manda GREZZO, perché
      // l'abbinamento con i brand di chi legge è una decisione sua, e
      // indovinarla qui attribuirebbe un costo al negozio sbagliato senza
      // che si veda.
      perShop: [...perShop.entries()]
        .map(([shop, c]) => ({ shop, ...tondo(c) }))
        .sort((x, y) => y.costo - x.costo),
    };
  }

  /** Lo stato di una vendita smistata, per il riferimento esterno. */
  async venditaByRef(source: string, externalOrderId: string) {
    const s = await this.prisma.sale.findFirst({
      where: { source, externalOrderId },
      include: {
        partner: { select: { id: true, insegna: true } },
        province: { select: { code: true } },
        product: { select: { id: true, name: true, type: true } },
      },
    });
    if (!s) {
      throw new NotFoundException(
        `Nessuna vendita con riferimento ${source}/${externalOrderId}.`,
      );
    }
    const consegna = s.deliveryId
      ? await this.prisma.delivery.findUnique({
          where: { id: s.deliveryId },
          select: {
            id: true,
            status: true,
            date: true,
            deliveryTimeFrom: true,
            deliveryTimeTo: true,
            valetId: true,
          },
        })
      : null;
    // Stesso formato della lista: chi consuma non deve imparare due dialetti.
    return this.serializza(s, consegna);
  }
}

@ApiTags('app — canale app-to-app (chiave, non sessione)')
@Controller('app')
@Public() // fuori dal JWT utente: l'autenticazione è la chiave del guard
@UseGuards(AppApiKeyGuard)
export class AppApiController {
  constructor(private readonly service: AppApiService) {}

  @Get('vendite')
  @ApiOperation({
    summary:
      'Vendite di una sorgente aggiornate da un momento in poi (il pull incrementale di Deluxy Orders)',
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app (scripts/crea-chiave-app.mjs)' })
  vendite(
    @Query('source') source = 'deluxy-orders',
    @Query('aggiornateDa') aggiornateDa?: string,
    @Query('limit') limit = '200',
  ) {
    return this.service.venditeAggiornate(source, aggiornateDa, Number(limit) || 200);
  }

  @Get('costi-consegne')
  @ApiOperation({
    summary:
      "Costo delle consegne del periodo (paga + ritenuta d'acconto dei valet senza P.IVA), per mese e per negozio — lo legge Deluxy Budgets per il conto economico",
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app (scripts/crea-chiave-app.mjs)' })
  costiConsegne(@Query('dal') dal?: string, @Query('al') al?: string, @Query('anno') anno?: string) {
    // `anno` è la scorciatoia di chi vuole l'anno intero: si traduce in dal/al
    // qui, così il conto ha una strada sola.
    if (anno && !dal && !al) {
      const y = Number(anno);
      if (Number.isFinite(y)) return this.service.costiConsegne(`${y}-01-01`, `${y + 1}-01-01`);
    }
    return this.service.costiConsegne(dal, al);
  }

  @Get('vendite/by-ref/:source/:externalOrderId')
  @ApiOperation({
    summary:
      'Stato di una vendita smistata, per riferimento esterno (la legge Deluxy Orders per consegna e margine)',
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app (scripts/crea-chiave-app.mjs)' })
  venditaByRef(
    @Param('source') source: string,
    @Param('externalOrderId') externalOrderId: string,
  ) {
    return this.service.venditaByRef(source, externalOrderId);
  }
}

@Module({
  controllers: [AppApiController],
  providers: [AppApiKeyGuard, AppApiService],
})
export class AppApiModule {}
