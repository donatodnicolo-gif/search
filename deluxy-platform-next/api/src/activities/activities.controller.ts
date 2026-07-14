import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../common/decorators';
import { ActivitiesService } from './activities.service';

@ApiTags('activities')
@ApiBearerAuth()
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista attivita (team leader vede quelle delle sue province)' })
  @ApiQuery({ name: 'date', required: false })
  findAll(@CurrentUser() user: JwtUser, @Query('date') date?: string) {
    return this.activitiesService.findAll(user, date);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Riordina le attivita per orario/priorita' })
  reorder(@Body() body: { items: { id: string; sortOrder: number }[] }) {
    return this.activitiesService.reorder(body.items ?? []);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Aggiorna stato attivita' })
  updateStatus(@Body() body: { id: string; status: string }) {
    return this.activitiesService.updateStatus(body.id, body.status);
  }
}
