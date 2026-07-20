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

  // Stati esclusi dalla fatturazione: annullata e non consegnata.
  private static readonly NON_BILLABLE_STATUSES = ['cancelled', 'notDelivered'];

  /**
   * Genera la fattura del periodo per un partner: una riga per ogni consegna
   * "da fatturare" (billable) del periodo, in qualsiasi stato tranne
   * annullata/non consegnata. Importo riga = price + additionalPrice.
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
    const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0);
    const year = new Date(periodStart).getFullYear();
    const count = await this.prisma.invoice.count();

    return this.prisma.invoice.create({
      data: {
        partnerId,
        number: `FAT-${year}-${count + 1}`,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
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
