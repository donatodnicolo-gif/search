import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { SERVICE_PRICING_OPTIONS } from '../core/models';

@Component({
  selector: 'app-service-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/services" class="back">← Servizi</a>
        <h1>Nuovo servizio</h1>
        <p class="page-caption">Definisci il servizio e scegli se è per partner o valet. Le tariffe si impostano nella scheda del partner/valet.</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <section class="card block">
        <header class="block-head"><h2>Servizio</h2>
          <span class="block-sub">I campi con * sono obbligatori.</span></header>
        <div class="grid-2">
          <label class="fld"><span>Nome servizio *</span>
            <input class="field" name="name" [(ngModel)]="model.name" required placeholder="Es. Consegna Standard" /></label>
          <label class="fld"><span>Tipo servizio *</span>
            <select class="field" name="pricingModel" [(ngModel)]="model.pricingModel" required>
              @for (t of pricingOptions; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
            </select></label>
        </div>

        <div class="setup-group mt">
          <span class="group-label">Destinazione</span>
          <div class="chips">
            <button type="button" class="chip" [class.on]="model.scope === 'partner'" (click)="model.scope='partner'">Partner</button>
            <button type="button" class="chip" [class.on]="model.scope === 'valet'" (click)="model.scope='valet'">Valet</button>
            <button type="button" class="chip" [class.on]="model.scope === 'both'" (click)="model.scope='both'">Entrambi</button>
          </div>
        </div>

        @if (model.pricingModel === 'MAGAZZINO') {
          <div class="sub-block">
            <span class="sub-hint">Servizio magazzino: prezzo fisso + prezzo a pezzo + prezzo consegna (valori base, personalizzabili per partner).</span>
            <div class="grid-3">
              <label class="fld"><span>Prezzo fisso (€)</span>
                <input class="field num" type="number" step="0.01" name="basePrice" [(ngModel)]="model.basePrice" /></label>
              <label class="fld"><span>Prezzo a pezzo (€)</span>
                <input class="field num" type="number" step="0.01" name="perPiecePrice" [(ngModel)]="model.perPiecePrice" /></label>
              <label class="fld"><span>Prezzo consegna (€)</span>
                <input class="field num" type="number" step="0.01" name="deliveryPrice" [(ngModel)]="model.deliveryPrice" /></label>
            </div>
          </div>
        }
        @if (model.pricingModel === 'A_ORA') {
          <label class="fld mt" style="max-width:200px"><span>Ore minime</span>
            <input class="field num" type="number" min="1" name="minHours" [(ngModel)]="model.minHours" /></label>
        }

        <label class="fld span-2 mt"><span>Note</span>
          <textarea class="field" rows="2" name="notes" [(ngModel)]="model.notes"></textarea></label>
        <label class="toggle mt"><input type="checkbox" name="hideCustomerInfo" [(ngModel)]="model.hideCustomerInfo" /><span>Nascondi informazioni cliente</span></label>
      </section>

      <!-- Setup prenotazione -->
      <section class="card block">
        <header class="block-head"><h2>Setup</h2>
          <span class="block-sub">Regole di prenotazione del servizio (usate al momento della richiesta).</span></header>
        <div class="grid-2">
          <label class="fld"><span>Giorni preavviso</span>
            <input class="field num" type="number" min="0" name="noticeDays" [(ngModel)]="model.noticeDays" placeholder="Es. 1" /></label>
          <label class="fld"><span>Fascia oraria</span>
            <select class="field" name="slotHours" [(ngModel)]="model.slotHours">
              <option [ngValue]="null">—</option>
              <option [ngValue]="1">1 ora</option>
              <option [ngValue]="2">2 ore</option>
              <option [ngValue]="4">4 ore</option>
            </select></label>
          <label class="fld"><span>Ora minima di inserimento</span>
            <select class="field" name="minOrderTime" [(ngModel)]="model.minOrderTime">
              <option value="">—</option>
              @for (h of hours24; track h) { <option [value]="h">{{ h }}</option> }
            </select></label>
          <label class="fld"><span>Ora massima di inserimento</span>
            <select class="field" name="maxOrderTime" [(ngModel)]="model.maxOrderTime">
              <option value="">—</option>
              @for (h of hours24; track h) { <option [value]="h">{{ h }}</option> }
            </select></label>
        </div>
        <label class="toggle mt"><input type="checkbox" name="allowFlexibleTime" [(ngModel)]="model.allowFlexibleTime" /><span>Consenti orario di consegna flessibile (dalle–alle)</span></label>
        <p class="hint">Prima dell'ora minima e dopo l'ora massima non è possibile richiedere il servizio per la data scelta. Nel form consegna le fasce vanno da <strong>Ora minima</strong> a <strong>Ora massima</strong> (default 06:00–22:00) con passo pari alla <strong>Fascia oraria</strong>. Se "orario flessibile" è attivo, la consegna può indicare una fascia libera dalle–alle; altrimenti si sceglie solo una fascia predefinita. Il ritiro resta sempre con orario flessibile opzionale.</p>
      </section>

      @if (justSaved()) { <div class="ok-card card">Servizio creato ✓ — i valori restano compilati: premi <strong>Crea</strong> o <strong>Duplica</strong> per crearne un altro.</div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/services" class="btn btn-secondary">Annulla</a>
        <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">Duplica</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Salvataggio…' : 'Crea servizio' }}</button>
      </div>
    </form>
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      h1 { margin: 6px 0 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .mt { margin-top: 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .span-2 { grid-column: 1 / -1; }
      .num { text-align: right; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .setup-group { padding-top: 4px; }
      .group-label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { appearance: none; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 16px; font-size: 13px; font-family: inherit; color: var(--text); cursor: pointer; transition: all 0.15s var(--ease); }
      .chip:hover { background: var(--fill); }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .sub-block { margin-top: 14px; padding: 16px; background: var(--fill); border-radius: var(--radius-m); }
      .sub-block .field { background: var(--surface); }
      .sub-hint { display: block; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 10px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      .hint { margin: 14px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
      @media (max-width: 720px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class ServiceFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);
  readonly pricingOptions = SERVICE_PRICING_OPTIONS;
  /** 00:00 … 23:00 per le tendine ora min/max inserimento. */
  readonly hours24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  model = {
    name: '',
    pricingModel: 'PREZZO_FISSO',
    scope: 'partner',
    basePrice: null as number | null,
    perPiecePrice: null as number | null,
    deliveryPrice: null as number | null,
    minHours: null as number | null,
    noticeDays: null as number | null,
    slotHours: null as number | null,
    minOrderTime: '',
    maxOrderTime: '',
    allowFlexibleTime: false,
    notes: '',
    hideCustomerInfo: false,
  };

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    if (!m.name.trim()) { this.error.set('Il nome servizio è obbligatorio.'); return; }

    const payload: Record<string, unknown> = {
      name: m.name.trim(),
      pricingModel: m.pricingModel,
      scope: m.scope,
      hideCustomerInfo: m.hideCustomerInfo,
    };
    if (m.notes.trim()) payload['notes'] = m.notes.trim();
    if (m.pricingModel === 'MAGAZZINO') {
      if (m.basePrice != null) payload['basePrice'] = Number(m.basePrice);
      if (m.perPiecePrice != null) payload['perPiecePrice'] = Number(m.perPiecePrice);
      if (m.deliveryPrice != null) payload['deliveryPrice'] = Number(m.deliveryPrice);
    }
    if (m.pricingModel === 'A_ORA' && m.minHours != null) payload['minHours'] = Number(m.minHours);
    // Setup prenotazione
    if (m.noticeDays != null) payload['noticeDays'] = Number(m.noticeDays);
    if (m.slotHours != null) payload['slotHours'] = Number(m.slotHours);
    if (m.minOrderTime.trim()) payload['minOrderTime'] = m.minOrderTime.trim();
    if (m.maxOrderTime.trim()) payload['maxOrderTime'] = m.maxOrderTime.trim();
    payload['allowFlexibleTime'] = m.allowFlexibleTime;

    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/service-types`, payload).subscribe({
      next: () => {
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/services']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Errore nella creazione del servizio');
      },
    });
  }
}
