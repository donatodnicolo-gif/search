import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { DeliveryRuleType, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveryRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.deliveryRule.findMany({
      include: { partners: { include: { partner: { select: { id: true, insegna: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Regola carnet: numero giornaliero (DAILY_COUNT) o totale nel periodo
   * (TOTAL_COUNT) di consegne, con plus/minus su fatturazione partner e
   * paga valet. Estendibile a piu' partner.
   */
  create(body: {
    name: string;
    type: DeliveryRuleType;
    deliveryCount: number;
    periodStart?: string;
    periodEnd?: string;
    partnerBillingAdjustment?: number;
    valetPayAdjustment?: number;
    partnerIds?: string[];
  }) {
    return this.prisma.deliveryRule.create({
      data: {
        name: body.name,
        type: body.type,
        deliveryCount: body.deliveryCount,
        periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
        periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
        partnerBillingAdjustment: body.partnerBillingAdjustment ?? 0,
        valetPayAdjustment: body.valetPayAdjustment ?? 0,
        partners: body.partnerIds?.length
          ? { create: body.partnerIds.map((partnerId) => ({ partnerId })) }
          : undefined,
      },
      include: { partners: true },
    });
  }
}

@ApiTags('delivery-rules')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
@Controller('delivery-rules')
export class DeliveryRulesController {
  constructor(private readonly deliveryRulesService: DeliveryRulesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista regole carnet' })
  findAll() {
    return this.deliveryRulesService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Crea regola carnet (plus/minus fatturazione e paga)' })
  create(@Body() body: any) {
    return this.deliveryRulesService.create(body);
  }
}

@Module({
  controllers: [DeliveryRulesController],
  providers: [DeliveryRulesService],
})
export class DeliveryRulesModule {}
