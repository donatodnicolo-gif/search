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
  // ⚠️ 27/08/2026: senza `@Roles` questa rotta rispondeva a chiunque fosse
  // autenticato. Misurato con un token vero di VALET: 200, con P.IVA, dati
  // bancari e il LISTINO con cui il partner paga. Il controllo nel service
  // fermava solo «un partner che guarda un altro partner».
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
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

  @Post('import/anagrafiche')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Importa i partner ATTIVI dal registro Anagrafiche' })
  importFromAnagrafiche(@CurrentUser() actor: JwtUser) {
    return this.partnersService.importFromAnagrafiche(actor);
  }

  @Get('anagrafiche/stato')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Stato del collegamento col registro per tutti i partner (una sola chiamata)' })
  statoSyncTutti() {
    return this.partnersService.statoSyncTutti();
  }

  @Get(':id/anagrafica')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Confronta il partner col suo record nel registro Anagrafiche' })
  confrontaAnagrafica(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.partnersService.confrontaAnagrafica(id, actor);
  }

  @Post(':id/anagrafica/sincronizza')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Manda il partner al registro Anagrafiche e attende l\'esito' })
  sincronizzaAnagrafica(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser,
    @Body() body?: { anagraficaId?: string; creaNuova?: boolean },
  ) {
    return this.partnersService.sincronizzaAnagrafica(id, actor, body ?? {});
  }

  @Post(':id/anagrafica/importa')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Porta nella piattaforma i campi scelti dal record del registro' })
  importaDaAnagrafica(
    @Param('id') id: string,
    @Body() body: { campi?: string[] },
    @CurrentUser() actor: JwtUser,
  ) {
    return this.partnersService.importaDaAnagrafica(id, body?.campi ?? [], actor);
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

  // ⭐ 09/09/2026 (regola utente): SOSPENDERE non è ELIMINARE. Un partner
  // disattivato resta in fatturazione — il lavoro già fatto si paga — ma esce
  // dagli attivi: non gli si assegnano consegne nuove e i suoi prodotti vanno in
  // archivio (e tornano se lo si riattiva). Chi può modificare un partner può
  // anche sospenderlo: `PUT /partners/:id` con `active` lo permetteva già, qui
  // c'è solo un comando esplicito che non tocca il resto della scheda.
  @Patch(':id/disattiva')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Sospende il partner: fuori dagli attivi, resta in fatturazione (reversibile)' })
  disattiva(@Param('id') id: string) {
    return this.partnersService.disattiva(id);
  }

  @Patch(':id/attiva')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Riattiva un partner sospeso (ripesca i prodotti archiviati per la sospensione)' })
  attiva(@Param('id') id: string) {
    return this.partnersService.attiva(id);
  }

  @Patch(':id/elimina')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Elimina il partner: sparisce da fatturazione e liste (reversibile)' })
  elimina(@Param('id') id: string) {
    return this.partnersService.elimina(id);
  }

  @Patch(':id/ripristina')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ripristina un partner eliminato (torna disattivato)' })
  ripristina(@Param('id') id: string) {
    return this.partnersService.ripristina(id);
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

  // ============================================================
  // CAMBIO DELLE COORDINATE BANCARIE IN DUE PASSI (⭐ 08/09/2026, regola utente)
  // ------------------------------------------------------------
  // ⚠️ Queste rotte NON passano da `PUT /partners/:id`: là il ramo PARTNER riassegna il
  // dto ai soli contatti, e `bankAccount` resta — giustamente — fuori. Il cambio delle
  // coordinate è l'unica eccezione a quella regola, e ha una porta sua proprio per
  // questo: perché la difesa (il codice per email) sta tutta qui, e non si può
  // dimenticare aggiungendo un campo alla whitelist di là.
  //
  // ⚠️ Il PROJECT_MANAGER non c'è: non tocca il denaro di nessuno.
  // ============================================================

  @Get(':id/banca')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Coordinate bancarie e stato di un eventuale cambio in corso' })
  statoBanca(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.partnersService.statoCambioBanca(id, user);
  }

  @Post(':id/banca/richiedi')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({
    summary: 'Chiede il cambio di IBAN e intestatario: NON scrive, manda il codice alla mail del partner',
  })
  richiediBanca(
    @Param('id') id: string,
    @Body() dto: { bankAccount?: string; bankAccountName?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.partnersService.richiediCambioBanca(id, user, dto);
  }

  @Post(':id/banca/conferma')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Conferma il cambio col codice ricevuto per email: qui i campi cambiano davvero' })
  confermaBanca(
    @Param('id') id: string,
    @Body() dto: { codice?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.partnersService.confermaCambioBanca(id, user, String(dto?.codice ?? ''));
  }

  @Delete(':id/banca/richiedi')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Annulla il cambio in corso: le coordinate restano quelle di prima' })
  annullaBanca(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.partnersService.annullaCambioBanca(id, user);
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
