import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

/** Richiede utente autenticato. E, se la password è da cambiare (account
 *  bonificati «123» → «Deluxy26%»), OBBLIGA a cambiarla: finché non è fatto si
 *  può stare solo su /cambia-password. Prima il guard non lo controllava, così
 *  la schermata obbligatoria non compariva mai. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  if (auth.user()?.mustChangePassword && !state.url.startsWith('/cambia-password')) {
    return router.createUrlTree(['/cambia-password']);
  }
  return true;
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
