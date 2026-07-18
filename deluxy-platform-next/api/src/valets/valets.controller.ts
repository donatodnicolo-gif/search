import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { CreateValetDto, UpdateValetDto } from './dto/create-valet.dto';
import { ValetsService } from './valets.service';

@ApiTags('valets')
@ApiBearerAuth()
@Controller('valets')
export class ValetsController {
  constructor(private readonly valetsService: ValetsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Lista valet' })
  findAll() {
    return this.valetsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio valet (il valet vede solo se stesso)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.valetsService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Crea valet con province e servizi/salari' })
  create(@Body() dto: CreateValetDto, @CurrentUser() actor: JwtUser) {
    return this.valetsService.create(dto, actor);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Aggiorna valet' })
  update(@Param('id') id: string, @Body() dto: UpdateValetDto) {
    return this.valetsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Disattiva valet (soft delete)' })
  remove(@Param('id') id: string) {
    return this.valetsService.remove(id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Disponibilita del valet per data (in un intervallo)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getAvailability(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.valetsService.getAvailability(id, user, from, to);
  }

  @Put(':id/availability')
  @ApiOperation({ summary: 'Imposta disponibilita per una data (upsert; il valet solo la propria)' })
  setAvailability(
    @Param('id') id: string,
    @Body() body: { date: string; available?: boolean; timeFrom?: string; timeTo?: string; note?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.valetsService.setAvailability(id, user, body);
  }

  @Delete(':id/availability/:date')
  @ApiOperation({ summary: 'Rimuove la disponibilita di una data (torna al default disponibile)' })
  removeAvailability(
    @Param('id') id: string,
    @Param('date') date: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.valetsService.removeAvailability(id, user, date);
  }
}
