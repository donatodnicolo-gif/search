import { ConfermaComponent } from '../shared/conferma.component';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { DeliveryRuleFormComponent } from './delivery-rule-form.component';

interface PartnerLite {
  id: string;
  insegna: string;
}
interface ServiceTypeLite {
  id: string;
  name: string;
}
interface RulePartner {
  partner: PartnerLite;
}
interface RegolaValet {
  id: string;
  name: string;
  active: boolean;
  scaglioni: { operatore: string; ritiri: number; plus: number }[];
  valets: { id: string; nome: string; attivo: boolean }[];
  consegneCollegate: number;
}
interface DeliveryRule {
  id: string;
  name: string;
  dailyRule: boolean;
  dailyCount: number;
  totalRule: boolean;
  totalCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  kmDistance: number | null;
  serviceType: ServiceTypeLite | null;
  partnerBillingAdjustment: number;
  valetPayAdjustment: number;
  toBill: boolean;
  toPay: boolean;
  active: boolean;
  partners: RulePartner[];
}

/**
 * Regole carnet (Consegne Regole dell'app reale, /partner/delivery/rules):
 * numero di consegne garantito giornaliero e/o totale, con plus/minus su
 * fatturazione partner e paga valet, estendibile a piu' partner.
 */
@Component({
  selector: 'app-delivery-rules',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe, DeliveryRuleFormComponent, ConfermaComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'deliveryRules.title' | translate }}</h1>
        <p class="page-caption">{{ rules().length }} {{ 'deliveryRules.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" (click)="openNew()">+ {{ 'deliveryRules.add' | translate }}</button>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card">{{ error() }}</div>
    } @else if (rules().length === 0) {
      <div class="card state-card">
        <strong>{{ 'deliveryRules.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'deliveryRules.emptyHint' | translate }}</span>
      </div>
    } @else {

    <!-- §8-bis del Libro: ogni elenco ha una ricerca. -->
    <div class="cerca-riga">
      <input class="field" type="search" [(ngModel)]="cerca" name="cerca"
             [attr.placeholder]="'comune.cercaPh' | translate" [attr.aria-label]="'comune.cercaPh' | translate" />
      @if (cerca.trim()) {
        <span class="conto-righe">{{ 'comune.contoRighe' | translate: { n: regoleVisibili().length, m: rules().length } }}</span>
      }
    </div>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'deliveryRules.col.name' | translate }}</th>
              <th>{{ 'deliveryRules.col.rule' | translate }}</th>
              <th>{{ 'deliveryRules.col.period' | translate }}</th>
              <th>{{ 'deliveryRules.col.service' | translate }}</th>
              <th>{{ 'deliveryRules.col.adjust' | translate }}</th>
              <th>{{ 'deliveryRules.col.partners' | translate }}</th>
              <th>{{ 'deliveryRules.col.status' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of regoleVisibili(); track r.id) {
              <tr>
                <td class="strong">{{ r.name }}</td>
                <td>
                  @if (r.dailyRule) { <span class="pill">{{ 'deliveryRules.daily' | translate }}: {{ r.dailyCount }}</span> }
                  @if (r.totalRule) { <span class="pill">{{ 'deliveryRules.total' | translate }}: {{ r.totalCount }}</span> }
                </td>
                <td>
                  @if (r.periodStart || r.periodEnd) {
                    {{ r.periodStart ? (r.periodStart | date: 'd/M/yy') : '…' }} – {{ r.periodEnd ? (r.periodEnd | date: 'd/M/yy') : '…' }}
                  } @else { <span class="muted">—</span> }
                </td>
                <td>{{ r.serviceType?.name ?? '—' }}</td>
                <td class="nowrap">
                  <span class="muted">P</span>
                  <span class="adj" [class.up]="r.partnerBillingAdjustment > 0" [class.down]="r.partnerBillingAdjustment < 0">{{ money(r.partnerBillingAdjustment) }}</span>
                  <span class="sep"></span>
                  <span class="muted">V</span>
                  <span class="adj" [class.up]="r.valetPayAdjustment > 0" [class.down]="r.valetPayAdjustment < 0">{{ money(r.valetPayAdjustment) }}</span>
                </td>
                <!-- A CHI si applica, gia' in tabella: i nomi, non un conteggio. -->
                <td class="applicata-a">
                  @if (r.partners.length) {
                    {{ nomiPartner(r) }}
                  } @else { <span class="muted">—</span> }
                </td>
                <td>
                  <span class="badge" [class.badge-on]="r.active" [class.badge-off]="!r.active">
                    <span class="dot"></span>{{ (r.active ? 'common.active' : 'common.inactive') | translate }}
                  </span>
                </td>
                <td class="nowrap">
                  <button class="btn-icon" (click)="openEdit(r)" [title]="'common.edit' | translate">✎</button>
                  <button class="btn-icon danger" (click)="remove(r)" [title]="'common.delete' | translate">🗑</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- LE REGOLE VALET: il plus a scaglioni sui RITIRI del giro. Importate
         dal legacy (tabella-34), finora invisibili nell'app. -->
    @if (regoleValet().length) {
      <div class="page-header mt-sezione">
        <div>
          <h2 class="titolo-sezione">{{ 'deliveryRules.valet.title' | translate }}</h2>
          <p class="page-caption">{{ 'deliveryRules.valet.caption' | translate }}</p>
        </div>
      </div>
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
            @for (r of regoleValet(); track r.id) {
              <tr>
                <td class="strong">{{ r.name }}</td>
                <td>{{ etichettaScaglioni(r) }}</td>
                <td class="applicata-a">{{ nomiValet(r) }}</td>
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

    @if (formOpen()) {
      <app-delivery-rule-form
        [ruleId]="editId()"
        (saved)="onSaved()"
        (closed)="close()"
      />
    }
    @if (confermaPendente(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    [conMotivo]="c.conMotivo ?? false" [motivoLabel]="c.motivoLabel ?? ''"
                    (confermato)="eseguiConferma($event)" (annullato)="confermaPendente.set(null)" />
    }
  `,
  styles: [
    `
      .table-wrap { overflow-x: auto; }
      td { vertical-align: middle; }
      .strong { font-weight: 550; letter-spacing: -0.01em; }
      .pill {
        display: inline-flex; align-items: center; padding: 3px 11px; margin: 1px 4px 1px 0;
        border-radius: 980px; background: var(--fill); color: var(--text-secondary);
        font-size: 12px; font-weight: 550; font-variant-numeric: tabular-nums; white-space: nowrap;
      }
      .nowrap { white-space: nowrap; }
      .adj { font-variant-numeric: tabular-nums; font-weight: 550; }
      .adj.up { color: var(--green); }
      .adj.down { color: var(--red, #d70015); }
      /* Fra i due gruppi P/V la lineetta è una DISTANZA, non un segno. */
      .sep { display: inline-block; width: 10px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px; border-radius: 980px; font-size: 12.5px; font-weight: 550; white-space: nowrap; }
      .badge .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
      .badge-on { background: rgba(36, 138, 61, 0.1); color: var(--green); } .badge-on .dot { background: var(--green); }
      .badge-off { background: var(--fill); color: var(--text-secondary); } .badge-off .dot { background: var(--text-tertiary); }
      .btn-icon {
        appearance: none; border: 1px solid transparent; background: none; cursor: pointer;
        font-size: 14px; line-height: 1; padding: 7px 9px; border-radius: 980px; color: var(--text-secondary);
        transition: background 0.15s ease, color 0.15s ease;
      }
      .btn-icon:hover { background: var(--fill); color: var(--text); }
      .btn-icon.danger:hover { background: rgba(215, 0, 21, 0.08); color: var(--red, #d70015); }
      .error-card { padding: 14px 16px; border-radius: var(--radius-m, 10px); background: rgba(215, 0, 21, 0.06); border: 1px solid rgba(215, 0, 21, 0.15); color: var(--red, #d70015); }
      .state-card .muted { display: block; margin-top: 4px; color: var(--text-tertiary); font-size: 13.5px; }
      .cerca-riga { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .cerca-riga .field { max-width: 340px; }
      .conto-righe { font-size: 12.5px; color: var(--text-secondary); }
    `,
  ],
})
export class DeliveryRulesComponent {

  /**
   * La conferma narrativa in attesa (Libro §7): al posto dei confirm() del
   * browser. L'azione parte solo al click sul verbo.
   */
  readonly confermaPendente = signal<{
    titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary';
    conMotivo?: boolean; motivoLabel?: string; azione: (motivo: string) => void;
  } | null>(null);

  eseguiConferma(motivo: string): void {
    const c = this.confermaPendente();
    this.confermaPendente.set(null);
    c?.azione(motivo);
  }
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly api = environment.apiUrl;

  readonly rules = signal<DeliveryRule[]>([]);

  /** §8-bis: la ricerca, per nome della regola o partner collegato. */
  cerca = '';
  regoleVisibili(): DeliveryRule[] {
    const q = this.cerca.trim().toLowerCase();
    if (!q) return this.rules();
    return this.rules().filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.partners ?? []).some((p) => p.partner?.insegna?.toLowerCase().includes(q)));
  }

  /** I nomi dei partner a cui la regola si applica (i primi 4, poi «+N»). */
  nomiPartner(r: DeliveryRule): string {
    const nomi = r.partners.map((p) => p.partner.insegna);
    return nomi.length <= 4 ? nomi.join(', ') : `${nomi.slice(0, 4).join(', ')} +${nomi.length - 4}`;
  }

  /** Le REGOLE VALET (plus a scaglioni sui ritiri del giro). */
  readonly regoleValet = signal<RegolaValet[]>([]);

  etichettaScaglioni(r: RegolaValet): string {
    return r.scaglioni
      .map((s) => `${s.operatore === 'moreThan' ? this.translate.instant('deliveryRules.valet.moreThan', { n: s.ritiri }) : this.translate.instant('deliveryRules.valet.equal', { n: s.ritiri })} → +${s.plus} €`)
      .join(' · ');
  }

  nomiValet(r: RegolaValet): string {
    const nomi = r.valets.map((v) => v.nome);
    return nomi.length <= 4 ? nomi.join(', ') : `${nomi.slice(0, 4).join(', ')} +${nomi.length - 4}`;
  }
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formOpen = signal(false);
  readonly editId = signal<string | null>(null);

  constructor() {
    this.load();
    this.http.get<RegolaValet[]>(`${this.api}/delivery-rules/valet`).subscribe({
      next: (d) => this.regoleValet.set(d ?? []),
      error: () => {},
    });
  }

  private load(): void {
    this.loading.set(true);
    this.http.get<DeliveryRule[]>(`${this.api}/delivery-rules`).subscribe({
      next: (d) => {
        this.rules.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Errore nel caricamento delle regole');
        this.loading.set(false);
      },
    });
  }

  money(v: number): string {
    const s = v > 0 ? '+' : '';
    return `${s}${v.toFixed(2)}€`;
  }

  openNew(): void {
    this.editId.set(null);
    this.formOpen.set(true);
  }

  openEdit(r: DeliveryRule): void {
    this.editId.set(r.id);
    this.formOpen.set(true);
  }

  close(): void {
    this.formOpen.set(false);
  }

  /** Il form modale ha salvato: chiude e ricarica la lista. */
  onSaved(): void {
    this.formOpen.set(false);
    this.load();
  }

  remove(r: DeliveryRule): void {
    this.confermaPendente.set({
      titolo: this.translate.instant('conferme.eliminaRegola', { nome: r.name }),
      messaggio: this.translate.instant('conferme.eliminaRegolaCorpo'),
      verbo: this.translate.instant('conferme.elimina'),
      tono: 'danger',
      azione: () => this.rimuoviDavvero(r),
    });
  }

  private rimuoviDavvero(r: DeliveryRule): void {
    this.http.delete(`${this.api}/delivery-rules/${r.id}`).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Errore nella cancellazione'),
    });
  }
}
