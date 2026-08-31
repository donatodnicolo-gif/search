import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthUser, LoginResponse } from './models';

const TOKEN_KEY = 'deluxy_token';
const USER_KEY = 'deluxy_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly userSignal = signal<AuthUser | null>(this.restoreUser());

  readonly user = computed(() => this.userSignal());
  readonly isLoggedIn = computed(() => this.userSignal() !== null);

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, {
        email,
        password,
      })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.accessToken);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.userSignal.set(res.user);
        }),
      );
  }

  /** «Password dimenticata»: la risposta è identica esista o no l'account. */
  passwordDimenticata(email: string) {
    return this.http.post<{ ok: true }>(`${environment.apiUrl}/auth/password-dimenticata`, { email });
  }

  /** Imposta la sessione da una risposta di login (usato anche dall'accettazione invito). */
  setSession(res: LoginResponse): void {
    const u = { ...res.user, mustChangePassword: res.mustChangePassword === true };
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    this.userSignal.set(u);
  }

  /** Dopo il cambio password: il vincolo cade, si aggiorna l'utente in sessione. */
  segnaPasswordCambiata(): void {
    const u = this.userSignal();
    if (!u) return;
    const aggiornato = { ...u, mustChangePassword: false };
    localStorage.setItem(USER_KEY, JSON.stringify(aggiornato));
    this.userSignal.set(aggiornato);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSignal.set(null);
    this.router.navigate(['/login']);
  }

  private restoreUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw && localStorage.getItem(TOKEN_KEY)
        ? (JSON.parse(raw) as AuthUser)
        : null;
    } catch {
      return null;
    }
  }
}
