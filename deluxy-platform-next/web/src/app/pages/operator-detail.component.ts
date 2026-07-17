import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface OperatorDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  operationRole: string;
  notifyWhatsapp?: boolean;
  notifyMail?: boolean;
  notes?: string;
  active: boolean;
}

/** Dettaglio operatore (sola lettura). */
@Component({
  selector: 'app-operator-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <a routerLink="/operators" class="back">← {{ 'operators.title' | translate }}</a>
      @if (operator(); as o) {
        <div class="title-row">
          <h1>{{ o.firstName }} {{ o.lastName }}</h1>
          <span class="pill" [class.on]="o.active">
            {{ (o.active ? 'common.active' : 'common.inactive') | translate }}
          </span>
          <a class="btn btn-secondary edit" [routerLink]="['/operators', o.id, 'edit']">{{ 'common.edit' | translate }}</a>
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card err">{{ error() }}</div>
    } @else {
      @if (operator(); as o) {
        <div class="grid">
          <section class="card block">
            <h2>{{ 'operatorForm.general.title' | translate }}</h2>
            <dl>
              <dt>{{ 'operators.col.email' | translate }}</dt><dd>{{ o.email }}</dd>
              <dt>{{ 'operators.col.phone' | translate }}</dt><dd>{{ o.phone || '—' }}</dd>
              <dt>{{ 'operatorDetail.address' | translate }}</dt><dd>{{ o.address || '—' }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'operatorForm.setup.title' | translate }}</h2>
            <dl>
              <dt>{{ 'operators.col.role' | translate }}</dt>
              <dd>
                {{ ('enums.operationRole.' + o.operationRole) | translate }}
                @if (roleHint(o.operationRole); as hint) { <span class="hint">{{ hint }}</span> }
              </dd>
              <dt>{{ 'operatorForm.setup.notifyWhatsapp' | translate }}</dt>
              <dd>{{ (o.notifyWhatsapp ? 'common.yes' : 'common.no') | translate }}</dd>
              <dt>{{ 'operatorForm.setup.notifyMail' | translate }}</dt>
              <dd>{{ (o.notifyMail ? 'common.yes' : 'common.no') | translate }}</dd>
            </dl>
          </section>

          @if (o.notes) {
            <section class="card block span-2">
              <h2>{{ 'operatorForm.notes.title' | translate }}</h2>
              <p class="notes">{{ o.notes }}</p>
            </section>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .edit { margin-left: auto; text-decoration: none; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      .hint { display: block; margin-top: 2px; font-size: 12.5px; color: var(--text-tertiary); }
      .notes { margin: 0; font-size: 13.5px; white-space: pre-wrap; }
      .pill { border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .pill.on { background: rgba(36,138,61,0.12); color: var(--green); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.err { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class OperatorDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly operator = signal<OperatorDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Spiegazione del ruolo (vuota se la chiave non esiste). */
  roleHint(role: string): string {
    const key = 'enums.operationRoleHint.' + role;
    const hint = this.translate.instant(key);
    return hint && hint !== key ? hint : '';
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.http.get<OperatorDetail>(`${environment.apiUrl}/operations/${id}`).subscribe({
      next: (o) => { this.operator.set(o); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('operatorDetail.loadError'));
      },
    });
  }
}
