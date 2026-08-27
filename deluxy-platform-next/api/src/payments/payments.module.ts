import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { PaymentStatus, PaymentType, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtUser) {
    const where =
      user.role === Role.VALET ? { valetId: user.valetId ?? '-' } : {};
    return this.prisma.payment.findMany({
      where,
      include: { valet: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Il valet richiede un rimborso o apre un reclamo (eventualmente su una riga di stipendio). */
  create(user: JwtUser, body: { type: PaymentType; amount: number; description?: string; valetId?: string; salaryId?: string }) {
    const valetId = user.role === Role.VALET ? user.valetId! : body.valetId!;
    return this.prisma.payment.create({
      data: {
        valetId,
        salaryId: body.salaryId ?? null,
        type: body.type,
        amount: body.amount,
        description: body.description,
      },
    });
  }

  updateStatus(id: string, status: PaymentStatus) {
    return this.prisma.payment.update({ where: { id }, data: { status } });
  }
}

@ApiTags('payments')
@ApiBearerAuth()
// ⚠️ Il guard dei ruoli, SENZA `@Roles`, lascia passare chiunque sia
// autenticato (roles.guard.ts). Qui non c'era: un PARTNER leggeva il denaro
// dei VALET. Misurato il 27/08/2026 con un token vero di partner —
// /receipts 160,8 KB, /payments 238,4 KB, /salaries/pending 40 KB, e il recap
// paghe di un valet qualsiasi rispondeva 200. I ruoli sono gli stessi che il
// frontend applica alle pagine corrispondenti (app.routes.ts).
@Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista pagamenti/rimborsi (il valet vede i propri)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.paymentsService.findAll(user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
  @ApiOperation({ summary: 'Richiedi rimborso (REIMBURSEMENT) o reclamo (CLAIM)' })
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: { type: PaymentType; amount: number; description?: string; valetId?: string; salaryId?: string },
  ) {
    return this.paymentsService.create(user, body);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Approva / rifiuta / segna pagato' })
  updateStatus(@Param('id') id: string, @Body() body: { status: PaymentStatus }) {
    return this.paymentsService.updateStatus(id, body.status);
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
