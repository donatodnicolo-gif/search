import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Role } from './enums';

export const IS_PUBLIC_KEY = 'isPublic';
/** Endpoint accessibile senza JWT (es. login, webhook WooCommerce). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Limita l'endpoint ai ruoli indicati. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface JwtUser {
  sub: string;
  email: string;
  role: Role;
  isSupport: boolean;
  partnerId: string | null;
  valetId: string | null;
}

/** Inietta l'utente autenticato (payload JWT) nel parametro del controller. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

/**
 * «Qualsiasi utente ABBIA fatto il login», qualunque sia il ruolo.
 *
 * ⚠️ 29/08/2026 — Serve da quando il `RolesGuard` NEGA per default: prima una
 * rotta senza `@Roles` era aperta a tutti gli autenticati, e bastava
 * dimenticare il decoratore perché nascesse scoperta (è così che il valet
 * leggeva il listino dei partner da `/service-types`). Ora il permesso va
 * scritto sempre — e dove il permesso è davvero «tutti», si scrive con questo,
 * che è una DICHIARAZIONE, non una dimenticanza.
 *
 * I dati restano filtrati per ruolo dentro i servizi: qui si dice chi può
 * bussare, non che cosa si porta via.
 */
export const Autenticato = () =>
  Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER, Role.VALET, Role.CUSTOMER);
