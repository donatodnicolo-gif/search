import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  create(@Body() dto: CreateValetDto) {
    return this.valetsService.create(dto);
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
  @ApiOperation({ summary: 'Disponibilita del valet' })
  getAvailability(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    if (user.role === Role.VALET && user.valetId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    return this.valetsService.getAvailability(id);
  }

  @Post(':id/availability')
  @ApiOperation({ summary: 'Registra disponibilita (il valet solo per se stesso)' })
  setAvailability(
    @Param('id') id: string,
    @Body() body: { date: string; timeFrom?: string; timeTo?: string; available?: boolean },
    @CurrentUser() user: JwtUser,
  ) {
    if (user.role === Role.VALET && user.valetId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    return this.valetsService.setAvailability(id, body);
  }
}
