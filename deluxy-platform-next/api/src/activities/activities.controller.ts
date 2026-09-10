import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { ActivitiesService } from './activities.service';
import { AssegnaAttivitaDto, RiordinaAttivitaDto, StatoAttivitaDto } from './dto/attivita.dto';

// ============================================================
// ⚠️ CHI ENTRA NELLE ATTIVITÀ (27/08/2026)
// ------------------------------------------------------------
// Il controller non dichiarava nessun ruolo, e il guard senza `@Roles` lascia
// passare chiunque sia autenticato. Misurato con un token vero di PARTNER:
// `PATCH /activities/<qualsiasi>/status` rispondeva 200 e lo stato di
// un'attività di un altro valet passava davvero a un valore inventato.
//
// Le attività sono il giro della giornata di ritiri e consegne: chi le
// riscrive sposta il lavoro di qualcun altro.
// ============================================================
@ApiTags('activities')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista attivita (team leader vede quelle delle sue province)' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'stato', required: false, description: 'aperte (da fare) | storico (fatte e saltate) | tutte' })
  @ApiQuery({ name: 'mie', required: false, description: 'valet: 1 = solo le mie (il team leader vede la squadra)' })
  @ApiQuery({ name: 'conPartner', required: false, description: '1 = mostra anche le consegne portate dal partner (escluse per regola)' })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
    @Query('stato') stato?: string,
    @Query('mie') mie?: string,
    @Query('conPartner') conPartner?: string,
  ) {
    const sezione = stato === 'aperte' || stato === 'storico' ? stato : 'tutte';
    return this.activitiesService.findAll(user, date, Number(limit) || 300, sezione, mie === '1' || mie === 'true', conPartner === '1' || conPartner === 'true');
  }

  @Post('reorder')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Riordina le attivita per orario/priorita (ufficio)' })
  reorder(@Body() dto: RiordinaAttivitaDto) {
    return this.activitiesService.reorder(dto.items);
  }

  @Patch(':id/assegna')
  @ApiOperation({ summary: "Assegna la CONSEGNA di questa attività a un valet (ufficio e team leader): cambia il valet sulla consegna e su tutte le sue attività" })
  assegna(@Param('id') id: string, @Body() dto: AssegnaAttivitaDto, @CurrentUser() user: JwtUser) {
    return this.activitiesService.assegna(id, dto.valetId, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: "Aggiorna lo stato di un'attivita del proprio perimetro" })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: StatoAttivitaDto,
    @CurrentUser() user: JwtUser,
  ) {
    // ⚠️ L'id viene dal PERCORSO, non dal corpo. Prima si usava `body.id` e il
    // parametro di rotta non veniva nemmeno letto: si poteva chiedere
    // `/activities/qualsiasi-cosa/status` e riscrivere l'attività scritta nel
    // corpo. Un identificativo che arriva da due parti è un identificativo che
    // non ne ha nessuna.
    return this.activitiesService.updateStatus(id, dto.status, user);
  }
}
