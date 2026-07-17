import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { JwtUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    // Messaggi distinti solo per gli stati "gestibili" dall'utente; per il
    // resto un messaggio generico per non rivelare l'esistenza dell'account.
    if (user && user.status === 'invited') {
      throw new UnauthorizedException(
        'Account non ancora attivato: usa il link di invito per impostare la password.',
      );
    }
    if (!user || user.status !== 'active' || !user.passwordHash) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isSupport: user.isSupport,
      partnerId: user.partnerId,
      valetId: user.valetId,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isSupport: user.isSupport,
        partnerId: user.partnerId,
        valetId: user.valetId,
      },
    };
  }

  async me(jwtUser: JwtUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isSupport: true,
        partnerId: true,
        valetId: true,
        operationId: true,
        status: true,
      },
    });
    return user;
  }

  /** Dati minimi dell'invito (pagina pubblica di accettazione): a chi è rivolto. */
  async inviteInfo(token: string) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: token } });
    if (!user || user.status !== 'invited') {
      throw new NotFoundException('Invito non valido');
    }
    if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invito scaduto: chiedi un nuovo invito.');
    }
    return { email: user.email, firstName: user.firstName, lastName: user.lastName };
  }

  /** L'utente sceglie la password dal link di invito: attiva l'account e lo logga. */
  async acceptInvite(dto: AcceptInviteDto) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: dto.token } });
    if (!user || user.status !== 'invited') {
      throw new BadRequestException('Invito non valido o già usato');
    }
    if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invito scaduto: chiedi un nuovo invito.');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.password, 10),
        status: 'active',
        activatedAt: new Date(),
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });
    await this.prisma.userEvent.create({
      data: { userId: user.id, action: 'activated', note: 'Invito accettato' },
    });
    const payload = {
      sub: updated.id,
      email: updated.email,
      role: updated.role,
      isSupport: updated.isSupport,
      partnerId: updated.partnerId,
      valetId: updated.valetId,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        role: updated.role,
        isSupport: updated.isSupport,
        partnerId: updated.partnerId,
        valetId: updated.valetId,
      },
    };
  }
}
