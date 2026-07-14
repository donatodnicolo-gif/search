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
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import {
  AssignValetDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
} from './dto/update-delivery.dto';

@ApiTags('deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista consegne (filtrata per ruolo)' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'valetId', required: false })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('partnerId') partnerId?: string,
    @Query('valetId') valetId?: string,
  ) {
    return this.deliveriesService.findAll(user, { date, status, partnerId, valetId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio consegna con attivita e log' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.deliveriesService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Crea consegna (genera attivita ritiro+consegna e log)' })
  create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: JwtUser) {
    return this.deliveriesService.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Aggiorna consegna' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.deliveriesService.update(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambio stato (con log automatico)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.deliveriesService.updateStatus(id, dto.status, user);
  }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Assegna valet (calcola paga dal matching servizio/salario)' })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignValetDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.deliveriesService.assignValet(id, dto.valetId, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Elimina consegna' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.deliveriesService.remove(id, user);
  }
}
