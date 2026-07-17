import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista utenti (solo admin)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio utente (con storico azioni)' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea utente (con password = attivo; senza = invitato)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: JwtUser) {
    return this.usersService.create(dto, actor);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Aggiorna utente' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: JwtUser) {
    return this.usersService.update(id, dto, actor);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambia stato accesso (active | suspended | archived)' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.usersService.setStatus(id, dto.status, actor);
  }

  @Post(':id/resend-invite')
  @ApiOperation({ summary: 'Rigenera il token di invito (restituisce il link da condividere)' })
  resendInvite(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.usersService.resendInvite(id, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archivia utente (non cancella: conserva lo storico)' })
  remove(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.usersService.remove(id, actor);
  }
}
