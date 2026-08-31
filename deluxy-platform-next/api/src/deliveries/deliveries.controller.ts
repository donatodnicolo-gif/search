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
import { Roles, Autenticato, CurrentUser, JwtUser, Public } from '../common/decorators';
import { Role } from '../common/enums';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryListQueryDto } from './dto/delivery-list-query.dto';
import {
  AssignValetDto,
  AzioneDiMassaDto,
  AzioneDiMassaImportoDto,
  AzioneDiMassaStatoDto,
  AzioneDiMassaValetDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
} from './dto/update-delivery.dto';

@ApiTags('deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Autenticato()
  @Get()
  @ApiOperation({
    summary:
      'Lista consegne paginata (filtrata per ruolo). q = ricerca globale sui campi testuali; filtri stato/partner/valet/data',
  })
  findAll(@CurrentUser() user: JwtUser, @Query() query: DeliveryListQueryDto) {
    return this.deliveriesService.findAll(user, query);
  }

  // NB: dichiarate PRIMA di :id, altrimenti verrebbero catturate dalla route param.
  @Autenticato()
  @Get('calendar')
  @ApiOperation({ summary: 'Conteggio consegne per giorno (calendario), filtrato per ruolo' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'valetId', required: false })
  calendar(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('partnerId') partnerId?: string,
    @Query('valetId') valetId?: string,
  ) {
    return this.deliveriesService.calendar(user, from, to, partnerId, valetId);
  }

  @Autenticato()
  @Get('map')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Punti mappa delle consegne (con coordinate), filtrabili come la lista' })
  mapPoints(@CurrentUser() user: JwtUser, @Query() query: DeliveryListQueryDto) {
    return this.deliveriesService.mapPoints(user, query);
  }

  @Post('geocode-missing')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Backfill: geocodifica le consegne senza coordinate (throttlato)' })
  @ApiQuery({ name: 'limit', required: false })
  geocodeMissing(@Query('limit') limit?: string) {
    return this.deliveriesService.geocodeMissing(limit ? Number(limit) : 50);
  }

  @Autenticato()
  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio consegna con attivita e log' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.deliveriesService.findOne(id, user);
  }

  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Crea consegna (genera attivita ritiro+consegna e log)' })
  create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: JwtUser) {
    return this.deliveriesService.create(dto, user);
  }

  @Put(':id')
  // Il partner e' ammesso ma il service applica la regola: solo consegne
  // "da gestire" e con servizio diverso da VENDITA.
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Aggiorna consegna' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.deliveriesService.update(id, dto, user);
  }

  // PARTNER incluso per due motivi già filtrati nel service: può richiedere la
  // cancellazione, e — se la consegna è «da fornitore» ed è sua — la chiude
  // come un valet (in consegna / consegnata / non consegnata).
  @Roles(Role.ADMIN, Role.OPERATION, Role.VALET, Role.PARTNER)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambio stato (con log automatico)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.deliveriesService.updateStatus(id, dto.status, user, dto);
  }

  // Anche il PARTNER: il link di tracciamento serve a condividerlo col CLIENTE.
  // `getTrackingToken` passa da findOne, che applica già il perimetro del
  // partner — può generare il link solo per le consegne che può vedere.
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @Get(':id/tracking-link')
  @ApiOperation({ summary: 'Token del link pubblico di monitoraggio (lo crea se assente)' })
  trackingLink(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.deliveriesService.getTrackingToken(id, user);
  }

  @Public()
  @Get('tracking/:token')
  @ApiOperation({ summary: 'Monitoraggio pubblico della consegna (senza login)' })
  publicTracking(@Param('token') token: string) {
    return this.deliveriesService.findByTrackingToken(token);
  }

  @Public()
  @Post('delivered/:token')
  @ApiOperation({ summary: 'Conferma pubblica di consegna (link "consegnata"): stato -> delivered' })
  confirmDelivered(@Param('token') token: string, @Body() body: { receivedBy?: string }) {
    return this.deliveriesService.confirmDeliveredByToken(token, body.receivedBy);
  }

  // ============================================================
  // AZIONI SU PIÙ CONSEGNE INSIEME (27/08/2026, chiesto dall'utente)
  // ------------------------------------------------------------
  // ⚠️ Queste rotte NON riscrivono le regole: richiamano una per una le stesse
  // funzioni del caso singolo, così log, calcolo della paga, permessi e stati
  // ammessi restano scritti in un posto solo. Una seconda implementazione
  // «più veloce» divergerebbe al primo cambiamento.
  //
  // ⚠️ L'esito è PER CONSEGNA: una che fallisce non ferma le altre e non si
  // perde. Un «fatto» generico su venti consegne, con tre andate male, sarebbe
  // una bugia comoda.
  // ============================================================
  @Roles(Role.ADMIN, Role.OPERATION)
  @Patch('massa/stato')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Cambia lo stato di più consegne insieme' })
  async statoDiMassa(@Body() dto: AzioneDiMassaStatoDto, @CurrentUser() user: JwtUser) {
    return this.inSequenza(dto.ids, (id) =>
      this.deliveriesService.updateStatus(id, dto.status, user),
    );
  }

  @Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
  @Patch('massa/assegna')
  @Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
  @ApiOperation({ summary: 'Assegna lo stesso valet a più consegne insieme' })
  async assegnaDiMassa(@Body() dto: AzioneDiMassaValetDto, @CurrentUser() user: JwtUser) {
    return this.inSequenza(dto.ids, (id) =>
      this.deliveriesService.assignValet(id, dto.valetId, user),
    );
  }

  @Roles(Role.ADMIN, Role.OPERATION)
  @Patch('massa/plus-valet')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Scrive lo stesso plus/minus valet su più consegne insieme' })
  async plusDiMassa(@Body() dto: AzioneDiMassaImportoDto, @CurrentUser() user: JwtUser) {
    return this.inSequenza(dto.ids, (id) =>
      this.deliveriesService.update(id, { valetAdditionalPrice: dto.importo } as any, user),
    );
  }

  @Roles(Role.ADMIN, Role.OPERATION)
  @Patch('massa/elimina')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Elimina più consegne insieme (solo admin)' })
  async eliminaDiMassa(@Body() dto: AzioneDiMassaDto, @CurrentUser() user: JwtUser) {
    return this.inSequenza(dto.ids, (id) => this.deliveriesService.remove(id, user));
  }

  /**
   * Esegue l'azione su ogni id e RACCOGLIE gli esiti, uno per uno.
   * In sequenza e non in parallelo: `assignValet` e `updateStatus` leggono e
   * riscrivono le stesse righe (numeri progressivi, attività), e venti scritture
   * insieme sullo stesso partner sono un invito alle corse.
   */
  private async inSequenza(ids: string[], azione: (id: string) => Promise<unknown>) {
    const esiti: { id: string; ok: boolean; errore?: string }[] = [];
    for (const id of ids) {
      try {
        await azione(id);
        esiti.push({ id, ok: true });
      } catch (e) {
        esiti.push({ id, ok: false, errore: (e as Error).message });
      }
    }
    return {
      chieste: ids.length,
      riuscite: esiti.filter((x) => x.ok).length,
      fallite: esiti.filter((x) => !x.ok).length,
      esiti,
    };
  }

  @Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
  @ApiOperation({ summary: 'Assegna valet (admin/operation, o team leader nel proprio perimetro)' })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignValetDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.deliveriesService.assignValet(id, dto.valetId, user);
  }

  @Roles(Role.ADMIN, Role.OPERATION)
  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Elimina consegna' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.deliveriesService.remove(id, user);
  }
}
