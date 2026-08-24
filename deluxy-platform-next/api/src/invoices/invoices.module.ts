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
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Public, Roles } from '../common/decorators';
import { InvoiceStatus, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Guard per i webhook macchina-a-macchina: richiede l'header `x-api-key`
 * uguale a INVOICE_WEBHOOK_API_KEY. Nessun login utente (usato con @Public).
 */
@Injectable()
export class WebhookApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided =
      req.headers['x-api-key'] ??
      (req.headers['authorization']?.startsWith('Bearer ')
        ? req.headers['authorization'].slice(7)
        : undefined);
    const expected = process.env.INVOICE_WEBHOOK_API_KEY;
    if (!expected) throw new UnauthorizedException('Webhook fatture non configurato');
    if (provided !== expected) throw new UnauthorizedException('API key non valida');
    return true;
  }
}

/** Aliquota IVA e conversione imponibile → totale: una regola sola per tutti. */
const IVA = 22;
const conIva = (n: number) => Math.round(n * (1 + IVA / 100) * 100) / 100;

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtUser, archived = false) {
    const where: any = { archived };
    if (user.role === Role.PARTNER) where.partnerId = user.partnerId ?? '-';
    return this.prisma.invoice.findMany({
      where,
      include: {
        partner: { select: { id: true, insegna: true } },
        lines: { orderBy: { date: 'asc' } },
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  /**
   * Il lavoro ancora da fatturare, raggruppato per partner.
   *
   * È la domanda che la pagina Fatturazione non sapeva rispondere: mostrava le
   * fatture già fatte, quindi la consegna di stamattina non compariva da
   * nessuna parte finché qualcuno non indovinava partner e periodo e premeva
   * «Genera fattura». Il lavoro da fatturare non è una fattura: è l'elenco
   * delle consegne che una fattura non ce l'hanno ancora.
   *
   * Consegna da fatturare = `billable`, stato diverso da annullata/non
   * consegnata, e **nessuna riga di fattura che la citi**.
   *
   * Torna gli importi come li tratta la fattura: imponibile (somma delle
   * righe) e totale con IVA.
   */
  async pending(user: JwtUser, opzioni: { partnerId?: string; fino?: string } = {}) {
    const where: any = {
      billable: true,
      status: { notIn: InvoicesService.NON_BILLABLE_STATUSES },
      invoiceLines: { none: {} },
    };
    if (user.role === Role.PARTNER) where.partnerId = user.partnerId ?? '-';
    else if (opzioni.partnerId) where.partnerId = opzioni.partnerId;
    if (opzioni.fino) where.date = { lte: new Date(opzioni.fino) };

    const raggruppate = await this.prisma.delivery.groupBy({
      by: ['partnerId'],
      where,
      _count: { _all: true },
      _sum: { price: true, additionalPrice: true },
      _min: { date: true },
      _max: { date: true },
    });

    const partners = await this.prisma.partner.findMany({
      where: { id: { in: raggruppate.map((r) => r.partnerId).filter(Boolean) as string[] } },
      select: { id: true, insegna: true },
    });
    const nome = new Map(partners.map((p) => [p.id, p.insegna]));

    const voci = raggruppate
      .filter((r) => r.partnerId)
      .map((r) => {
        const netAmount = Math.round(((r._sum.price ?? 0) + (r._sum.additionalPrice ?? 0)) * 100) / 100;
        return {
          partnerId: r.partnerId as string,
          partner: { id: r.partnerId as string, insegna: nome.get(r.partnerId as string) ?? '—' },
          deliveriesCount: r._count._all,
          netAmount,
          vatRate: IVA,
          totalAmount: conIva(netAmount),
          from: r._min.date,
          to: r._max.date,
        };
      })
      .sort((a, b) => b.netAmount - a.netAmount);

    return {
      voci,
      totali: {
        partners: voci.length,
        deliveriesCount: voci.reduce((s, v) => s + v.deliveriesCount, 0),
        netAmount: Math.round(voci.reduce((s, v) => s + v.netAmount, 0) * 100) / 100,
        totalAmount: Math.round(voci.reduce((s, v) => s + v.totalAmount, 0) * 100) / 100,
      },
    };
  }

  /** Le consegne da fatturare di UN partner, una per una (per il dettaglio). */
  async pendingDetail(user: JwtUser, partnerId: string, fino?: string) {
    if (user.role === Role.PARTNER && user.partnerId !== partnerId) {
      throw new NotFoundException('Partner non trovato');
    }
    const where: any = {
      partnerId,
      billable: true,
      status: { notIn: InvoicesService.NON_BILLABLE_STATUSES },
      invoiceLines: { none: {} },
    };
    if (fino) where.date = { lte: new Date(fino) };
    const deliveries = await this.prisma.delivery.findMany({
      where,
      select: {
        id: true, code: true, date: true, status: true, price: true, additionalPrice: true,
        recipientFirstName: true, recipientLastName: true, recipientAddress: true,
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
    return {
      deliveries: deliveries.map((d) => ({
        ...d,
        amount: Math.round(((d.price ?? 0) + (d.additionalPrice ?? 0)) * 100) / 100,
      })),
      troncato: deliveries.length === 500,
    };
  }

  // Stati esclusi dalla fatturazione: annullata e non consegnata.
  private static readonly NON_BILLABLE_STATUSES = ['cancelled', 'notDelivered'];

  /**
   * Genera la fattura del periodo per un partner: una riga per ogni consegna
   * "da fatturare" (billable) del periodo, in qualsiasi stato tranne
   * annullata/non consegnata. Importo riga = price + additionalPrice.
   *
   * ⚠️ Salta le consegne che stanno GIÀ su una fattura. Senza questo filtro
   * rigenerare lo stesso periodo lo fatturava una seconda volta, in silenzio:
   * nei dati importati dal legacy 13 consegne risultano fatturate due volte.
   */
  async generate(partnerId: string, periodStart: string, periodEnd: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException('Partner non trovato');

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        partnerId,
        billable: true,
        status: { notIn: InvoicesService.NON_BILLABLE_STATUSES },
        date: { gte: new Date(periodStart), lte: new Date(periodEnd) },
        invoiceLines: { none: {} },
      },
      orderBy: { date: 'asc' },
    });
    const lines = deliveries.map((d) => ({
      deliveryId: d.id,
      date: d.date,
      recipient: `${d.recipientLastName} ${d.recipientFirstName}`.trim(),
      description: d.recipientAddress ?? null,
      amount: (d.price ?? 0) + (d.additionalPrice ?? 0),
    }));
    // L'imponibile è la somma delle righe; il totale del documento è con IVA.
    // ⚠️ Prima qui il totale ERA l'imponibile: le fatture nuove sarebbero
    // uscite senza IVA, incoerenti con le 559 storiche (che l'IVA la hanno).
    const netAmount = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
    const vatRate = IVA;
    const totalAmount = conIva(netAmount);
    const year = new Date(periodStart).getFullYear();
    const count = await this.prisma.invoice.count();

    return this.prisma.invoice.create({
      data: {
        partnerId,
        number: `FAT-${year}-${count + 1}`,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        netAmount,
        vatRate,
        totalAmount,
        deliveriesCount: lines.length,
        status: InvoiceStatus.DRAFT,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  }

  /** Avanzamento: DRAFT -> ISSUED (emessa: archivia in storico) -> PAID (pagata). */
  async updateStatus(id: string, status: InvoiceStatus) {
    const data: any = { status };
    if (status === InvoiceStatus.ISSUED) { data.issuedAt = new Date(); data.archived = true; }
    if (status === InvoiceStatus.PAID) data.paidAt = new Date();
    return this.prisma.invoice.update({ where: { id }, data });
  }

  /**
   * Webhook: un sistema esterno (es. contabilità) segnala che una fattura è stata
   * pagata. Identifica la fattura per `id` o per `number` (es. FAT-2026-3).
   * Idempotente: se già pagata la ritorna senza modifiche.
   */
  async markPaidByWebhook(body: { id?: string; number?: string; paidAt?: string }) {
    if (!body.id && !body.number) {
      throw new BadRequestException('Fornisci `id` o `number` della fattura');
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: body.id ? { id: body.id } : { number: body.number },
    });
    if (!invoice) throw new NotFoundException('Fattura non trovata');
    if (invoice.status === InvoiceStatus.PAID) {
      return { esito: 'gia_pagata', fattura: invoice };
    }
    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        archived: true,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        issuedAt: invoice.issuedAt ?? new Date(),
      },
    });
    return { esito: 'aggiornata', fattura: updated };
  }

  /** Riapre una fattura dallo storico: torna in bozza. Solo se non ancora pagata. */
  async reopen(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Fattura non trovata');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Una fattura già pagata non può essere riaperta');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { archived: false, status: InvoiceStatus.DRAFT, issuedAt: null, paidAt: null },
    });
  }
}

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista fatture (il partner vede le proprie). archived=true per lo storico' })
  @ApiQuery({ name: 'archived', required: false })
  findAll(@CurrentUser() user: JwtUser, @Query('archived') archived?: string) {
    return this.invoicesService.findAll(user, archived === 'true');
  }

  @Get('pending')
  @ApiOperation({ summary: 'Il lavoro ancora da fatturare, per partner (consegne senza fattura)' })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'fino', required: false, description: 'Solo le consegne fino a questa data (ISO)' })
  pending(@CurrentUser() user: JwtUser, @Query('partnerId') partnerId?: string, @Query('fino') fino?: string) {
    return this.invoicesService.pending(user, { partnerId, fino });
  }

  @Get('pending/:partnerId')
  @ApiOperation({ summary: 'Le consegne da fatturare di un partner, una per una' })
  @ApiQuery({ name: 'fino', required: false })
  pendingDetail(@CurrentUser() user: JwtUser, @Param('partnerId') partnerId: string, @Query('fino') fino?: string) {
    return this.invoicesService.pendingDetail(user, partnerId, fino);
  }

  @Post('generate')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Genera la fattura del periodo (somma delle consegne da fatturare)' })
  generate(@Body() body: { partnerId: string; periodStart: string; periodEnd: string }) {
    return this.invoicesService.generate(body.partnerId, body.periodStart, body.periodEnd);
  }

  @Post('webhook/paid')
  @Public()
  @UseGuards(WebhookApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({
    summary:
      'Webhook (x-api-key): un sistema esterno segnala che una fattura è pagata. Body: { id | number, paidAt? }',
  })
  markPaidWebhook(@Body() body: { id?: string; number?: string; paidAt?: string }) {
    return this.invoicesService.markPaidByWebhook(body);
  }

  @Post(':id/reopen')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Riapre dallo storico (solo se non pagata): torna in bozza' })
  reopen(@Param('id') id: string) {
    return this.invoicesService.reopen(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Avanza il flusso: DRAFT -> ISSUED -> PAID' })
  updateStatus(@Param('id') id: string, @Body() body: { status: InvoiceStatus }) {
    return this.invoicesService.updateStatus(id, body.status);
  }
}

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
