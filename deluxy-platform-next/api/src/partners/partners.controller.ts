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
import { CreatePartnerDto, UpdatePartnerDto } from './dto/create-partner.dto';
import { PartnersService } from './partners.service';

@ApiTags('partners')
@ApiBearerAuth()
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Lista partner' })
  findAll() {
    return this.partnersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio partner (il partner vede solo se stesso)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.partnersService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Crea partner con province, servizi, categorie e orari' })
  create(@Body() dto: CreatePartnerDto, @CurrentUser() actor: JwtUser) {
    return this.partnersService.create(dto, actor);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Aggiorna partner (il partner solo i propri dati limitati)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.partnersService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Disattiva partner (soft delete)' })
  remove(@Param('id') id: string) {
    return this.partnersService.remove(id);
  }

  // --- Eccezioni per data (chiusure straordinarie / orari speciali) ---

  @Get(':id/day-exceptions')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Eccezioni per data del partner (chiusure/orari speciali) in un intervallo' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  dayExceptions(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.partnersService.getDayExceptions(id, user, from, to);
  }

  @Put(':id/day-exceptions')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Imposta chiusura/orario speciale per una data (upsert)' })
  upsertDayException(
    @Param('id') id: string,
    @Body() dto: { date: string; closed?: boolean; openTime?: string; closeTime?: string; note?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.partnersService.upsertDayException(id, user, dto);
  }

  @Delete(':id/day-exceptions/:date')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Rimuove l eccezione di una data (torna all orario settimanale)' })
  removeDayException(
    @Param('id') id: string,
    @Param('date') date: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.partnersService.removeDayException(id, user, date);
  }
}
