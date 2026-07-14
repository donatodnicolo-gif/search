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

  create(body: {
    name: string;
    code: string;
    pricingModel: string;
    basePrice?: number;
    perPiecePrice?: number;
    transportPrice?: number;
    minHours?: number;
  }) {
    return this.prisma.serviceType.create({ data: body });
  }
}

@ApiTags('service-types')
@ApiBearerAuth()
@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly serviceTypesService: ServiceTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista tipi di servizio attivi' })
  findAll() {
    return this.serviceTypesService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea tipo di servizio' })
  create(
    @Body()
    body: {
      name: string;
      code: string;
      pricingModel: string;
      basePrice?: number;
      perPiecePrice?: number;
      transportPrice?: number;
      minHours?: number;
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
