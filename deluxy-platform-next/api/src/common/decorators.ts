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
