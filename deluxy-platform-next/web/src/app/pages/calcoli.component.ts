import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

/**
 * Sezione CALCOLI: raccolta di tutte le formule di prezzo dei servizi Deluxy,
 * con anteprima live (endpoint /calculations/preview). La logica vive nel
 * modulo backend api/src/calculations.
 */
@Component({
  selector: 'app-calcoli',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <h1>{{ 'calcoli.title' | translate }}</h1>
    <p class="page-caption">{{ 'calcoli.caption' | translate }}</p>

    <div class="grid">
      <!-- Vendita -->
      <section class="card block">
        <h2>{{ 'enums.servicePricingLong.VENDITA' | translate }}</h2>
        <p class="formula">{{ 'calcoli.formulaSale' | translate }}</p>
        <div class="try">
          <label>{{ 'calcoli.price' | translate }} <input class="field num" type="number" [(ngModel)]="sale.price" /></label>
          <label>{{ 'calcoli.qty' | translate }} <input class="field num" type="number" [(ngModel)]="sale.qty" /></label>
          <button class="btn btn-secondary" (click)="calc('VENDITA', { lines: [{ price: sale.price, quantity: sale.qty }] }, 'sale')">{{ 'calcoli.calculate' | translate }}</button>
          <span class="res" [class.on]="results.sale != null">{{ results.sale != null ? (results.sale + ' €') : '' }}</span>
        </div>
      </section>

      <!-- Prezzo fisso -->
      <section class="card block">
        <h2>{{ 'enums.servicePricingLong.PREZZO_FISSO' | translate }}</h2>
        <p class="formula">{{ 'calcoli.formulaFixedCity' | translate }}<br />
          {{ 'calcoli.formulaFixedOutCity' | translate }}</p>
        <p class="note">{{ 'calcoli.noteFixed' | translate }}</p>
        <div class="try wrap">
          <label class="tg"><input type="checkbox" [(ngModel)]="fixed.inCity" /> {{ 'calcoli.inCity' | translate }}</label>
          <label>{{ 'calcoli.value' | translate }} <input class="field num" type="number" [(ngModel)]="fixed.serviceValue" /></label>
          <label>{{ 'calcoli.kmIncluded' | translate }} <input class="field num" type="number" [(ngModel)]="fixed.kmIncluded" /></label>
          <label>€/km <input class="field num" type="number" [(ngModel)]="fixed.extraKmPrice" /></label>
          <label>{{ 'calcoli.pricePerKmOutOfCity' | translate }} <input class="field num" type="number" [(ngModel)]="fixed.extraOutOfCityPrice" /></label>
          <label>{{ 'calcoli.distance' | translate }} <input class="field num" type="number" [(ngModel)]="fixed.distanceKm" /></label>
          <button class="btn btn-secondary" (click)="calc('PREZZO_FISSO', fixed, 'fixed')">{{ 'calcoli.calculate' | translate }}</button>
          <span class="res" [class.on]="results.fixed != null">{{ results.fixed != null ? (results.fixed + ' €') : '' }}</span>
        </div>
      </section>

      <!-- A ora -->
      <section class="card block">
        <h2>{{ 'enums.servicePricingLong.A_ORA' | translate }}</h2>
        <p class="formula">{{ 'calcoli.formulaHourly' | translate }}</p>
        <div class="try">
          <label>{{ 'calcoli.hours' | translate }} <input class="field num" type="number" [(ngModel)]="hourly.hours" /></label>
          <label>€/ora <input class="field num" type="number" [(ngModel)]="hourly.hourlyPrice" /></label>
          <button class="btn btn-secondary" (click)="calc('A_ORA', hourly, 'hourly')">{{ 'calcoli.calculate' | translate }}</button>
          <span class="res" [class.on]="results.hourly != null">{{ results.hourly != null ? (results.hourly + ' €') : '' }}</span>
        </div>
      </section>

      <!-- Magazzino -->
      <section class="card block">
        <h2>{{ 'enums.servicePricingLong.MAGAZZINO' | translate }}</h2>
        <p class="formula">{{ 'calcoli.formulaWarehouse' | translate }}</p>
        <div class="try wrap">
          <label>{{ 'calcoli.fixedPrice' | translate }} <input class="field num" type="number" [(ngModel)]="wh.fixedPrice" /></label>
          <label>{{ 'calcoli.perPiecePrice' | translate }} <input class="field num" type="number" [(ngModel)]="wh.perPiecePrice" /></label>
          <label>{{ 'calcoli.qty' | translate }} <input class="field num" type="number" [(ngModel)]="wh.quantity" /></label>
          <label>{{ 'calcoli.deliveryPrice' | translate }} <input class="field num" type="number" [(ngModel)]="wh.deliveryPrice" /></label>
          <button class="btn btn-secondary" (click)="calc('MAGAZZINO', wh, 'wh')">{{ 'calcoli.calculate' | translate }}</button>
          <span class="res" [class.on]="results.wh != null">{{ results.wh != null ? (results.wh + ' €') : '' }}</span>
        </div>
      </section>

      <!-- Aziendale -->
      <section class="card block span-2">
        <h2>{{ 'enums.servicePricingLong.CORPORATE' | translate }}</h2>
        <p class="formula">{{ 'calcoli.corporateNotePart1' | translate }} <strong>{{ 'calcoli.corporateNoteStrong' | translate }}</strong>{{ 'calcoli.corporateNoteComma' | translate }} <em>{{ 'calcoli.corporateNoteEm1' | translate }}</em> {{ 'calcoli.corporateNoteTo' | translate }} <em>{{ 'calcoli.corporateNoteEm2' | translate }}</em> {{ 'calcoli.corporateNotePart4' | translate }}</p>
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
