import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { ActivitiesService } from './activities.service';
import { RiordinaAttivitaDto, StatoAttivitaDto } from './dto/attivita.dto';

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
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activitiesService.findAll(user, date, Number(limit) || 300);
  }

  @Post('reorder')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Riordina le attivita per orario/priorita (ufficio)' })
  reorder(@Body() dto: RiordinaAttivitaDto) {
    return this.activitiesService.reorder(dto.items);
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
