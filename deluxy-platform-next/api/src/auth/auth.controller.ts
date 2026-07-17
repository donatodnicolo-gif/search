import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Public } from '../common/decorators';
import { AuthService } from './auth.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login con email e password, restituisce JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Get('invite/:token')
  @ApiOperation({ summary: 'Dati dell invito (pagina pubblica di accettazione)' })
  inviteInfo(@Param('token') token: string) {
    return this.authService.inviteInfo(token);
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accetta l invito: imposta la password e attiva l account' })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Profilo dell'utente autenticato" })
  me(@CurrentUser() user: JwtUser) {
    return this.authService.me(user);
  }
}
