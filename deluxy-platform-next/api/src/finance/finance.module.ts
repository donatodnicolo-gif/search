// ============================================================
// Finanza (sezione riservata agli admin abilitati)
// ------------------------------------------------------------
// Replica la schermata Finanza (/finanza) dell'app reale, §3.8 del manuale
// COME-FUNZIONA-APP-DELUXY.md.
//
// AMBITO (25/08/2026, deciso dall'utente): i CORRISPETTIVI riguardano SOLO i
// servizi di tipo VENDITA. Su un servizio di sola consegna (PREZZO_FISSO,
// A_ORA, MAGAZZINO, CORPORATE) il denaro va nel verso opposto — il partner e'
// il CLIENTE e la consegna gli viene FATTURATA — e le formule di qui sotto non
// significherebbero niente. Sommarle insieme non fa un totale piu' grande, fa
// un totale sbagliato.
//
// ⭐ FORMULE RISCRITTE IL 25/08/2026, e prima erano capovolte.
// -----------------------------------------------------------
// `Delivery.price` su una VENDITA e' la QUOTA CHE TRATTENIAMO NOI, non cio' che
// paghiamo al partner. Misurato sulle 12.247 vendite: vale il 12,5% del valore
// dei prodotti, e su 8.470 righe **5.221 (il 62%)** hanno quella quota identica
// **entro un decimo di punto** alla fee% dichiarata del partner; solo 159
// (l'1,9%) superano meta' del venduto, cioe' sono anche solo compatibili con la
// lettura vecchia. Esempio deciso dall'utente: bouquet da 410 €, quota 73,80 €
// (= 18%, la fee di Arte e Fiori Firenze) → **al fioraio dobbiamo 336,20 €**,
// non 73,80.
//
// E' la stessa lettura della Fatturazione (`invoices.module.ts`,
// `prezzoConsegna`: «nei servizi di VENDITA il denaro va nell'altro verso: il
// cliente paga Deluxy, Deluxy trattiene la sua percentuale e deve il resto al
// partner»), gia' verificata sui dati veri. Ora i due moduli dicono lo stesso
// numero sugli stessi ordini.
//
//   venduto            = somma( DeliveryProduct.price x quantita )
//   consegnaPrezzo     = Delivery.deliveryPrice        (qui sempre 0, vedi sotto)
//   valoreVendite      = venduto + consegnaPrezzo
//   corrispettivo      = Delivery.price + additionalPrice   <- QUELLO CHE RESTA A NOI
//   dovutoAlPartner    = valoreVendite - corrispettivo
//   feePercent         = corrispettivo / valoreVendite       (la fee VERA, dai soldi)
//   feePercentContract = Partner.commissionPercent           (quella in anagrafica)
//   corrispettivoConIva= corrispettivo x 1.22
//   iva                = corrispettivo x 22%
//   commissioneIncassi = valoreVendite x 3%
//   costoConsegna      = paga del valet + plus/minus
//   margineTotale      = corrispettivo - costoConsegna - iva - commissioneIncassi
//
// ⚠️ Il venduto si legge dalla RIGA DI CONSEGNA (`DeliveryProduct.price`, la
// fotografia di quel giorno), non dal catalogo: il catalogo intanto cambia, e
// un prodotto riprezzato riscriverebbe la storia di consegne gia' fatte. Prima
// si leggeva da li' (`Product.publicPrice ?? Product.price`) e dava 1.220.337 €
// contro 1.297.560 € — il quarto calcolo diverso dello stesso numero dentro lo
// stesso progetto. Ora la fonte e' una sola, la stessa della Fatturazione.
//
// ⚠️ Tre colonne sono sparite perche' erano lo STESSO numero sotto nomi
// diversi: con questa lettura «primo margine» e «fee value» valgono entrambi il
// corrispettivo, e «incasso partner» vale il dovuto al partner. Ripetere un
// numero sotto piu' intestazioni non aggiunge informazione, aggiunge occasioni
// di leggerlo male.
//
// La "consegna prezzo" vale ZERO, ed e' NORMALE (l'utente, 25/08/2026): nel
// valore vendite conta il valore del PRODOTTO. `Delivery.deliveryPrice` e' null
// su tutte le 61.836 consegne perche' nel `delivery` legacy quella colonna non
// esiste — e' un addendo che qui non c'e', non un dato perso.
//
// IVA e commissione incassi sono costanti qui sotto (candidate a diventare
// impostazioni admin).
// ============================================================
import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/** IVA applicata al corrispettivo (22%). */
const VAT = 0.22;
/** Commissione incassi (3% del valore vendite). */
const INCASSI = 0.03;
/**
 * Gli stati che portano ricavo.
 *
 * ⚠️ Qui c'era `delivered_time_approved`, che in banca dati NON ESISTE: gli
 * stati veri sono `delivered_time_to_approve` (in attesa del via libera) e
 * `approved` (approvata). Un valore che non combacia con nessuna riga non da'
 * errore, toglie in silenzio: 550 consegne approvate restavano fuori dai conti
 * della Finanza. È la stessa grafia sbagliata trovata in Fatturazione e negli
 * Stipendi.
 *
 * `delivered_time_to_approve` resta FUORI: l'orario non e' ancora approvato, e
 * finche' non lo e' il ricavo non e' fermo.
 */
const REVENUE_STATUSES = ['delivered', 'approved'];

/**
 * Il `pricingModel` dei servizi di VENDITA (`ServiceType.pricingModel`).
 *
 * ⚠️ E' il servizio del PARTNER (`Delivery.serviceType`), non quello del valet
 * (`Delivery.valetServiceId`): sullo stesso record convivono due tassonomie, e
 * leggere l'una per l'altra qui vorrebbe dire filtrare per il lavoro del valet
 * invece che per il tipo di vendita.
 */
const MODELLO_VENDITA = 'VENDITA';

/**
 * Perche' una riga non e' attendibile.
 *
 * ⚠️ Una riga sbagliata non si nasconde e non si aggiusta da sola: si mostra
 * col motivo. Sono errori di inserimento del prezzo (l'utente, 25/08/2026) e
 * vanno corretti alla fonte — `scripts/estrai-anomalie-prezzo-vendite.mjs` li
 * tira fuori tutti, col confronto contro l'ordine Shopify.
 */
type Anomalia = 'quota_oltre_venduto' | 'venduto_a_zero' | 'quota_a_zero' | null;

interface CorrispettivoRow {
  deliveryId: string;
  deliveryCode: number;
  status: string;
  date: Date;
  product: string;
  category: string | null;
  /** Il servizio del partner: e' cio' per cui la riga e' qui (sempre di VENDITA). */
  service: string;
  partner: string;
  /** Somma dei prezzi scritti sulle righe di consegna. */
  publicPrice: number;
  deliveryFee: number;
  saleValue: number;
  /** Quello che resta a noi: `Delivery.price` + plus/minus. */
  takings: number;
  /** Quello che dobbiamo al partner: valore vendite - corrispettivo. */
  partnerPrice: number;
  /** La fee vera, ricavata dagli importi. */
  feePercent: number;
  /** La fee scritta in anagrafica: se diverge da quella vera, si vede. */
  feePercentContract: number;
  feeWithVat: number;
  deliveryCost: number;
  vat: number;
  incassiCommission: number;
  totalMargin: number;
  totalMarginPercent: number;
  anomalia: Anomalia;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Il periodo, col MESE IN CORSO come predefinito.
   *
   * ⚠️ Senza un periodo la pagina caricava TUTTO: 54.576 consegne con dentro
   * 52.713 righe prodotto, ciascuna col suo prodotto e la sua categoria.
   * `/finance/summary` non rispondeva nemmeno dopo tre minuti e
   * `/finance/corrispettivi` dava 500 dopo 24 secondi. Una pagina di
   * marginalita' si guarda per periodo: «tutto dal 2020» non e' una domanda che
   * qualcuno si fa davvero.
   */
  private dateWhere(from?: string, to?: string) {
    if (!from && !to) {
      const oggi = new Date();
      const primo = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1));
      return { date: { gte: primo } };
    }
    return {
      date: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      },
    };
  }

  /**
   * I filtri della pagina.
   *
   * `cerca` guarda il NUMERO D'ORDINE in tutte le forme in cui la piattaforma
   * lo tiene — sono quattro, e cercarne una sola vuol dire non trovare:
   *  - `code`: il numero della consegna;
   *  - `legacyOrderId`: il numero d'ordine del vecchio sistema (e' quello che
   *    si legge in Orders, es. 12802);
   *  - `realOrderNumber`: l'id Shopify lungo;
   *  - `legacySaleId`: l'id della vendita.
   * Piu' il nome del destinatario e del partner, che e' come si cerca quando il
   * numero non ce l'hai sotto mano.
   */
  private filtri(opzioni: { partnerId?: string; cerca?: string } = {}) {
    const w: any = {};
    if (opzioni.partnerId) w.partnerId = opzioni.partnerId;
    const t = opzioni.cerca?.trim();
    if (t) {
      const n = Number(t);
      w.OR = [
        ...(Number.isInteger(n) ? [{ code: n }, { legacyOrderId: n }] : []),
        { realOrderNumber: { contains: t, mode: 'insensitive' } },
        { legacySaleId: { contains: t, mode: 'insensitive' } },
        { recipientLastName: { contains: t, mode: 'insensitive' } },
        { partner: { insegna: { contains: t, mode: 'insensitive' } } },
      ];
    }
    return w;
  }

  /**
   * L'ambito: solo i servizi di VENDITA.
   *
   * `soloVendite: false` resta per chi vuole davvero guardare tutte le consegne
   * a buon fine (analisi, controprove). La pagina non lo usa, e chi lo usa deve
   * sapere che su quelle righe le formule dei corrispettivi non significano
   * niente.
   */
  private ambito(soloVendite = true) {
    return soloVendite ? { serviceType: { pricingModel: MODELLO_VENDITA } } : {};
  }

  async corrispettivi(
    from?: string,
    to?: string,
    opzioni: { partnerId?: string; cerca?: string; limite?: number; soloVendite?: boolean } = {},
  ): Promise<CorrispettivoRow[]> {
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        status: { in: REVENUE_STATUSES },
        ...this.dateWhere(from, to),
        ...this.ambito(opzioni.soloVendite ?? true),
        ...this.filtri(opzioni),
      },
      // ⚠️ Un tetto c'e' sempre: senza, un periodo largo rimette la pagina
      // esattamente nella condizione da cui non rispondeva.
      take: Math.min(5000, Math.max(1, opzioni.limite ?? 2000)),
      include: {
        partner: { select: { insegna: true, commissionPercent: true } },
        serviceType: { select: { name: true, pricingModel: true } },
        products: {
          include: {
            product: { select: { name: true, category: { select: { name: true } } } },
          },
        },
      },
      orderBy: { date: 'desc' },
    });
    return deliveries.map((d) => this.computeRow(d));
  }

  /**
   * Totali del periodo (riga «Totale» + tab Margini).
   *
   * ⚠️ Somma le STESSE righe che la tabella mostra, filtri compresi: un totale
   * calcolato su un insieme diverso da quello elencato e' la cosa piu' facile
   * da sbagliare e la piu' difficile da accorgersene — i numeri sono tutti
   * plausibili, solo non si sommano.
   */
  async summary(
    from?: string,
    to?: string,
    opzioni: { partnerId?: string; cerca?: string; soloVendite?: boolean } = {},
  ) {
    const soloVendite = opzioni.soloVendite ?? true;
    const rows = await this.corrispettivi(from, to, { ...opzioni, limite: 5000 });
    // ⚠️ Un filtro che toglie righe va DETTO, come il tetto delle 5.000: se la
    // pagina mostra 154 consegne dove il periodo ne ha 558, chi guarda deve
    // sapere che le altre 404 non sono sparite, sono di un altro mestiere.
    const escluse = soloVendite
      ? await this.prisma.delivery.count({
          where: {
            deletedAt: null,
            status: { in: REVENUE_STATUSES },
            ...this.dateWhere(from, to),
            serviceType: { pricingModel: { not: MODELLO_VENDITA } },
            ...this.filtri(opzioni),
          },
        })
      : 0;
    const sum = (f: (r: CorrispettivoRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    const saleValue = sum((r) => r.saleValue);
    const takings = sum((r) => r.takings);
    const totalMargin = sum((r) => r.totalMargin);
    return {
      deliveries: rows.length,
      /** Consegne a buon fine del periodo che NON sono vendite (fuori ambito). */
      excluded: escluse,
      /** Righe col prezzo sbagliato in origine: si contano, non si nascondono. */
      anomalie: rows.filter((r) => r.anomalia).length,
      publicPrice: round2(sum((r) => r.publicPrice)),
      deliveryFee: round2(sum((r) => r.deliveryFee)),
      saleValue: round2(saleValue),
      takings: round2(takings),
      partnerPrice: round2(sum((r) => r.partnerPrice)),
      feePercent: saleValue > 0 ? round2((takings / saleValue) * 100) : 0,
      feeWithVat: round2(sum((r) => r.feeWithVat)),
      deliveryCost: round2(sum((r) => r.deliveryCost)),
      vat: round2(sum((r) => r.vat)),
      incassiCommission: round2(sum((r) => r.incassiCommission)),
      totalMargin: round2(totalMargin),
      totalMarginPercent: saleValue > 0 ? round2((totalMargin / saleValue) * 100) : 0,
    };
  }

  private computeRow(d: any): CorrispettivoRow {
    const lines: any[] = d.products ?? [];
    // Il venduto e' la fotografia di quel giorno, non il catalogo di oggi.
    const publicPrice = lines.reduce((s, l) => s + (l.price ?? 0) * (l.quantity ?? 1), 0);
    const deliveryFee = d.deliveryPrice ?? 0;
    const saleValue = publicPrice + deliveryFee;
    // Quello che resta a noi. Uno sconto non puo' portarlo sotto zero: e' la
    // stessa regola della Fatturazione (`mai_negativo`).
    const takings = Math.max(0, (d.price ?? 0) + (d.additionalPrice ?? 0));
    const partnerPrice = Math.max(0, saleValue - takings);
    const feePercent = saleValue > 0 ? (takings / saleValue) * 100 : 0;
    const feeWithVat = takings * (1 + VAT);
    const deliveryCost = (d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0);
    const vat = takings * VAT;
    const incassiCommission = saleValue * INCASSI;
    const totalMargin = takings - deliveryCost - vat - incassiCommission;
    const feeContract = d.partner?.commissionPercent ?? 0;
    // ⚠️ In ordine: la prima rende la riga impossibile (tratteniamo piu' di
    // quanto e' stato venduto), le altre due dicono che manca un pezzo.
    //
    // ⚠️⚠️ «Niente trattenuto» e' un'anomalia SOLO se il partner una fee ce
    // l'ha. Con la fee a 0% non abbiamo trattenuto niente perche' non si doveva
    // trattenere niente: e' una scelta commerciale, non un buco. Misurato il
    // 25/08: delle 3.003 vendite senza quota, **2.880** sono di partner a fee
    // zero e solo **123** sono un dato mancante (2.206 € di quota). Segnalarle
    // tutte avrebbe accusato 2.880 righe sane — e' la stessa distinzione che la
    // Fatturazione aveva gia' dovuto imparare.
    const anomalia: Anomalia =
      saleValue <= 0
        ? 'venduto_a_zero'
        : takings > saleValue
          ? 'quota_oltre_venduto'
          : takings <= 0 && feeContract > 0
            ? 'quota_a_zero'
            : null;
    const first = lines[0];
    const productLabel = lines.length
      ? lines.length > 1
        ? `${first?.product?.name ?? first?.productName ?? '—'} +${lines.length - 1}`
        : (first?.product?.name ?? first?.productName ?? '—')
      : '—';
    return {
      deliveryId: d.id,
      deliveryCode: d.code,
      status: d.status,
      date: d.date,
      product: productLabel,
      category: first?.product?.category?.name ?? null,
      service: d.serviceType?.name ?? '—',
      partner: d.partner?.insegna ?? '—',
      publicPrice: round2(publicPrice),
      deliveryFee: round2(deliveryFee),
      saleValue: round2(saleValue),
      takings: round2(takings),
      partnerPrice: round2(partnerPrice),
      feePercent: round2(feePercent),
      feePercentContract: round2(feeContract),
      feeWithVat: round2(feeWithVat),
      deliveryCost: round2(deliveryCost),
      vat: round2(vat),
      incassiCommission: round2(incassiCommission),
      totalMargin: round2(totalMargin),
      totalMarginPercent: saleValue > 0 ? round2((totalMargin / saleValue) * 100) : 0,
      anomalia,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  /** Finanza/marginalita': solo admin (compresi gli admin "support"). */
  private assertAdmin(user: JwtUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Sezione Finanza riservata agli admin');
    }
  }

  /** `soloVendite`: assente o diverso da `false` = solo servizi di VENDITA. */
  private soloVendite(v?: string): boolean {
    return v !== 'false' && v !== '0';
  }

  @Get('corrispettivi')
  @ApiOperation({
    summary: 'Corrispettivi delle consegne a buon fine di tipo VENDITA (solo admin)',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'cerca', required: false, description: 'Numero ordine/consegna, destinatario o partner' })
  @ApiQuery({ name: 'limite', required: false })
  @ApiQuery({
    name: 'soloVendite',
    required: false,
    description: 'Predefinito true: solo i servizi di tipo VENDITA. `false` per tutte le consegne',
  })
  corrispettivi(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('partnerId') partnerId?: string,
    @Query('cerca') cerca?: string,
    @Query('limite') limite?: string,
    @Query('soloVendite') soloVendite?: string,
  ) {
    this.assertAdmin(user);
    return this.financeService.corrispettivi(from, to, {
      partnerId,
      cerca,
      limite: limite ? Number(limite) : undefined,
      soloVendite: this.soloVendite(soloVendite),
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totali del periodo (solo admin)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'cerca', required: false })
  @ApiQuery({ name: 'soloVendite', required: false, description: 'Predefinito true' })
  summary(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('partnerId') partnerId?: string,
    @Query('cerca') cerca?: string,
    @Query('soloVendite') soloVendite?: string,
  ) {
    this.assertAdmin(user);
    return this.financeService.summary(from, to, {
      partnerId,
      cerca,
      soloVendite: this.soloVendite(soloVendite),
    });
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
