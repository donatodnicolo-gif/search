import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { InvoiceStatus, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtUser, archived = false) {
    const where: any = { archived };
    if (user.role === Role.PARTNER) where.partnerId = user.partnerId ?? '-';
    return this.prisma.invoice.findMany({
      where,
      include: { partner: { select: { id: true, insegna: true } } },
      orderBy: { periodStart: 'desc' },
    });
  }

  /**
   * Genera la fattura del periodo per un partner: somma di price + additionalPrice
   * delle consegne "da fatturare" (billable) ed effettuate nel periodo.
   */
  async generate(partnerId: string, periodStart: string, periodEnd: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException('Partner non trovato');

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        partnerId,
        billable: true,
        status: { in: ['delivered', 'delivered_time_approved'] },
        date: { gte: new Date(periodStart), lte: new Date(periodEnd) },
      },
    });
    const totalAmount = deliveries.reduce(
      (sum, d) => sum + (d.price ?? 0) + (d.additionalPrice ?? 0),
      0,
    );
    const year = new Date(periodStart).getFullYear();
    const count = await this.prisma.invoice.count();

    return this.prisma.invoice.create({
      data: {
        partnerId,
        number: `FAT-${year}-${count + 1}`,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalAmount,
        deliveriesCount: deliveries.length,
        status: InvoiceStatus.DRAFT,
      },
    });
  }

  /** Avanzamento: DRAFT -> ISSUED (emessa: archivia in storico) -> PAID (pagata). */
  async updateStatus(id: string, status: InvoiceStatus) {
    const data: any = { status };
    if (status === InvoiceStatus.ISSUED) { data.issuedAt = new Date(); data.archived = true; }
    if (status === InvoiceStatus.PAID) data.paidAt = new Date();
    return this.prisma.invoice.update({ where: { id }, data });
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
