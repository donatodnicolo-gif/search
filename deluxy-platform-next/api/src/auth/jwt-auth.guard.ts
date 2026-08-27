import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    if (!token) throw new UnauthorizedException('Token mancante');

    let payload: { sub: string };
    try {
      // Usa il segreto configurato nel JwtModule (registerAsync)
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token non valido o scaduto');
    }

    // Revoca immediata: lo stato dell'utente è verificato sul DB a OGNI
    // richiesta, non solo al login. Un utente sospeso/archiviato perde
    // l'accesso subito, senza aspettare la scadenza del token.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Accesso revocato o utente non attivo');
    }
    // ⚠️ 27/08/2026 — CHI SEI LO DICE IL DATABASE, NON IL TOKEN.
    //
    // Prima si scriveva `request.user = payload`: ruolo, partner e valet
    // venivano dal token firmato al login, e da lì `RolesGuard` decideva. Due
    // conseguenze, tutt'e due reali:
    //   · un ADMIN declassato restava ADMIN fino alla scadenza (8 ore);
    //   · un utente spostato dal partner A al B continuava a leggere e a
    //     scrivere le cose di A.
    // La riga vera è già in mano — la query la facevamo comunque per lo stato —
    // e la si buttava via. Del token resta solo il `sub`: quello dice CHI
    // chiede, il resto lo dice l'archivio.
    request.user = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isSupport: user.isSupport,
      partnerId: user.partnerId,
      valetId: user.valetId,
    };
    return true;
  }
}
