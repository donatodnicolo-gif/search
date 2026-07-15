import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';

/**
 * Sezione CALCOLI: raccolta di tutte le formule di prezzo dei servizi Deluxy,
 * con anteprima live (endpoint /calculations/preview). La logica vive nel
 * modulo backend api/src/calculations.
 */
@Component({
  selector: 'app-calcoli',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>Calcoli</h1>
    <p class="page-caption">Tutte le formule di prezzo dei servizi, in un unico posto. Provale qui sotto.</p>

    <div class="grid">
      <!-- Vendita -->
      <section class="card block">
        <h2>Vendita</h2>
        <p class="formula">totale = Σ (prezzo prodotto × qtà) — include i prezzi flessibili</p>
        <div class="try">
          <label>Prezzo <input class="field num" type="number" [(ngModel)]="sale.price" /></label>
          <label>Qtà <input class="field num" type="number" [(ngModel)]="sale.qty" /></label>
          <button class="btn btn-secondary" (click)="calc('VENDITA', { lines: [{ price: sale.price, quantity: sale.qty }] }, 'sale')">Calcola</button>
          <span class="res" [class.on]="results.sale != null">{{ results.sale != null ? (results.sale + ' €') : '' }}</span>
        </div>
      </section>

      <!-- Prezzo fisso -->
      <section class="card block">
        <h2>A prezzo fisso</h2>
        <p class="formula">in città: valore servizio + prezzo/km × max(0, distanza − km inclusi)<br />
          fuori città: prezzo fuori città × distanza</p>
        <p class="note">Distanza calcolata via Google Maps (ritiro → consegna). Il valore è esposto nel Listino.</p>
        <div class="try wrap">
          <label class="tg"><input type="checkbox" [(ngModel)]="fixed.inCity" /> In città</label>
          <label>Valore <input class="field num" type="number" [(ngModel)]="fixed.serviceValue" /></label>
          <label>Km incl. <input class="field num" type="number" [(ngModel)]="fixed.kmIncluded" /></label>
          <label>€/km <input class="field num" type="number" [(ngModel)]="fixed.extraKmPrice" /></label>
          <label>€ fuori/km <input class="field num" type="number" [(ngModel)]="fixed.extraOutOfCityPrice" /></label>
          <label>Distanza <input class="field num" type="number" [(ngModel)]="fixed.distanceKm" /></label>
          <button class="btn btn-secondary" (click)="calc('PREZZO_FISSO', fixed, 'fixed')">Calcola</button>
          <span class="res" [class.on]="results.fixed != null">{{ results.fixed != null ? (results.fixed + ' €') : '' }}</span>
        </div>
      </section>

      <!-- A ora -->
      <section class="card block">
        <h2>A ora</h2>
        <p class="formula">valore = max(1, ore) × prezzo orario (minimo 1 ora). Esposto nel Listino.</p>
        <div class="try">
          <label>Ore <input class="field num" type="number" [(ngModel)]="hourly.hours" /></label>
          <label>€/ora <input class="field num" type="number" [(ngModel)]="hourly.hourlyPrice" /></label>
          <button class="btn btn-secondary" (click)="calc('A_ORA', hourly, 'hourly')">Calcola</button>
          <span class="res" [class.on]="results.hourly != null">{{ results.hourly != null ? (results.hourly + ' €') : '' }}</span>
        </div>
      </section>

      <!-- Magazzino -->
      <section class="card block">
        <h2>Magazzino</h2>
        <p class="formula">prezzo fisso + prezzo a pezzo × qtà + prezzo consegna</p>
        <div class="try wrap">
          <label>Fisso <input class="field num" type="number" [(ngModel)]="wh.fixedPrice" /></label>
          <label>A pezzo <input class="field num" type="number" [(ngModel)]="wh.perPiecePrice" /></label>
          <label>Qtà <input class="field num" type="number" [(ngModel)]="wh.quantity" /></label>
          <label>Consegna <input class="field num" type="number" [(ngModel)]="wh.deliveryPrice" /></label>
          <button class="btn btn-secondary" (click)="calc('MAGAZZINO', wh, 'wh')">Calcola</button>
          <span class="res" [class.on]="results.wh != null">{{ results.wh != null ? (results.wh + ' €') : '' }}</span>
        </div>
      </section>

      <!-- Aziendale -->
      <section class="card block span-2">
        <h2>Aziendale (corporate)</h2>
        <p class="formula">Non è una formula di prezzo: il sistema <strong>replica la consegna a un altro partner</strong>, trasformando il servizio da <em>prezzo fisso</em> a <em>vendita</em> (il valore viene quindi calcolato come una Vendita per il partner destinatario).</p>
      </section>
    </div>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 24px; color: var(--text-secondary); font-size: 14px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .span-2 { grid-column: 1 / -1; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 8px; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .formula { margin: 0 0 6px; font-size: 14px; color: var(--text); }
      .note { margin: 0 0 12px; font-size: 12.5px; color: var(--text-tertiary); }
      .try { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
      .try label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); }
      .try .tg { flex-direction: row; align-items: center; gap: 6px; }
      .field.num { width: 90px; text-align: right; }
      .res { font-weight: 700; font-size: 16px; color: var(--text-tertiary); }
      .res.on { color: var(--gold-strong); }
      .btn { text-decoration: none; }
      @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class CalcoliComponent {
  private readonly http = inject(HttpClient);

  sale = { price: 50, qty: 2 };
  fixed = { inCity: true, serviceValue: 10, kmIncluded: 5, extraKmPrice: 1.5, extraOutOfCityPrice: 2, distanceKm: 8 };
  hourly = { hours: 3, hourlyPrice: 25 };
  wh = { fixedPrice: 20, perPiecePrice: 2, quantity: 10, deliveryPrice: 15 };

  results: Record<string, number | null> = { sale: null, fixed: null, hourly: null, wh: null };

  calc(type: string, params: Record<string, unknown>, key: string): void {
    this.http
      .post<{ value: number }>(`${environment.apiUrl}/calculations/preview`, { type, ...params })
      .subscribe((r) => (this.results[key] = r.value));
  }
}
