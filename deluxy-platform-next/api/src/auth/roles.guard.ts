import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../common/decorators';
import { Role } from '../common/enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // ⚠️ 29/08/2026 — SI NEGA PER DEFAULT. Prima qui c'era `return true`: una
    // rotta senza @Roles nasceva aperta a chiunque avesse fatto il login, e
    // bastava dimenticare il decoratore. È così che `GET /service-types`
    // faceva leggere ai valet il listino che pagano i partner (trovato il
    // 29/08 provando con un token valet vero).
    //
    // Adesso il permesso va scritto sempre: @Roles(...) per i ruoli, o
    // @Autenticato() quando davvero possono tutti — che è una dichiarazione,
    // non una dimenticanza. Le rotte fuori dal login (webhook, cron, tracking
    // pubblico) restano @Public e non arrivano nemmeno qui.
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException(
        'Rotta senza permessi dichiarati: va marcata con @Roles(...) o @Autenticato().',
      );
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Ruolo non autorizzato per questa risorsa');
    }
    return true;
  }
}
