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

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Marginalita': ricavi partner vs paghe valet nel periodo. */
  async summary(from?: string, to?: string) {
    const where: any = {
      status: { in: ['delivered', 'delivered_time_approved'] },
    };
    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    const deliveries = await this.prisma.delivery.findMany({
      where,
      select: { price: true, valetSalary: true, partnerId: true },
    });
    const revenue = deliveries.reduce((s, d) => s + (d.price ?? 0), 0);
    const valetCosts = deliveries.reduce((s, d) => s + (d.valetSalary ?? 0), 0);
    return {
      deliveries: deliveries.length,
      revenue,
      valetCosts,
      margin: revenue - valetCosts,
      marginPercent: revenue > 0 ? ((revenue - valetCosts) / revenue) * 100 : 0,
    };
  }
}

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Marginalita (solo admin; gli admin "support" inclusi)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  summary(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Finanza/marginalita': solo admin (compresi gli admin "support")
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Sezione Finanza riservata agli admin');
    }
    return this.financeService.summary(from, to);
  }
}

@Module({
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
