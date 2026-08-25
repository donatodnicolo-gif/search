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
// ⭐ FORMULE RISCRITTE IL 25/08/2026, e prima erano capovolte: la pagina
// trattava `Delivery.price` come cio' che PAGHIAMO al partner, mentre e' la
// quota che TRATTENIAMO noi — cosi' Deluxy risultava tenersi l'87% di ogni
// vendita. E' la lettura che la Fatturazione aveva gia' («nei servizi di VENDITA
// il denaro va nell'altro verso: il cliente paga Deluxy, Deluxy trattiene la sua
// percentuale e deve il resto al partner», `invoices.module.ts`).
//
// ⭐⭐ CORRETTO ANCORA POCHE ORE DOPO, e stavolta dai numeri dell'utente.
// --------------------------------------------------------------------------
// Il valore dato al partner NON si calcola: **e' scritto**, in
// `Delivery.productValue` (nel legacy la colonna 56 di `delivery`, importata dal
// primo giorno e mai letta da questa pagina). Lo ha fatto notare l'utente:
// «per il 62395 al partner abbiamo dato 70 €» — e `productValue` di #62395 vale
// esattamente 70.
//
// Prova decisiva su 8.850 vendite: `Delivery.price` e' la fee di contratto
// calcolata su **productValue**, non sul prezzo pubblico — combacia con la fee%
// del partner entro un decimo di punto nel **92,6%** dei casi contro il 62,6%
// usando il prezzo delle righe.
//
// E il GUADAGNO e' la differenza, **al netto IVA**: #63013 → pubblico 135, al
// partner 80, differenza 55, e 55/1,22 = **45,08**, cioe' i «45» dell'utente.
// E' la stessa scelta gia' fatta in Deluxy Orders (margine sempre al netto IVA,
// 22% su tutto).
//
//   prezzoPubblico     = somma( DeliveryProduct.price x quantita )
//   datoAlPartner      = Delivery.productValue        <- SCRITTO, non dedotto
//   guadagnoLordo      = prezzoPubblico - datoAlPartner
//   guadagnoNetto      = guadagnoLordo / 1.22         <- il guadagno vero
//   iva                = guadagnoLordo - guadagnoNetto
//   feeContratto       = Delivery.price + additionalPrice  (quota a listino, per confronto)
//   feePercent         = guadagnoNetto / valoreVendite   (netto su netto: l'utente)
//   feePercentContract = Partner.commissionPercent
//   commissioneIncassi = prezzoPubblico x 3%
//   costoConsegna      = paga del valet + plus/minus, ma ZERO se `payable` e' false
//   margineTotale      = guadagnoNetto - costoConsegna - commissioneIncassi
//
// ⚠️ L'IVA **non si sottrae due volte**: il guadagno netto l'ha gia' tolta. La
// colonna IVA c'e' per farla vedere, non per rientrare nel margine.
//
// ⚠️ `Delivery.price` resta a schermo come **quota di contratto**, accanto al
// guadagno vero: sull'archivio valgono 165.739 € contro 188.007 € lordi, e dove
// si scostano c'e' qualcosa da guardare.
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
 * Gli stati che NON entrano nei corrispettivi.
 *
 * ⭐ 25/08/2026, deciso dall'utente: «metti tutti gli stati a parte quelle
 * cancelled». Prima era una lista di ammessi (`delivered`, `approved`) e
 * teneva fuori tutto il resto — comprese le vendite gia' assegnate, accettate o
 * appena create. Cercando l'ordine 12792 la pagina rispondeva «Nessuna vendita
 * nel periodo» mentre quella vendita aveva tre consegne del 25/08: erano
 * `assigned`, `accepted` e `cancelled`.
 *
 * ⚠️ Una lista di AMMESSI e una di ESCLUSI invecchiano in modo opposto: la
 * prima dimentica gli stati nuovi (e li toglie in silenzio), la seconda li
 * include per difetto. Qui la seconda e' quella giusta — l'unico stato che non
 * porta ricavo e' quello annullato.
 *
 * Effetto misurato: le vendite dell'archivio passano da 12.247 a 12.951 (+704);
 * agosto 2026 da 154 a 372 righe.
 *
 * Storia utile: qui c'era anche `delivered_time_approved`, che in banca dati
 * NON ESISTE — un valore che non combacia con nessuna riga non da' errore,
 * toglie in silenzio, e teneva fuori 550 consegne approvate.
 */
const STATI_ESCLUSI = ['cancelled'];

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
type Anomalia =
  | 'partner_oltre_pubblico'
  | 'venduto_a_zero'
  | 'valore_partner_mancante'
  | null;

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
  /** Prezzo pubblico: somma dei prezzi scritti sulle righe di consegna. */
  publicPrice: number;
  deliveryFee: number;
  saleValue: number;
  /** Quello che abbiamo dato al partner: `Delivery.productValue`, scritto. */
  partnerPrice: number;
  /** Guadagno lordo: prezzo pubblico - dato al partner. */
  takings: number;
  /** Guadagno al NETTO IVA: e' il guadagno vero. */
  takingsNet: number;
  /** La quota che sarebbe spettata a listino (`Delivery.price` + plus/minus). */
  feeContract: number;
  /** Il guadagno NETTO IVA in percentuale sul valore vendite. */
  feePercent: number;
  /** La fee scritta in anagrafica: se diverge da quella vera, si vede. */
  feePercentContract: number;
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
        status: { notIn: STATI_ESCLUSI },
        ...this.dateWhere(from, to),
        ...this.ambito(opzioni.soloVendite ?? true),
        ...this.filtri(opzioni),
      },
      // ⚠️ Un tetto c'e' sempre: senza, un periodo largo rimette la pagina
      // esattamente nella condizione da cui non rispondeva.
      take: Math.min(5000, Math.max(1, opzioni.limite ?? 2000)),
      // `productValue` e' il valore dato al partner: senza di lui questa pagina
      // deduce cio' che e' gia' scritto, ed e' l'errore appena corretto.
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
            status: { notIn: STATI_ESCLUSI },
            ...this.dateWhere(from, to),
            serviceType: { pricingModel: { not: MODELLO_VENDITA } },
            ...this.filtri(opzioni),
          },
        })
      : 0;
    // ⚠️ «Nessuna vendita nel periodo» non e' una risposta quando la vendita
    // ESISTE. Cercando 12792 la pagina diceva cosi', ma quell'ordine ha tre
    // consegne del 25/08, tutte di vendita e tutte nel periodo: erano
    // `assigned`, `accepted` e `cancelled`, cioe' non ancora consegnate. La
    // pagina fa bene a non contarle — il ricavo non e' fermo — e fa male a non
    // dirlo: chi cerca resta a chiedersi se il dato manca o se e' rotto.
    const altrove = opzioni.cerca?.trim() && rows.length === 0
      ? await this.doveSono(from, to, opzioni)
      : null;
    const sum = (f: (r: CorrispettivoRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    const saleValue = sum((r) => r.saleValue);
    const takings = sum((r) => r.takings);
    const totalMargin = sum((r) => r.totalMargin);
    return {
      deliveries: rows.length,
      /** Consegne a buon fine del periodo che NON sono vendite (fuori ambito). */
      excluded: escluse,
      /** Righe non attendibili: si contano, non si nascondono. */
      anomalie: rows.filter((r) => r.anomalia).length,
      /** Se la ricerca non trova niente: dove sta quello che si cercava. */
      altrove,
      publicPrice: round2(sum((r) => r.publicPrice)),
      deliveryFee: round2(sum((r) => r.deliveryFee)),
      saleValue: round2(saleValue),
      partnerPrice: round2(sum((r) => r.partnerPrice)),
      takings: round2(takings),
      takingsNet: round2(sum((r) => r.takingsNet)),
      feeContract: round2(sum((r) => r.feeContract)),
      feePercent: saleValue > 0 ? round2((sum((r) => r.takingsNet) / saleValue) * 100) : 0,
      deliveryCost: round2(sum((r) => r.deliveryCost)),
      vat: round2(sum((r) => r.vat)),
      incassiCommission: round2(sum((r) => r.incassiCommission)),
      totalMargin: round2(totalMargin),
      totalMarginPercent: saleValue > 0 ? round2((totalMargin / saleValue) * 100) : 0,
    };
  }

  /**
   * Quando la ricerca non trova niente, dove sono finite le consegne che
   * corrispondono lo stesso.
   *
   * Tre motivi, in ordine di quanto sono facili da fraintendere:
   *  - ci sono ma sono ANNULLATE (l'unico stato che non porta ricavo);
   *  - ci sono ma sono FUORI dal periodo scelto;
   *  - ci sono ma non sono vendite (fuori dall'ambito della pagina).
   */
  private async doveSono(
    from: string | undefined,
    to: string | undefined,
    opzioni: { partnerId?: string; cerca?: string },
  ) {
    const testo = this.filtri(opzioni);
    const vivo = { deletedAt: null };
    const [annullate, fuoriPeriodo, nonVendite] = await Promise.all([
      this.prisma.delivery.count({
        where: { ...vivo, ...testo, ...this.dateWhere(from, to),
          serviceType: { pricingModel: MODELLO_VENDITA },
          status: { in: STATI_ESCLUSI } },
      }),
      this.prisma.delivery.count({
        where: { ...vivo, ...testo, serviceType: { pricingModel: MODELLO_VENDITA },
          status: { notIn: STATI_ESCLUSI },
          NOT: this.dateWhere(from, to) },
      }),
      this.prisma.delivery.count({
        where: { ...vivo, ...testo, serviceType: { pricingModel: { not: MODELLO_VENDITA } } },
      }),
    ]);
    const totale = annullate + fuoriPeriodo + nonVendite;
    return totale ? { totale, annullate, fuoriPeriodo, nonVendite } : null;
  }

  private computeRow(d: any): CorrispettivoRow {
    const lines: any[] = d.products ?? [];
    // Il prezzo pubblico e' la fotografia di quel giorno, non il catalogo di oggi.
    const publicPrice = lines.reduce((s, l) => s + (l.price ?? 0) * (l.quantity ?? 1), 0);
    const deliveryFee = d.deliveryPrice ?? 0;
    const saleValue = publicPrice + deliveryFee;
    // ⚠️ SI LEGGE, non si calcola. E il vuoto resta vuoto: dove `productValue`
    // manca (418 vendite) non si mette zero, si dichiara — con zero il partner
    // risulterebbe non aver preso niente e il guadagno sarebbe tutto nostro.
    const haValorePartner = (d.productValue ?? 0) > 0;
    const partnerPrice = d.productValue ?? 0;
    const takings = haValorePartner ? saleValue - partnerPrice : 0;
    const takingsNet = takings / (1 + VAT);
    // L'IVA e' quella gia' tolta dal guadagno: si mostra, non si risottrae.
    const vat = takings - takingsNet;
    const feeContractAmount = Math.max(0, (d.price ?? 0) + (d.additionalPrice ?? 0));
    // ⚠️ Netto su lordo darebbe una percentuale piu' bassa del vero e nessuno
    // saprebbe di quale delle due sta guardando: l'utente la vuole sul NETTO.
    const feePercent = saleValue > 0 && haValorePartner ? (takingsNet / saleValue) * 100 : 0;
    // ⚠️ Se la consegna non e' pagabile, il suo costo e' ZERO: l'importo resta
    // scritto sulla riga (serve a sapere quanto sarebbe valsa) ma non si paga.
    // Segnalato dall'utente il 25/08/2026. Misurato: 817 vendite a buon fine
    // hanno `payable = false` e un importo scritto lo stesso, per **10.463,15 €**
    // che la pagina contava come costo — su tutte le consegne sono 1.280 per
    // 16.071,10 €. Sono i giri in cui una sola consegna porta la paga e le altre
    // no, cioe' proprio le regole carnet.
    const deliveryCost = d.payable === false ? 0 : (d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0);
    const incassiCommission = saleValue * INCASSI;
    const totalMargin = takingsNet - deliveryCost - incassiCommission;
    const feeContract = d.partner?.commissionPercent ?? 0;
    // ⚠️ Le tre cose che rendono la riga non attendibile, in ordine di gravita'.
    // Un guadagno a zero NON e' fra queste: con un partner a fee 0% e' una
    // scelta commerciale, non un buco (delle 3.003 vendite senza quota, 2.880
    // erano proprio questo — accusarle tutte avrebbe segnalato righe sane).
    const anomalia: Anomalia =
      saleValue <= 0
        ? 'venduto_a_zero'
        : !haValorePartner
          ? 'valore_partner_mancante'
          : partnerPrice > saleValue
            ? 'partner_oltre_pubblico'
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
      partnerPrice: round2(partnerPrice),
      takings: round2(takings),
      takingsNet: round2(takingsNet),
      feeContract: round2(feeContractAmount),
      feePercent: round2(feePercent),
      feePercentContract: round2(feeContract),
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
