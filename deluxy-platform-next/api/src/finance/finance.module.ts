// ============================================================
// Finanza (sezione riservata agli admin abilitati)
// ------------------------------------------------------------
// Replica la schermata Finanza (/finanza) dell'app reale, §3.8 del
// manuale COME-FUNZIONA-APP-DELUXY.md, con due tab:
//  - CORRISPETTIVI: una riga per consegna con i valori economici e il
//    "primo margine".
//  - MARGINI: i totali dell'azienda nel periodo.
//
// ⚠️ ASSUNZIONI DA VERIFICARE SULLO SCHERMO REALE
// Il nuovo schema non modella una "fee/commissione" esplicita ne' collega le
// Vendite alle Consegne. Le colonne Fee/margine sono quindi DERIVATE dai dati
// disponibili con queste formule (documentate qui e nel manuale):
//   valoreVendite  = somma (prezzo prodotto in consegna x quantita)
//   prezzoPubblico = somma (publicPrice prodotto x quantita)
//   prezzoPartner  = Delivery.price (prezzo riconosciuto al partner)
//   fee            = valoreVendite - prezzoPartner   (quanto trattiene Deluxy)
//   fee%           = fee / valoreVendite
//   fee+IVA        = fee x 1.22
//   costoConsegna  = Delivery.valetSalary (paga del valet)
//   primoMargine   = fee - costoConsegna
//   primoMargine%  = primoMargine / valoreVendite
// Se sull'app reale la fee ha una fonte diversa (commissione a listino, per
// categoria/partner), va sostituita la formula in computeRow().
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
import { PrismaService } from '../prisma/prisma.service';

/** IVA applicata alla fee (22%). */
const VAT = 0.22;
/** Stati consegna che concorrono ai corrispettivi (consegne andate a buon fine). */
const REVENUE_STATUSES = ['delivered', 'delivered_time_approved'];

interface CorrispettivoRow {
  deliveryId: string;
  deliveryCode: number;
  status: string;
  date: Date;
  product: string;
  category: string | null;
  partner: string;
  saleValue: number;
  publicPrice: number;
  partnerPrice: number;
  feePercent: number;
  feeValue: number;
  feeWithVat: number;
  deliveryCost: number;
  firstMargin: number;
  firstMarginPercent: number;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private dateWhere(from?: string, to?: string) {
    if (!from && !to) return {};
    return {
      date: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    };
  }

  /** Righe corrispettivi: una per consegna a buon fine nel periodo. */
  async corrispettivi(from?: string, to?: string): Promise<CorrispettivoRow[]> {
    const deliveries = await this.prisma.delivery.findMany({
      where: { status: { in: REVENUE_STATUSES }, ...this.dateWhere(from, to) },
      include: {
        partner: { select: { insegna: true } },
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

  /** Totali dell'azienda nel periodo (tab MARGINI). */
  async summary(from?: string, to?: string) {
    const rows = await this.corrispettivi(from, to);
    const sum = (f: (r: CorrispettivoRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    const saleValue = sum((r) => r.saleValue);
    const firstMargin = sum((r) => r.firstMargin);
    return {
      deliveries: rows.length,
      saleValue: round2(saleValue),
      publicPrice: round2(sum((r) => r.publicPrice)),
      partnerPrice: round2(sum((r) => r.partnerPrice)),
      feeValue: round2(sum((r) => r.feeValue)),
      feeWithVat: round2(sum((r) => r.feeWithVat)),
      deliveryCost: round2(sum((r) => r.deliveryCost)),
      firstMargin: round2(firstMargin),
      firstMarginPercent: saleValue > 0 ? round2((firstMargin / saleValue) * 100) : 0,
    };
  }

  private computeRow(d: any): CorrispettivoRow {
    const lines: any[] = d.products ?? [];
    const saleValue = lines.reduce(
      (s, l) => s + (l.price ?? l.product.price ?? 0) * (l.quantity ?? 1),
      0,
    );
    const publicPrice = lines.reduce(
      (s, l) => s + (l.product.publicPrice ?? l.product.price ?? 0) * (l.quantity ?? 1),
      0,
    );
    const partnerPrice = (d.price ?? 0) + (d.additionalPrice ?? 0);
    const deliveryCost = (d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0);
    const feeValue = saleValue - partnerPrice;
    const firstMargin = feeValue - deliveryCost;
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
      saleValue: round2(saleValue),
      publicPrice: round2(publicPrice),
      partnerPrice: round2(partnerPrice),
      feePercent: saleValue > 0 ? round2((feeValue / saleValue) * 100) : 0,
      feeValue: round2(feeValue),
      feeWithVat: round2(feeValue * (1 + VAT)),
      deliveryCost: round2(deliveryCost),
      firstMargin: round2(firstMargin),
      firstMarginPercent: saleValue > 0 ? round2((firstMargin / saleValue) * 100) : 0,
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
  @ApiOperation({ summary: 'Corrispettivi per consegna (solo admin)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  corrispettivi(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertAdmin(user);
    return this.financeService.corrispettivi(from, to);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Margini totali dell azienda (solo admin)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  summary(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertAdmin(user);
    return this.financeService.summary(from, to);
  }
}

@Module({
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
