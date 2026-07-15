import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tipi di servizio attivi (usati per abilitare i servizi dei partner e dei valet). */
  findAll() {
    return this.prisma.serviceType.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Filtrabile per ambito (partner | valet). "both" appare in entrambi. */
  findByScope(scope?: string) {
    const where: any = { active: true };
    if (scope === 'partner') where.scope = { in: ['partner', 'both'] };
    if (scope === 'valet') where.scope = { in: ['valet', 'both'] };
    return this.prisma.serviceType.findMany({ where, orderBy: { name: 'asc' } });
  }

  async create(body: {
    name: string;
    code?: string;
    pricingModel: string;
    scope?: string;
    basePrice?: number;
    perPiecePrice?: number;
    transportPrice?: number;
    deliveryPrice?: number;
    minHours?: number;
    notes?: string;
    hideCustomerInfo?: boolean;
  }) {
    // Code auto dal nome se non fornito (univoco)
    const base =
      body.code?.trim() ||
      body.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    let code = base || 'SVC';
    let i = 1;
    while (await this.prisma.serviceType.findUnique({ where: { code } })) {
      code = `${base}_${++i}`;
    }
    return this.prisma.serviceType.create({
      data: {
        name: body.name,
        code,
        pricingModel: body.pricingModel,
        scope: body.scope ?? 'partner',
        basePrice: body.basePrice,
        perPiecePrice: body.perPiecePrice,
        transportPrice: body.transportPrice,
        deliveryPrice: body.deliveryPrice,
        minHours: body.minHours,
        notes: body.notes,
        hideCustomerInfo: body.hideCustomerInfo ?? false,
      },
    });
  }
}

@ApiTags('service-types')
@ApiBearerAuth()
@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly serviceTypesService: ServiceTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista tipi di servizio (filtrabile per scope: partner | valet)' })
  findAll(@Query('scope') scope?: string) {
    return scope
      ? this.serviceTypesService.findByScope(scope)
      : this.serviceTypesService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea tipo di servizio (partner o valet)' })
  create(
    @Body()
    body: {
      name: string;
      code?: string;
      pricingModel: string;
      scope?: string;
      basePrice?: number;
      perPiecePrice?: number;
      transportPrice?: number;
      deliveryPrice?: number;
      minHours?: number;
      notes?: string;
      hideCustomerInfo?: boolean;
    },
  ) {
    return this.serviceTypesService.create(body);
  }
}

@Module({
  controllers: [ServiceTypesController],
  providers: [ServiceTypesService],
})
export class ServiceTypesModule {}
