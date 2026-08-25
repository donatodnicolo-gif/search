// ============================================================
// Finanza (sezione riservata agli admin abilitati)
// ------------------------------------------------------------
// Replica la schermata Finanza (/finanza) dell'app reale, §3.8 del manuale
// COME-FUNZIONA-APP-DELUXY.md. Le FORMULE sono quelle verificate sull'app reale
// (21/07, sessione admin) e documentate nel manuale:
//   valoreVendite      = prezzoPubblico + consegnaPrezzo
//   feeValue           = (Partner.commissionPercent/100) x prezzoPartner
//   feeConIva          = feeValue x 1.22
//   primoMargine       = valoreVendite - prezzoPartner + feeValue
//   corrispettivo      = valoreVendite - prezzoPartner
//   iva                = corrispettivo x 22%
//   commissioneIncassi = valoreVendite x 3%
//   margineTotale      = primoMargine - costoConsegna - iva - commissioneIncassi
//   incassoPartner     = prezzoPartner - feeConIva
//
// Nota residua: nel nuovo ambiente la riga e' per CONSEGNA (con i suoi prodotti
// aggregati per il prezzo pubblico), non ancora per vendita: manca il legame
// Vendita<->Consegna. IVA e commissione incassi sono costanti qui sotto
// (candidate a diventare impostazioni admin).
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

/** IVA applicata a fee e corrispettivo (22%). */
const VAT = 0.22;
/** Commissione incassi (3% del valore vendite). */
const INCASSI = 0.03;
/** Stati consegna che concorrono ai corrispettivi (consegne a buon fine). */
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

interface CorrispettivoRow {
  deliveryId: string;
  deliveryCode: number;
  status: string;
  date: Date;
  product: string;
  category: string | null;
  partner: string;
  publicPrice: number;
  deliveryFee: number;
  saleValue: number;
  partnerPrice: number;
  feePercent: number;
  feeValue: number;
  feeWithVat: number;
  deliveryCost: number;
  firstMargin: number;
  firstMarginPercent: number;
  takings: number;
  vat: number;
  incassiCommission: number;
  totalMargin: number;
  totalMarginPercent: number;
  partnerPayout: number;
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

  async corrispettivi(
    from?: string,
    to?: string,
    opzioni: { partnerId?: string; cerca?: string; limite?: number } = {},
  ): Promise<CorrispettivoRow[]> {
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        status: { in: REVENUE_STATUSES },
        ...this.dateWhere(from, to),
        ...this.filtri(opzioni),
      },
      // ⚠️ Un tetto c'e' sempre: senza, un periodo largo rimette la pagina
      // esattamente nella condizione da cui non rispondeva.
      take: Math.min(5000, Math.max(1, opzioni.limite ?? 2000)),
      include: {
        partner: { select: { insegna: true, commissionPercent: true } },
        products: {
          include: {
            product: {
              select: {
                name: true,
                price: true,
                publicPrice: true,
                category: { select: { name: true } },
              },
            },
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
  async summary(from?: string, to?: string, opzioni: { partnerId?: string; cerca?: string } = {}) {
    const rows = await this.corrispettivi(from, to, { ...opzioni, limite: 5000 });
    const sum = (f: (r: CorrispettivoRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    const saleValue = sum((r) => r.saleValue);
    const totalMargin = sum((r) => r.totalMargin);
    const firstMargin = sum((r) => r.firstMargin);
    return {
      deliveries: rows.length,
      publicPrice: round2(sum((r) => r.publicPrice)),
      deliveryFee: round2(sum((r) => r.deliveryFee)),
      saleValue: round2(saleValue),
      partnerPrice: round2(sum((r) => r.partnerPrice)),
      feeValue: round2(sum((r) => r.feeValue)),
      feeWithVat: round2(sum((r) => r.feeWithVat)),
      deliveryCost: round2(sum((r) => r.deliveryCost)),
      firstMargin: round2(firstMargin),
      firstMarginPercent: saleValue > 0 ? round2((firstMargin / saleValue) * 100) : 0,
      takings: round2(sum((r) => r.takings)),
      vat: round2(sum((r) => r.vat)),
      incassiCommission: round2(sum((r) => r.incassiCommission)),
      totalMargin: round2(totalMargin),
      totalMarginPercent: saleValue > 0 ? round2((totalMargin / saleValue) * 100) : 0,
      partnerPayout: round2(sum((r) => r.partnerPayout)),
    };
  }

  private computeRow(d: any): CorrispettivoRow {
    const lines: any[] = d.products ?? [];
    const publicPrice = lines.reduce(
      (s, l) => s + (l.product.publicPrice ?? l.product.price ?? 0) * (l.quantity ?? 1),
      0,
    );
    const deliveryFee = d.deliveryPrice ?? 0;
    const saleValue = publicPrice + deliveryFee;
    const partnerPrice = (d.price ?? 0) + (d.additionalPrice ?? 0);
    const feePercent = d.partner?.commissionPercent ?? 0;
    const feeValue = (feePercent / 100) * partnerPrice;
    const feeWithVat = feeValue * (1 + VAT);
    const deliveryCost = (d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0);
    const firstMargin = saleValue - partnerPrice + feeValue;
    const takings = saleValue - partnerPrice;
    const vat = takings * VAT;
    const incassiCommission = saleValue * INCASSI;
    const totalMargin = firstMargin - deliveryCost - vat - incassiCommission;
    const partnerPayout = partnerPrice - feeWithVat;
    const first = lines[0]?.product;
    const productLabel = first
      ? lines.length > 1
        ? `${first.name} +${lines.length - 1}`
        : first.name
      : '—';
    return {
      deliveryId: d.id,
      deliveryCode: d.code,
      status: d.status,
      date: d.date,
      product: productLabel,
      category: first?.category?.name ?? null,
      partner: d.partner?.insegna ?? '—',
      publicPrice: round2(publicPrice),
      deliveryFee: round2(deliveryFee),
      saleValue: round2(saleValue),
      partnerPrice: round2(partnerPrice),
      feePercent: round2(feePercent),
      feeValue: round2(feeValue),
      feeWithVat: round2(feeWithVat),
      deliveryCost: round2(deliveryCost),
      firstMargin: round2(firstMargin),
      firstMarginPercent: saleValue > 0 ? round2((firstMargin / saleValue) * 100) : 0,
      takings: round2(takings),
      vat: round2(vat),
      incassiCommission: round2(incassiCommission),
      totalMargin: round2(totalMargin),
      totalMarginPercent: saleValue > 0 ? round2((totalMargin / saleValue) * 100) : 0,
      partnerPayout: round2(partnerPayout),
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

  @Get('corrispettivi')
  @ApiOperation({ summary: 'Corrispettivi per consegna a buon fine (solo admin)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'cerca', required: false, description: 'Numero ordine/consegna, destinatario o partner' })
  @ApiQuery({ name: 'limite', required: false })
  corrispettivi(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('partnerId') partnerId?: string,
    @Query('cerca') cerca?: string,
    @Query('limite') limite?: string,
  ) {
    this.assertAdmin(user);
    return this.financeService.corrispettivi(from, to, {
      partnerId, cerca, limite: limite ? Number(limite) : undefined,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totali del periodo (solo admin)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'cerca', required: false })
  summary(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('partnerId') partnerId?: string,
    @Query('cerca') cerca?: string,
  ) {
    this.assertAdmin(user);
    return this.financeService.summary(from, to, { partnerId, cerca });
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
