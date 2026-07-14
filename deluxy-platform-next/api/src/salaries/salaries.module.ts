import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role, SalaryDocumentType, SalaryStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalariesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtUser) {
    const where =
      user.role === Role.VALET ? { valetId: user.valetId ?? '-' } : {};
    return this.prisma.salary.findMany({
      where,
      include: {
        valet: { select: { id: true, firstName: true, lastName: true, hasVat: true } },
        receipts: true,
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  /**
   * Genera lo stipendio del periodo per un valet:
   * somma delle paghe delle consegne effettuate, meno i contanti
   * incassati alla consegna (pagamento alla consegna).
   * Documento: pro-forma fattura se il valet ha P.IVA,
   * altrimenti ricevuta con ritenuta.
   */
  async generate(valetId: string, periodStart: string, periodEnd: string) {
    const valet = await this.prisma.valet.findUnique({ where: { id: valetId } });
    if (!valet) throw new NotFoundException('Valet non trovato');

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        valetId,
        status: { in: ['delivered', 'delivered_time_approved'] },
        date: { gte: new Date(periodStart), lte: new Date(periodEnd) },
      },
    });
    const grossAmount = deliveries.reduce((sum, d) => sum + (d.valetSalary ?? 0), 0);
    const cashDeductions = deliveries
      .filter((d) => d.paymentOnDelivery)
      .reduce((sum, d) => sum + (d.paymentAmount ?? 0), 0);

    return this.prisma.salary.create({
      data: {
        valetId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        grossAmount,
        cashDeductions,
        netAmount: grossAmount - cashDeductions,
        documentType: valet.hasVat
          ? SalaryDocumentType.PROFORMA_INVOICE
          : SalaryDocumentType.WITHHOLDING_RECEIPT,
        status: SalaryStatus.DRAFT,
      },
    });
  }

  /**
   * Avanzamento del flusso stipendi:
   * DRAFT -> SENT (invio) -> RECEIPT_PENDING (ricevuta da firmare)
   * -> APPROVED -> PAID.
   */
  async updateStatus(id: string, status: SalaryStatus) {
    const data: any = { status };
    if (status === SalaryStatus.SENT) data.sentAt = new Date();
    if (status === SalaryStatus.APPROVED) data.approvedAt = new Date();
    if (status === SalaryStatus.PAID) data.paidAt = new Date();
    if (status === SalaryStatus.RECEIPT_PENDING) {
      data.receipts = { create: { signed: false } };
    }
    return this.prisma.salary.update({ where: { id }, data });
  }
}

@ApiTags('salaries')
@ApiBearerAuth()
@Controller('salaries')
export class SalariesController {
  constructor(private readonly salariesService: SalariesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista stipendi (il valet vede i propri)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.salariesService.findAll(user);
  }

  @Post('generate')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Genera stipendio periodo (pro-forma o ricevuta ritenuta, contanti detratti)' })
  generate(
    @Body() body: { valetId: string; periodStart: string; periodEnd: string },
  ) {
    return this.salariesService.generate(body.valetId, body.periodStart, body.periodEnd);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Avanza il flusso: DRAFT->SENT->RECEIPT_PENDING->APPROVED->PAID' })
  updateStatus(@Param('id') id: string, @Body() body: { status: SalaryStatus }) {
    return this.salariesService.updateStatus(id, body.status);
  }
}

@Module({
  controllers: [SalariesController],
  providers: [SalariesService],
})
export class SalariesModule {}
