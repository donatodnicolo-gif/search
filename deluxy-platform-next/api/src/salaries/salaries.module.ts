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
import { Role, SalaryDocumentType, SalaryStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalariesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtUser, archived = false) {
    const where: any = { archived };
    if (user.role === Role.VALET) where.valetId = user.valetId ?? '-';
    return this.prisma.salary.findMany({
      where,
      include: {
        valet: { select: { id: true, firstName: true, lastName: true, hasVat: true } },
        receipts: true,
        claims: true,
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
   * DRAFT -> SENT (invio: archivia + genera la ricevuta DA FIRMARE)
   * -> [il valet firma la ricevuta] -> RECEIPT_PENDING (ricevuta firmata, da approvare)
   * -> APPROVED (solo se la ricevuta e' firmata) -> PAID.
   */
  async updateStatus(id: string, status: SalaryStatus) {
    const salary = await this.prisma.salary.findUnique({
      where: { id },
      include: { receipts: true },
    });
    if (!salary) throw new NotFoundException('Stipendio non trovato');

    const data: any = { status };
    if (status === SalaryStatus.SENT) {
      // L'invio archivia lo stipendio e genera la ricevuta da far firmare al valet.
      data.sentAt = new Date();
      data.archived = true;
      if (salary.receipts.length === 0) {
        const count = await this.prisma.receipt.count();
        data.receipts = {
          create: {
            number: `RIC-${new Date().getFullYear()}-${count + 1}`,
            signed: false,
          },
        };
      }
    }
    if (status === SalaryStatus.APPROVED) {
      // Si approva solo dopo che il valet ha firmato la ricevuta.
      if (!salary.receipts.some((r) => r.signed)) {
        throw new BadRequestException('La ricevuta deve essere firmata prima dell approvazione');
      }
      data.approvedAt = new Date();
    }
    if (status === SalaryStatus.PAID) data.paidAt = new Date();
    return this.prisma.salary.update({ where: { id }, data });
  }

  /** Riapre uno stipendio dall'archivio: torna in bozza tra gli attivi.
   *  Consentito solo se non è ancora stato pagato (stato finanziario). */
  async reopen(id: string) {
    const salary = await this.prisma.salary.findUnique({ where: { id } });
    if (!salary) throw new NotFoundException('Stipendio non trovato');
    if (salary.status === SalaryStatus.PAID) {
      throw new BadRequestException('Uno stipendio già pagato non può essere riaperto');
    }
    // Riaprendo si annulla anche la ricevuta generata: andrà rigenerata al nuovo invio.
    await this.prisma.receipt.deleteMany({ where: { salaryId: id } });
    return this.prisma.salary.update({
      where: { id },
      data: {
        archived: false,
        status: SalaryStatus.DRAFT,
        sentAt: null,
        approvedAt: null,
        paidAt: null,
      },
    });
  }
}

@ApiTags('salaries')
@ApiBearerAuth()
@Controller('salaries')
export class SalariesController {
  constructor(private readonly salariesService: SalariesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista stipendi (il valet vede i propri). archived=true per l archivio' })
  @ApiQuery({ name: 'archived', required: false })
  findAll(@CurrentUser() user: JwtUser, @Query('archived') archived?: string) {
    return this.salariesService.findAll(user, archived === 'true');
  }

  @Post('generate')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Genera stipendio periodo (pro-forma o ricevuta ritenuta, contanti detratti)' })
  generate(
    @Body() body: { valetId: string; periodStart: string; periodEnd: string },
  ) {
    return this.salariesService.generate(body.valetId, body.periodStart, body.periodEnd);
  }

  @Post(':id/reopen')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Riapre dallo archivio (solo se non pagato): torna in bozza' })
  reopen(@Param('id') id: string) {
    return this.salariesService.reopen(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OPERATION)
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
