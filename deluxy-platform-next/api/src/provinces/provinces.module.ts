import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvincesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.province.findMany({
      include: { cities: true },
      orderBy: { name: 'asc' },
    });
  }

  create(body: { name: string; code: string }) {
    return this.prisma.province.create({ data: body });
  }

  addCity(provinceId: string, name: string) {
    return this.prisma.city.create({ data: { provinceId, name } });
  }
}

@ApiTags('provinces')
@ApiBearerAuth()
@Controller('provinces')
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get()
  @ApiOperation({ summary: 'Province e citta' })
  findAll() {
    return this.provincesService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Crea provincia' })
  create(@Body() body: { name: string; code: string }) {
    return this.provincesService.create(body);
  }

  @Post(':id/cities')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Aggiungi citta alla provincia' })
  addCity(@Param('id') id: string, @Body() body: { name: string }) {
    return this.provincesService.addCity(id, body.name);
  }
}

@Module({
  controllers: [ProvincesController],
  providers: [ProvincesService],
})
export class ProvincesModule {}
