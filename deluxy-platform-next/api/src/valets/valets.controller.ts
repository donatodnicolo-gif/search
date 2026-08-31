import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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

  // Anche il VALET (team leader) può leggere la lista, ma in versione SICURA:
  // gli serve per assegnare le consegne — anche a se stesso — senza vedere le
  // paghe dei colleghi.
  @Get()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.VALET)
  @ApiOperation({ summary: 'Lista valet' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.valetsService.findAll(user.role === Role.VALET);
  }

  @Patch(':id/elimina')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Elimina il valet: sparisce da Stipendi ed elenchi (reversibile)' })
  elimina(@Param('id') id: string) {
    return this.valetsService.elimina(id);
  }

  @Patch(':id/ripristina')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ripristina un valet eliminato (torna disattivato)' })
  ripristina(@Param('id') id: string) {
    return this.valetsService.ripristina(id);
  }

  @Get(':id')
  // ⚠️ 27/08/2026: senza `@Roles` questa rotta rispondeva a chiunque fosse
  // autenticato. Misurato con un token vero di PARTNER: 200, con IBAN, codice
  // fiscale e il listino di paga di un valet qualsiasi. Il controllo nel
  // service fermava SOLO «un valet che guarda un altro valet»: chi non era
  // valet non veniva mai fermato.
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.VALET)
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
  // ⚠️ 27/08/2026: la disponibilità di un valet la scrive l'ufficio o il valet
  // stesso. Senza `@Roles` la scriveva chiunque: misurato, un PARTNER ha
  // scritto una riga sul calendario di un valet — e `setAvailability` prima
  // CANCELLA le fasce di quel giorno, quindi la scrittura distrugge.
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.VALET)
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
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.VALET)
  @ApiOperation({ summary: 'Imposta disponibilita per una data (upsert; il valet solo la propria)' })
  setAvailability(
    @Param('id') id: string,
    @Body() body: { date: string; available?: boolean; timeFrom?: string; timeTo?: string; note?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.valetsService.setAvailability(id, user, body);
  }

  @Delete(':id/availability/:date')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.VALET)
  @ApiOperation({ summary: 'Rimuove la disponibilita di una data (torna al default disponibile)' })
  removeAvailability(
    @Param('id') id: string,
    @Param('date') date: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.valetsService.removeAvailability(id, user, date);
  }
}
