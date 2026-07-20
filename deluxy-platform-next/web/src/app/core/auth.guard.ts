import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

/** Richiede utente autenticato. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

/** Richiede uno dei ruoli indicati (usare nei data della route). */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowed = (route.data['roles'] as Role[] | undefined) ?? [];
  const user = auth.user();
  if (!user) return router.createUrlTree(['/login']);
  if (allowed.length === 0 || allowed.includes(user.role)) return true;
  return router.createUrlTree(['/']);
};
