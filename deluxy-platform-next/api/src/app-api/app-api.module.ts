import { createHash } from 'crypto';
import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { CreateDeliveryDto } from '../deliveries/dto/create-delivery.dto';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { FinanceService } from '../finance/finance.module';
import { RichiesteModule, RichiesteService, CreaRichiestaDto } from '../richieste/richieste.module';
import { valoreProdotti } from '../common/valore-prodotti';

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
    // ⚠️ 27/08/2026 — LA SCADENZA SI VERIFICA A OGNI CHIAMATA, non alla
    // creazione. Prima non esisteva proprio: una chiave consegnata una volta
    // valeva per sempre, e una chiave che nessuno ritira è una porta che
    // nessuno chiude.
    //
    // Il messaggio dice SCADUTA e non «non valida»: chi la usa deve sapere che
    // cosa chiedere, invece di ricontrollare di aver copiato bene.
    if (record.scadeIl && record.scadeIl.getTime() <= Date.now()) {
      throw new UnauthorizedException(
        `Chiave API scaduta il ${record.scadeIl.toISOString().slice(0, 10)}: chiedine una nuova.`,
      );
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
 * IL PERMESSO DI SCRITTURA, come guard.
 *
 * ⚠️ Stava dentro il gestore, e i pipe girano PRIMA dei gestori: una chiave di
 * sola lettura che mandava un corpo imperfetto riceveva un **400 sui nomi dei
 * campi**, non il rifiuto del permesso. Il rifiuto c'era comunque — niente
 * veniva scritto — ma chi lo leggeva capiva la cosa sbagliata, e una prova
 * automatica non poteva distinguere «respinto» da «non ci sono arrivato».
 *
 * I guard girano prima dei pipe: qui il motivo vero arriva per primo.
 */
@Injectable()
export class ScritturaRichiestaGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!req?.appChiave?.scrittura) {
      throw new UnauthorizedException(
        'Questa chiave è di sola lettura: per creare consegne serve una chiave con permesso di scrittura.',
      );
    }
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: DeliveriesService,
  ) {}

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
      // ⚠️ **COSA RESTA FUORI, misurato sul 2026 il 27/08 (domanda dell'utente:
      // «ti sei assicurato che non entrino consegne annullate o invalidate?»).**
      // Il filtro è **positivo** — si nominano gli stati che si pagano, non
      // quelli che si scartano — quindi uno stato nuovo nasce ESCLUSO invece di
      // entrare di straforo. Quello che tiene fuori, in euro:
      //
      //   cancelled                177 consegne · 1.916 €
      //   assigned                  42 ·   610 €   (assegnata, non ancora fatta)
      //   cancellation_requested     5 ·    78 €
      //   accepted                   4 ·    77 €
      //   in_delivery                2 ·    54 €
      //   invalidated                2 ·     7 €
      //   not_accepted               1 ·     7 €
      //                          ─────────────────
      //                                  2.750 €
      //
      // Sono gli stessi tre stati che pagano gli stipendi (`DA_PAGARE`), e
      // `cancelled`/`invalidated`/`not_accepted` sono esattamente i tre che la
      // Finanza esclude (`STATI_ESCLUSI`). Il soft-delete è escluso a parte:
      // nel 2026 non ci sono consegne cancellate con un valet assegnato.
      //
      // ⚠️ **Una cosa la Finanza la esclude e questa rotta no**: le consegne che
      // sono la *gamba d'acquisto* di un ordine corporate (110 in tutto lo
      // storico, **86 nel 2026 per 639 €**). Là si escludono dai **ricavi** D2C,
      // perché corrispettivi non sono; qui sono un **costo**, e il valet è stato
      // pagato lo stesso. Restano dentro di proposito — ma è una decisione, non
      // una svista, e sono 639 € se un giorno la si vuole rovesciare.
      where: {
        // ⚠️ Il perimetro sta in UN POSTO SOLO (`PERIMETRO_COSTO`), condiviso
        // col totale dell'elenco per consegna: due copie divergerebbero.
        ...AppApiService.PERIMETRO_COSTO,
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
        valet: { select: { id: true, firstName: true, lastName: true, hasVat: true, withholdingPercent: true } },
      },
    });

    type Conto = { consegne: number; paga: number; ritenute: number; costo: number; nonPagabili: number };
    const vuoto = (): Conto => ({ consegne: 0, paga: 0, ritenute: 0, costo: 0, nonPagabili: 0 });
    const mesi: Conto[] = Array.from({ length: 12 }, vuoto);
    const perShop = new Map<string, Conto>();
    // ⭐ IL DETTAGLIO PER VALET, e perché serve a chi legge (27/08/2026).
    //
    // Deluxy Budgets ha scoperto un doppio conteggio che da qui non è
    // visibile: **alcuni valet sono dipendenti a libro paga** (Renato Cassoli,
    // Eleonora Mannini), quindi il loro costo sta già nella riga «personale»
    // del conto economico, presa dall'anagrafica Dipendenti. Sommarci anche la
    // paga per consegna li conta due volte.
    //
    // ⚠️ **La piattaforma non sa chi è a libro paga, e non deve saperlo**: qui
    // un valet è un valet, e il roster degli stipendi vive in Budgets. Quindi
    // non si filtra niente — si manda il dettaglio **per persona e per mese**,
    // e chi possiede il dato decide chi togliere. È la stessa regola di sempre:
    // ogni dato lo decide chi ce l'ha in casa.
    const perValet = new Map<string, { id: string; nome: string; hasVat: boolean; mesi: Conto[] }>();
    const tot = vuoto();
    const senzaPiva = new Set<string>();
    const conPiva = new Set<string>();

    let nonConsegnateTenute = 0;
    // Resta a zero da quando **tutte** le non consegnate si pagano (27/08 sera).
    // Si tiene perché chi legge la risposta non deve indovinare se lo zero vuol
    // dire «nessuna scartata» o «campo sparito».
    const nonConsegnateScartate = 0;

    for (const d of consegne) {
      // ⭐⭐ **ANCHE LE NON CONSEGNATE SI PAGANO** (decisione dell'utente del
      // 27/08/2026 sera, che allarga quella del mattino). Per qualche ora qui
      // e negli stipendi valeva la regola stretta — si pagava solo il servizio
      // A ORA, perché «l'ora è stata lavorata» — e teneva fuori 184 consegne
      // per 1.201 € sul 2026. Ora entrano tutte: il valet il viaggio l'ha
      // fatto comunque, e una consegna non riuscita non è colpa sua.
      //
      // ⚠️ Non si toglie il ramo, si dichiara: `nonConsegnateTenute` dice
      // quante non consegnate sono dentro questo costo. Un numero che nessuno
      // conta è un numero che il giorno che la regola cambia di nuovo non si
      // riesce a confrontare con quello di prima.
      //
      // ⚠️ Annullate e invalidate restano fuori, e non da qui: le esclude il
      // filtro sugli stati della query. Una consegna non riuscita è un viaggio
      // fatto; una annullata è un viaggio mai partito.
      if (d.status === 'not_delivered') nonConsegnateTenute++;
      const { paga, ritenuta } = AppApiService.costoDi(d);
      const senzaPartitaIva = d.valet?.hasVat === false;
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
      const idValet = d.valet?.id ?? '(senza valet)';
      let pv = perValet.get(idValet);
      if (!pv) {
        pv = {
          id: idValet,
          nome: `${d.valet?.lastName ?? ''} ${d.valet?.firstName ?? ''}`.trim() || '(senza nome)',
          hasVat: d.valet?.hasVat ?? false,
          mesi: Array.from({ length: 12 }, vuoto),
        };
        perValet.set(idValet, pv);
      }
      const cv = pv.mesi[mese];
      if (cv) {
        cv.consegne++;
        cv.paga += paga;
        cv.ritenute += ritenuta;
        cv.costo += paga + ritenuta;
        if (d.payable === false) cv.nonPagabili++;
      }
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
      // Per persona e per mese: chi legge può togliere i valet che paga già
      // come dipendenti, senza che questa app debba sapere chi sono.
      perValet: [...perValet.values()]
        .map((v) => {
          const totale = v.mesi.reduce(
            (a, c) => ({
              consegne: a.consegne + c.consegne,
              paga: a.paga + c.paga,
              ritenute: a.ritenute + c.ritenute,
              costo: a.costo + c.costo,
              nonPagabili: a.nonPagabili + c.nonPagabili,
            }),
            vuoto(),
          );
          return {
            id: v.id,
            nome: v.nome,
            partitaIva: v.hasVat,
            ...tondo(totale),
            mesi: v.mesi.map((c, i) => ({ mese: i + 1, ...tondo(c) })),
          };
        })
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

  // ───────────────────────────────────────────────────────────────────────────
  // LE CONSEGNE, UNA PER UNA (27/08/2026, chiesto dall'utente: «API che si
  // possono richiamare per sapere esito di servizio, costo consegna e tutti i
  // dati»).
  //
  // `costi-consegne` qui sopra risponde per MESE e per NEGOZIO: serve a chi fa
  // il conto economico. Questa risponde per CONSEGNA: serve a chi deve sapere
  // com'e' finita quella, e quanto e' costata.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * IL PERIMETRO DEL COSTO — lo stesso che legge Deluxy Budgets.
   *
   * ⚠️ Vive QUI, in un posto solo, e lo usano sia `costi-consegne` (il totale
   * per mese e per negozio) sia il totale dell'elenco per consegna. Se le due
   * rotte lo ripetessero, il giorno che cambia una regola darebbero due numeri
   * diversi sullo stesso archivio — e chi legge non avrebbe modo di sapere
   * quale dei due è quello buono.
   *
   * Il filtro è POSITIVO: si nominano gli stati che si pagano, non quelli che
   * si scartano. Uno stato nuovo nasce ESCLUSO invece di entrare di straforo.
   */
  // ⚠️ Niente `as const`: renderebbe l'elenco degli stati readonly e Prisma
  // vuole un array modificabile — l'errore che ne esce non nomina il perimetro,
  // dice solo che «status non è assegnabile».
  static readonly PERIMETRO_COSTO: {
    deletedAt: null;
    valetId: { not: null };
    valet: { placeholder: boolean };
    status: { in: string[] };
  } = {
    deletedAt: null,
    valetId: { not: null },
    // Il segnaposto «Consegna Partner» non è una persona da pagare.
    valet: { placeholder: false },
    // Gli stessi stati che generano la paga negli stipendi: annullate e
    // invalidate restano fuori — una consegna non riuscita è un viaggio fatto,
    // una annullata è un viaggio mai partito.
    status: { in: ['delivered', 'approved', 'not_delivered'] },
  };

  /**
   * Il costo di UNA consegna: paga + ritenuta, con le regole della Finanza.
   * Una funzione sola, usata da tutte e tre le rotte che parlano di costi.
   */
  static costoDi(d: {
    payable?: boolean | null; valetSalary?: number | null; valetAdditionalPrice?: number | null;
    valet?: { hasVat?: boolean | null; withholdingPercent?: number | null } | null;
  }): { paga: number; ritenuta: number; costo: number } {
    const paga = d.payable === false
      ? 0
      : Math.max(0, (d.valetSalary ?? 0) + FinanceService.plusNelCosto(d.valetAdditionalPrice));
    const ritenuta = paga > 0 && d.valet?.hasVat === false
      ? paga * (1 - ((d.valet?.withholdingPercent ?? 0) / 100)) * 0.25
      : 0;
    return { paga, ritenuta, costo: paga + ritenuta };
  }

  /** Tutto quello che serve a raccontare una consegna. Un posto solo. */
  private static readonly CONSEGNA_SELECT = {
    id: true, code: true, identifier: true, date: true, status: true,
    deliveryTimeFrom: true, deliveryTimeTo: true, deliveryFlexible: true,
    pickupTimeFrom: true, pickupTimeTo: true, pickupAddress: true,
    recipientFirstName: true, recipientLastName: true, recipientAddress: true,
    recipientPhone: true, recipientIntercom: true,
    latitude: true, longitude: true, distanceKm: true,
    startedAt: true, deliveredAt: true, receivedBy: true,
    payable: true, billable: true, invoiced: true, paymentStatus: true,
    price: true, additionalPrice: true, productValue: true, deliveryPrice: true,
    valetSalary: true, valetAdditionalPrice: true, hours: true,
    paymentOnDelivery: true, paymentAmount: true,
    ddtNumber: true, ddtBrand: true, notes: true,
    realOrderNumber: true, shop: true, externalOrderSource: true,
    createdAt: true, updatedAt: true,
    partner: { select: { id: true, insegna: true, commissionPercent: true } },
    valet: { select: { id: true, firstName: true, lastName: true, hasVat: true, withholdingPercent: true } },
    serviceType: { select: { id: true, name: true, pricingModel: true } },
    province: { select: { code: true, name: true } },
    products: {
      select: {
        quantity: true, price: true,
        product: { select: { name: true, price: true, publicPrice: true } },
        productVariant: { select: { name: true, price: true, publicPrice: true } },
      },
    },
  } as const;

  /**
   * Gli stati che dicono «finita»: il resto e' ancora in corso.
   * ⚠️ Elenco POSITIVO: uno stato nuovo nasce «in corso», non «chiusa» per
   * distrazione.
   */
  private static readonly CHIUSI = new Set([
    'delivered', 'approved', 'not_delivered', 'cancelled', 'not_accepted', 'invalidated',
  ]);

  /**
   * L'ESITO e il COSTO di una consegna, con le stesse regole della Finanza.
   *
   * ⚠️ Il costo si compone qui una volta sola e viaggia SCOMPOSTO: chi legge
   * vede anche il plus che NON e' stato contato e il minus che non si sottrae,
   * invece di dover indovinare perche' il totale non torna con la paga scritta.
   * Un numero senza i suoi ingredienti si legge come sbagliato.
   */
  private consegnaSerializzata(d: any) {
    const plusContato = FinanceService.plusNelCosto(d.valetAdditionalPrice);
    const plusScartato = Math.max(0, (d.valetAdditionalPrice ?? 0) - plusContato);
    const minus = Math.min(0, d.valetAdditionalPrice ?? 0);
    const paga = d.payable === false ? 0 : Math.max(0, (d.valetSalary ?? 0) + plusContato);
    const ritenuta = paga > 0 && d.valet && d.valet.hasVat === false
      ? Math.round(paga * (1 - ((d.valet.withholdingPercent ?? 0) / 100)) * 0.25 * 100) / 100
      : 0;
    const feePercent = d.partner?.commissionPercent ?? 0;
    const prezzoPartner = (d.price ?? 0) + (d.additionalPrice ?? 0);
    const r2 = (n: number) => Math.round(n * 100) / 100;

    return {
      id: d.id,
      numero: d.code,
      codicePubblico: d.identifier ?? null,
      data: d.date,
      // ── ESITO ────────────────────────────────────────────────────────────
      esito: {
        stato: d.status,
        chiusa: AppApiService.CHIUSI.has(d.status),
        consegnata: d.status === 'delivered' || d.status === 'approved',
        partitaIl: d.startedAt ?? null,
        consegnataIl: d.deliveredAt ?? null,
        ricevutaDa: d.receivedBy ?? null,
        oreApprovate: d.status === 'approved',
      },
      // ── QUANDO E DOVE ────────────────────────────────────────────────────
      consegna: { dalle: d.deliveryTimeFrom, alle: d.deliveryTimeTo, flessibile: d.deliveryFlexible },
      ritiro: { dalle: d.pickupTimeFrom, alle: d.pickupTimeTo, indirizzo: d.pickupAddress },
      destinatario: {
        nome: [d.recipientFirstName, d.recipientLastName].filter(Boolean).join(' ') || null,
        indirizzo: d.recipientAddress,
        citofono: d.recipientIntercom ?? null,
        telefono: d.recipientPhone ?? null,
        latitudine: d.latitude ?? null,
        longitudine: d.longitude ?? null,
        provincia: d.province ? { codice: d.province.code, nome: d.province.name } : null,
      },
      distanzaKm: d.distanceKm ?? null,
      // ── CHI ──────────────────────────────────────────────────────────────
      partner: d.partner ? { id: d.partner.id, insegna: d.partner.insegna } : null,
      valet: d.valet
        ? {
            id: d.valet.id,
            nome: `${d.valet.firstName} ${d.valet.lastName}`.trim(),
            conPartitaIva: d.valet.hasVat,
          }
        : null,
      servizio: d.serviceType
        ? { id: d.serviceType.id, nome: d.serviceType.name, modello: d.serviceType.pricingModel }
        : null,
      ore: d.hours ?? null,
      // ── ECONOMIA ─────────────────────────────────────────────────────────
      costoConsegna: {
        totale: r2(paga + ritenuta),
        paga: r2(paga),
        ritenuta,
        pagabile: d.payable !== false,
        // Gli ingredienti che spiegano la differenza con la paga SCRITTA.
        pagaScritta: d.valetSalary ?? null,
        plusContato: r2(plusContato),
        plusScartato: r2(plusScartato),
        minus: r2(minus),
        regola:
          'paga = 0 se non pagabile, altrimenti valetSalary + il plus FINO A 5 € '
          + '(il plus maggiore è rimborso di acquisti del valet, non prezzo del viaggio; '
          + 'il minus è contante che ha trattenuto e non si sottrae). '
          + 'ritenuta = paga × (1 − % rimborso) × 25%, solo per i valet senza P.IVA, '
          + 'e la versa Deluxy IN PIÙ rispetto al bonifico: è costo, non trattenuta.',
      },
      economiaPartner: {
        prezzo: d.price ?? null,
        plusMinus: d.additionalPrice ?? null,
        prezzoTotale: r2(prezzoPartner),
        feePercent,
        fee: feePercent > 0 ? r2((feePercent / 100) * prezzoPartner) : 0,
        // ⚠️ NON il campo "productValue": quello diverge dalla somma delle
        // righe, e la fattura si fa sulle righe. Dal 29/08 la formula sta in
        // common/valore-prodotti.ts e la usano la fatturazione, il dettaglio
        // consegna e questo canale: tre copie sarebbero tre numeri diversi
        // nelle app che ci leggono. Il campo resta esposto a parte come
        // "valoreProdottiCampo", per chi confronta col legacy.
        valoreProdotti: r2(valoreProdotti(d.products as any, d.productValue)) || (d.productValue ?? null),
        valoreProdottiCampo: d.productValue ?? null,
        prezzoConsegnaCliente: d.deliveryPrice ?? null,
        daFatturare: d.billable, giaFatturata: d.invoiced,
      },
      incasso: {
        allaConsegna: d.paymentOnDelivery,
        contrassegno: d.paymentAmount ?? null,
        statoPagamentoValet: d.paymentStatus,
      },
      ordine: {
        numeroShopify: d.realOrderNumber ?? null,
        canale: d.shop ?? null,
        sorgente: d.externalOrderSource ?? null,
        ddt: d.ddtNumber ?? null,
        ddtBrand: d.ddtBrand ?? null,
      },
      prodotti: (d.products ?? []).map((p: any) => ({
        nome: p.product?.name ?? null,
        variante: p.productVariant?.name ?? null,
        quantita: p.quantity,
        prezzo: p.price ?? null,
      })),
      note: d.notes ?? null,
      creataIl: d.createdAt,
      aggiornataIl: d.updatedAt,
    };
  }

  /**
   * Pull incrementale delle consegne: stesso patto di `vendite`.
   * Chi legge tiene l'ultimo `aggiornataIl` visto e lo rimanda: cosi' la
   * seconda chiamata costa quanto quello che e' cambiato, non quanto l'archivio.
   */
  async consegne(opzioni: {
    aggiornateDa?: string; dal?: string; al?: string; stato?: string; partnerId?: string; limit: number;
  }) {
    const da = opzioni.aggiornateDa ? new Date(opzioni.aggiornateDa) : null;
    if (opzioni.aggiornateDa && Number.isNaN(da?.getTime())) {
      throw new NotFoundException('aggiornateDa non è una data valida (ISO).');
    }
    const dal = opzioni.dal ? new Date(`${opzioni.dal}T00:00:00.000Z`) : null;
    const al = opzioni.al ? new Date(`${opzioni.al}T23:59:59.999Z`) : null;

    // Il filtro del PERIODO: quello che descrive «di quali consegne stiamo
    // parlando». Non contiene il cursore.
    const periodo = {
      // ⚠️ Le cancellate logicamente non escono da qui: per chi legge non
      // esistono piu'.
      deletedAt: null,
      ...(dal || al ? { date: { ...(dal ? { gte: dal } : {}), ...(al ? { lte: al } : {}) } } : {}),
      ...(opzioni.stato ? { status: opzioni.stato } : {}),
      ...(opzioni.partnerId ? { partnerId: opzioni.partnerId } : {}),
    };
    // Il filtro delle RIGHE di questa pagina: il periodo più il cursore.
    const where = { ...periodo, ...(da ? { updatedAt: { gt: da } } : {}) };

    const consegne = await this.prisma.delivery.findMany({
      where,
      select: AppApiService.CONSEGNA_SELECT,
      orderBy: { updatedAt: 'asc' },
      take: Math.min(500, Math.max(1, opzioni.limit)),
    });

    const righe = consegne.map((d) => this.consegnaSerializzata(d));

    // ⭐⭐ IL TOTALE, LO STESSO CHE LEGGE BUDGETS (27/08, chiesto dall'utente).
    //
    // ⚠️ NON è la somma della pagina: è il conto su TUTTO quello che il filtro
    // seleziona. Sommare le righe restituite darebbe il costo di duecento
    // consegne spacciato per il costo del periodo — la pagina scambiata per la
    // fine, che è l'errore che questa rotta cerca di non far fare.
    //
    // ⚠️ E non è nemmeno il conto su tutte le consegne del filtro: entrano solo
    // quelle dentro `PERIMETRO_COSTO` (un valet vero, e uno stato che si paga).
    // Le altre si contano a parte e si DICHIARANO: un totale che non dice cosa
    // ha lasciato fuori si legge come completo.
    // ⚠️ E il totale NON tiene conto di `aggiornateDa`: quello è il cursore
    // della sincronizzazione, non un pezzo della domanda. Con dentro il
    // cursore, il «totale» sarebbe «quanto è costato ciò che è cambiato da
    // ieri» — un numero che nessuno ha chiesto e che somiglia troppo a quello
    // giusto per accorgersene.
    const doveTotale = { ...periodo, ...AppApiService.PERIMETRO_COSTO };
    const [perCosto, quanteInFiltro] = await Promise.all([
      this.prisma.delivery.findMany({
        where: doveTotale,
        select: {
          payable: true, valetSalary: true, valetAdditionalPrice: true,
          valet: { select: { hasVat: true, withholdingPercent: true } },
        },
      }),
      this.prisma.delivery.count({ where: periodo }),
    ]);
    const somma = perCosto.reduce(
      (a, d) => {
        const c = AppApiService.costoDi(d);
        return { paga: a.paga + c.paga, ritenute: a.ritenute + c.ritenuta, costo: a.costo + c.costo };
      },
      { paga: 0, ritenute: 0, costo: 0 },
    );
    const r2 = (n: number) => Math.round(n * 100) / 100;

    return {
      totali: {
        // La BASE del totale, detta accanto al totale (una cifra senza la sua
        // base è una cifra che sembra sbagliata o, peggio, che convince).
        consegneNelFiltro: quanteInFiltro,
        consegneNelCosto: perCosto.length,
        consegneFuoriDalCosto: quanteInFiltro - perCosto.length,
        costo: r2(somma.costo),
        paga: r2(somma.paga),
        ritenute: r2(somma.ritenute),
        perimetro:
          'Nel costo entrano solo le consegne con un valet vero (niente segnaposto «Consegna Partner») '
          + 'e in stato delivered, approved o not_delivered: una consegna non riuscita è un viaggio fatto, '
          + 'una annullata è un viaggio mai partito. È lo STESSO perimetro di /app/costi-consegne, '
          + 'quello che legge Deluxy Budgets per il conto economico.',
        avvertenza:
          'Questo totale vale sul PERIODO chiesto (dal, al, stato, partnerId), non sulle righe di questa pagina e non sul cursore aggiornateDa.',
      },
      // Il cursore per la chiamata dopo: si dichiara, non si fa dedurre.
      aggiornateDa: opzioni.aggiornateDa ?? null,
      prossimoCursore: righe.length ? righe[righe.length - 1].aggiornataIl : (opzioni.aggiornateDa ?? null),
      quante: righe.length,
      // Se ne sono uscite quante ne stanno nel tetto, quasi certamente ce n'è
      // dell'altro: dirlo evita di scambiare una pagina per la fine.
      altrePagine: righe.length >= Math.min(500, Math.max(1, opzioni.limit)),
      consegne: righe,
    };
  }

  /**
   * CREA UNA CONSEGNA dal canale app-to-app (27/08/2026, chiesto dall'utente).
   *
   * ⭐ Non scrive niente da sola: passa da `DeliveriesService.create`, la
   * STESSA strada del form. Cosi' la consegna nata da un'altra app ha il prezzo
   * dal listino del partner, la paga dal listino del valet, le attivita' di
   * ritiro e consegna e le notifiche — esattamente come quella creata a mano.
   * Una seconda strada di creazione vorrebbe dire due consegne diverse a
   * seconda di chi le ha chieste, e la differenza si scoprirebbe in fattura.
   *
   * ⚠️ Chi chiama e' un'APP, non una persona: si presenta come OPERATION e deve
   * dire il `partnerId`. Il nome della chiave finisce nel registro della
   * consegna, o fra un mese nessuno saprebbe da dove e' arrivata.
   */
  async creaConsegna(dto: CreateDeliveryDto, nomeChiave: string) {
    if (!dto.partnerId) {
      throw new BadRequestException('partnerId obbligatorio: dal canale app non c\'è un partner sottinteso.');
    }
    // ⚠️ IDEMPOTENZA (Libro PERFORMANCE, legge 6; giuria 28/08/2026): un retry
    // di rete del chiamante (timeout, 502) NON deve creare una seconda
    // consegna vera — con paga valet e notifiche. Se il chiamante manda un
    // riferimento, lo stesso riferimento dalla stessa chiave risponde con la
    // consegna già creata, come fa sales.ingest su (source, externalOrderId).
    // Finché Delivery non ha una colonna dedicata (migrazione sul DB CONDIVISO:
    // si concorda, non si improvvisa), il riferimento vive nel registro della
    // consegna con un marcatore cercabile — il canale è a basso volume e la
    // ricerca sul log regge; la colonna vera è annotata nel registro
    // SEGNALAZIONI-PERFORMANCE.
    const riferimento = dto.riferimentoEsterno?.trim();
    const marcatore = riferimento ? `[rif:${nomeChiave}:${riferimento}]` : null;
    if (marcatore) {
      const gia = await this.prisma.deliveryLog.findFirst({
        where: { type: 'created', message: { contains: marcatore } },
        orderBy: { createdAt: 'desc' },
        select: { deliveryId: true },
      });
      if (gia) {
        const esistente = await this.prisma.delivery.findFirst({
          where: { id: gia.deliveryId, deletedAt: null },
          select: { code: true },
        });
        if (esistente) return this.consegnaPerNumero(esistente.code);
      }
    }
    const utenteApp: JwtUser = {
      sub: `app:${nomeChiave}`,
      email: `${nomeChiave}@app.deluxy`,
      role: Role.OPERATION,
      isSupport: false,
      partnerId: null,
      valetId: null,
    };
    const creata: any = await this.deliveries.create(dto, utenteApp);
    await this.prisma.deliveryLog.create({
      data: {
        deliveryId: creata.id,
        type: 'created',
        message: `Consegna creata dal canale app-to-app dalla chiave «${nomeChiave}».${marcatore ? ` ${marcatore}` : ''}`,
      },
    });
    // Si risponde nello STESSO formato della lettura: chi crea e poi rilegge
    // non deve imparare due dialetti.
    return this.consegnaPerNumero(creata.code);
  }

  /**
   * IL CATALOGO DEI SERVIZI della piattaforma (27/08/2026).
   *
   * Lo legge Deluxy Scout, che è il master delle LINEE DI INTERESSE: da lì si
   * guarda questo elenco e si decide quali linee creare, invece di ribattere a
   * mano nomi che qui esistono già e di scoprire mesi dopo che «Eventi» e
   * «Eventi & Catering» erano la stessa cosa scritta in due modi.
   *
   * ⚠️ Si legge e basta: chi possiede il servizio è la piattaforma, chi
   * possiede la linea è Scout. Nessuno dei due scrive in casa dell'altro, e
   * quello che Scout crea è una linea SUA, non una copia di questo record —
   * torna anche il `codice` proprio perché il legame si tenga per riferimento.
   *
   * ⚠️ Tornano anche i servizi SPENTI, con il loro flag. Nasconderli qui
   * farebbe leggere «non esiste» dove la verità è «esiste ed è disattivato»:
   * chi legge deve poter distinguere le due cose, ed è una riga di filtro.
   */
  async servizi(ambito?: string) {
    const where: any = {};
    if (ambito === 'partner') where.scope = { in: ['partner', 'both'] };
    if (ambito === 'valet') where.scope = { in: ['valet', 'both'] };
    const righe = await this.prisma.serviceType.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, scope: true, pricingModel: true, active: true, notes: true },
    });
    return righe.map((s) => ({
      id: s.id,
      nome: s.name,
      codice: s.code,
      ambito: s.scope,
      modello: s.pricingModel,
      attivo: s.active,
      note: s.notes,
    }));
  }

  /** Una consegna sola, per il NUMERO che si legge a schermo (es. 62637). */
  async consegnaPerNumero(numero: number) {
    if (!Number.isInteger(numero) || numero <= 0 || numero > 2_147_483_647) {
      throw new NotFoundException('Numero consegna non valido.');
    }
    const d = await this.prisma.delivery.findFirst({
      where: { code: numero, deletedAt: null },
      select: AppApiService.CONSEGNA_SELECT,
    });
    if (!d) throw new NotFoundException(`Consegna #${numero} non trovata.`);
    return this.consegnaSerializzata(d);
  }
}

@ApiTags('app — canale app-to-app (chiave, non sessione)')
@Controller('app')
@Public() // fuori dal JWT utente: l'autenticazione è la chiave del guard
@UseGuards(AppApiKeyGuard)
export class AppApiController {
  constructor(
    private readonly service: AppApiService,
    private readonly richieste: RichiesteService,
  ) {}

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

  @Get('consegne')
  @ApiOperation({
    summary:
      "Le consegne una per una: esito, costo consegna scomposto e tutti i dati. Pull incrementale su `aggiornateDa`",
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app (scripts/crea-chiave-app.mjs)' })
  consegne(
    @Query('aggiornateDa') aggiornateDa?: string,
    @Query('dal') dal?: string,
    @Query('al') al?: string,
    @Query('stato') stato?: string,
    @Query('partnerId') partnerId?: string,
    @Query('limit') limit = '200',
  ) {
    return this.service.consegne({
      aggiornateDa, dal, al, stato, partnerId, limit: Number(limit) || 200,
    });
  }

  // ============================================================
  // RICHIESTE TESTUALI (28/08/2026, chiesto dall'utente)
  // ------------------------------------------------------------
  // ⚠️ Serve una chiave con SCRITTURA, come per creare una consegna: una
  // richiesta finisce in una lista che qualcuno deve leggere, e riempire quella
  // lista è una scrittura anche se non nasce ancora niente.
  //
  // ⚠️ Ma NON crea una consegna: crea una DOMANDA. È la differenza fra
  // `POST /app/consegne` (l'app sa già tutto e la consegna nasce) e questa
  // (l'app sa a parole, e decide una persona).
  // ============================================================
  @Post('richieste')
  @ApiOperation({
    summary:
      "Manda una richiesta di consegna in forma TESTUALE: finisce nella sezione Richieste, dove l'ufficio la legge e decide. Non crea nessuna consegna.",
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app CON scrittura' })
  @UseGuards(ScritturaRichiestaGuard)
  creaRichiesta(@Body() dto: CreaRichiestaDto, @Req() req: any) {
    return this.richieste.crea(dto, req.appChiave.nome ?? 'app sconosciuta');
  }

  @Get('richieste/:riferimento')
  @ApiOperation({
    summary: "Esito di una richiesta, cercato per il riferimento di chi la manda (stato, note, consegna nata)",
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app' })
  esitoRichiesta(@Param('riferimento') riferimento: string, @Req() req: any) {
    // ⚠️ Si cerca dentro l'ORIGINE della chiave che chiede: un'app non deve
    // poter leggere le richieste mandate da un'altra indovinandone il
    // riferimento — e i riferimenti sono numeri d'ordine, cioè indovinabili.
    return this.richieste.perRiferimento(req.appChiave.nome ?? '', riferimento);
  }

  @Post('consegne')
  @ApiOperation({
    summary:
      'Crea una consegna dal canale app (richiede una chiave con permesso di SCRITTURA). Stessa strada del form: prezzo dal listino del partner, paga dal listino del valet, attività e notifiche',
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app CON scrittura' })
  // ⚠️ Il permesso è un GUARD, non un controllo dentro il gestore: i guard
  // girano prima dei pipe, quindi «questa chiave non scrive» arriva prima di
  // «il campo data non è una data». Il guard del controller dice CHI sei,
  // questo dice CHE COSA puoi fare.
  @UseGuards(ScritturaRichiestaGuard)
  creaConsegna(@Body() dto: CreateDeliveryDto, @Req() req: any) {
    return this.service.creaConsegna(dto, req.appChiave.nome ?? 'app sconosciuta');
  }

  @Get('servizi')
  @ApiOperation({
    summary:
      'Il catalogo dei tipi di servizio (nome, codice, ambito partner/valet, modello di prezzo, attivo) — lo legge Deluxy Scout per decidere quali linee di interesse creare',
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app (scripts/crea-chiave-app.mjs)' })
  servizi(@Query('ambito') ambito?: string) {
    return this.service.servizi(ambito);
  }

  @Get('consegne/:numero')
  @ApiOperation({ summary: 'Una consegna sola, per il numero che si legge a schermo (es. 62637)' })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app (scripts/crea-chiave-app.mjs)' })
  consegna(@Param('numero') numero: string) {
    return this.service.consegnaPerNumero(Number(numero));
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
  // ⚠️ Serve DeliveriesModule: la creazione dal canale app passa dalla stessa
  // strada del form, non da una scorciatoia.
  imports: [DeliveriesModule, RichiesteModule],
  controllers: [AppApiController],
  providers: [AppApiKeyGuard, AppApiService],
})
export class AppApiModule {}
