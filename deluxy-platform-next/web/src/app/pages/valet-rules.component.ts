import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface RegolaValet {
  id: string;
  name: string;
  active: boolean;
  scaglioni: { operatore: string; ritiri: number; plus: number }[];
  valets: { id: string; nome: string; attivo: boolean }[];
  consegneCollegate: number;
}

/**
 * LE REGOLE VALET, dal menu: il plus a scaglioni sul numero di RITIRI del
 * giro (stesso valet + giorno + DDT). Importate dal legacy (tabella-34) e
 * applicate dal conteggio stipendi (vedi salaries.module, regola del giro).
 * La stessa tabella vive anche in fondo a /delivery-rules.
 */
@Component({
  selector: 'app-valet-rules',
  standalone: true,
  imports: [TranslatePipe, DecimalPipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'deliveryRules.valet.title' | translate }}</h1>
        <p class="page-caption">{{ 'deliveryRules.valet.caption' | translate }}</p>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (!regole().length) {
      <div class="card state-card"><span class="muted">—</span></div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'deliveryRules.col.name' | translate }}</th>
              <th>{{ 'deliveryRules.valet.tiers' | translate }}</th>
              <th>{{ 'deliveryRules.valet.appliesTo' | translate }}</th>
              <th class="num">{{ 'deliveryRules.valet.deliveries' | translate }}</th>
              <th>{{ 'deliveryRules.col.status' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of regole(); track r.id) {
              <tr>
                <td class="strong">{{ r.name }}</td>
                <td>{{ etichettaScaglioni(r) }}</td>
                <td>{{ nomiValet(r) }}</td>
                <td class="num">{{ r.consegneCollegate | number }}</td>
                <td>
                  <span class="badge" [class.badge-on]="r.active" [class.badge-off]="!r.active">
                    <span class="dot"></span>{{ (r.active ? 'common.active' : 'common.inactive') | translate }}
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
      .table-wrap { overflow-x: auto; }
      td { vertical-align: middle; }
      .strong { font-weight: 550; letter-spacing: -0.01em; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; }
      .badge .dot { width: 7px; height: 7px; border-radius: 50%; }
      .badge-on { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
      .badge-on .dot { background: var(--success); }
      .badge-off { background: var(--fill); color: var(--text-tertiary); }
      .badge-off .dot { background: var(--text-tertiary); }
      .state-card { display: flex; flex-direction: column; gap: 6px; padding: 28px; }
    `,
  ],
})
export class ValetRulesComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly api = environment.apiUrl;

  readonly regole = signal<RegolaValet[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.http.get<RegolaValet[]>(`${this.api}/delivery-rules/valet`).subscribe({
      next: (d) => { this.regole.set(d ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  etichettaScaglioni(r: RegolaValet): string {
    return r.scaglioni
      .map((s) => `${s.operatore === 'moreThan' ? this.translate.instant('deliveryRules.valet.moreThan', { n: s.ritiri }) : this.translate.instant('deliveryRules.valet.equal', { n: s.ritiri })} → +${s.plus} €`)
      .join(' · ');
  }

  nomiValet(r: RegolaValet): string {
    return r.valets.map((v) => v.nome).join(', ') || '—';
  }
}
