import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface SmsTemplate {
  id: string;
  brand: string;
  trigger: string;
  name: string;
  text: string;
  partnerId: string | null;
  partner?: { id: string; insegna: string } | null;
  active: boolean;
}

/**
 * Modelli SMS (Configurazione → Modelli SMS): i testi che partono in
 * automatico al cambiare di stato di una consegna, per brand.
 *
 * I modelli vengono dal database (importati dal legacy): questa pagina li
 * MOSTRA. Un partner vede i modelli globali più i propri (lo decide l'API).
 */
@Component({
  selector: 'app-sms-templates-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'smsTemplates.title' | translate }}</h1>
        <p class="page-caption">{{ 'smsTemplates.caption' | translate: { n: templates().length } }}</p>
      </div>
    </div>

    <div class="filtri card">
      <label class="f">
        <span>{{ 'smsTemplates.brand' | translate }}</span>
        <select class="field" [(ngModel)]="brand">
          <option value="">{{ 'smsTemplates.allBrands' | translate }}</option>
          @for (b of brands(); track b) { <option [value]="b">{{ b }}</option> }
        </select>
      </label>
      <label class="f cerca">
        <span>{{ 'smsTemplates.search' | translate }}</span>
        <input class="field" type="search" [(ngModel)]="cerca" [placeholder]="'smsTemplates.searchPh' | translate" />
      </label>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card card">{{ error() }}</div>
    } @else if (!visibili().length) {
      <div class="card state-card">{{ 'smsTemplates.empty' | translate }}</div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'smsTemplates.col.brand' | translate }}</th>
              <th>{{ 'smsTemplates.col.trigger' | translate }}</th>
              <th>{{ 'smsTemplates.col.name' | translate }}</th>
              <th>{{ 'smsTemplates.col.text' | translate }}</th>
              <th>{{ 'smsTemplates.col.partner' | translate }}</th>
              <th>{{ 'smsTemplates.col.status' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (t of visibili(); track t.id) {
              <tr>
                <td class="nowrap strong">{{ t.brand }}</td>
                <td><span class="pill">{{ t.trigger }}</span></td>
                <td class="nowrap">{{ t.name }}</td>
                <td class="testo" [title]="t.text">{{ t.text }}</td>
                <td class="nowrap">{{ t.partner?.insegna ?? ('smsTemplates.global' | translate) }}</td>
                <td>
                  <span class="badge" [class.badge-on]="t.active" [class.badge-off]="!t.active">
                    <span class="dot"></span>{{ (t.active ? 'common.active' : 'common.inactive') | translate }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .filtri { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 12px; }
      .filtri .f { display: flex; flex-direction: column; gap: 4px; min-width: 170px; }
      .filtri .f.cerca { flex: 1 1 240px; }
      .filtri .f > span { font-size: 12px; color: var(--text-secondary); }
      .table-wrap { overflow-x: auto; }
      td { vertical-align: middle; }
      .strong { font-weight: 550; }
      .nowrap { white-space: nowrap; }
      .pill {
        display: inline-flex; padding: 3px 11px; border-radius: 980px; background: var(--fill);
        color: var(--text-secondary); font-size: 12px; font-weight: 550; white-space: nowrap;
      }
      /* Il testo intero sta nel title: la cella ne mostra due righe al massimo. */
      .testo {
        max-width: 420px; font-size: 13px; color: var(--text-secondary);
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px; border-radius: 980px; font-size: 12.5px; font-weight: 550; white-space: nowrap; }
      .badge .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
      .badge-on { background: rgba(36, 138, 61, 0.1); color: var(--green); } .badge-on .dot { background: var(--green); }
      .badge-off { background: var(--fill); color: var(--text-secondary); } .badge-off .dot { background: var(--text-tertiary); }
      .state-card { padding: 28px; text-align: center; color: var(--text-secondary); }
      .error-card { padding: 14px 16px; background: rgba(215, 0, 21, 0.06); border: 1px solid rgba(215, 0, 21, 0.15); color: var(--red, #d70015); }
    `,
  ],
})
export class SmsTemplatesListComponent {
  private readonly http = inject(HttpClient);

  readonly templates = signal<SmsTemplate[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  brand = '';
  cerca = '';

  readonly brands = computed(() =>
    [...new Set(this.templates().map((t) => t.brand))].sort((a, b) => a.localeCompare(b, 'it')),
  );

  /** Metodo e non computed: `brand` e `cerca` sono proprietà ngModel, non segnali. */
  visibili(): SmsTemplate[] {
    const b = this.brand;
    const t = this.cerca.trim().toLowerCase();
    return this.templates().filter((x) =>
      (!b || x.brand === b)
      && (!t || x.name.toLowerCase().includes(t) || x.text.toLowerCase().includes(t) || x.trigger.toLowerCase().includes(t)),
    );
  }

  constructor() {
    this.http.get<SmsTemplate[]>(`${environment.apiUrl}/sms-templates`).subscribe({
      next: (r) => { this.templates.set(r ?? []); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'Caricamento non riuscito'); },
    });
  }
}
