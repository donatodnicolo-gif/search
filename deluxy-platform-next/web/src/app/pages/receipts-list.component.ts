import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface Receipt {
  id: string;
  number?: string;
  fileUrl?: string;
  signed: boolean;
  signedAt?: string;
  salary?: {
    periodStart: string;
    periodEnd: string;
    documentType: string;
    status: string;
    valet?: { firstName: string; lastName: string };
  };
}

/** Ricevute generate dall'invio degli stipendi: il valet le ricarica firmate per l'approvazione. */
@Component({
  selector: 'app-receipts-list',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'receipts.title' | translate }}</h1>
        <p class="page-caption">{{ 'receipts.caption' | translate }}</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab" [class.on]="view() === 'pending'" (click)="setView('pending')">{{ 'receipts.tab.pending' | translate }}</button>
      <button class="tab" [class.on]="view() === 'signed'" (click)="setView('signed')">{{ 'receipts.tab.signed' | translate }}</button>
    </div>

    @if (banner(); as b) { <div class="ok-card card">{{ b }}</div> }
    @if (error()) { <div class="error-card card">{{ error() }}</div> }

    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }
    @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'receipts.col.valet' | translate }}</th>
              <th>{{ 'receipts.col.period' | translate }}</th>
              <th>{{ 'receipts.col.number' | translate }}</th>
              <th>{{ 'receipts.col.document' | translate }}</th>
              <th>{{ 'receipts.col.status' | translate }}</th>
              <th>{{ 'receipts.col.file' | translate }}</th>
              <th>{{ 'receipts.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of receipts(); track r.id) {
              <tr>
                <td class="strong">{{ r.salary?.valet?.lastName }} {{ r.salary?.valet?.firstName }}</td>
                <td class="muted">{{ r.salary?.periodStart | date: 'dd/MM/yy' }} – {{ r.salary?.periodEnd | date: 'dd/MM/yy' }}</td>
                <td>{{ r.number || '—' }}</td>
                <td>{{ ('salaries.doc.' + r.salary?.documentType) | translate }}</td>
                <td>
                  <span class="badge" [style.--c]="r.signed ? '#248A3D' : '#C04C00'"><span class="dot"></span>{{ (r.signed ? 'receipts.signed' : 'receipts.toSign') | translate }}</span>
                </td>
                <td>
                  @if (r.fileUrl) { <a [href]="fileHref(r)" target="_blank" rel="noopener">{{ 'receipts.open' | translate }}</a> } @else { <span class="muted">—</span> }
                </td>
                <td class="row-actions">
                  @if (!r.signed) {
                    @if (signFor() === r.id) {
                      <div class="sign-box">
                        <label class="file-pick">
                          <input type="file" accept="image/*,application/pdf" (change)="onFileSelected($event)" />
                          <span>{{ pickedName() || ('receipts.pickFile' | translate) }}</span>
                        </label>
                        <span class="or">{{ 'receipts.or' | translate }}</span>
                        <input class="field" [(ngModel)]="fileUrl" [placeholder]="'receipts.filePlaceholder' | translate" />
                        <div class="sign-actions">
                          <button class="link-btn" [disabled]="busy() === r.id" (click)="submitSign(r)">{{ 'receipts.upload' | translate }}</button>
                          <button class="link-btn danger" (click)="closeSign()">{{ 'common.cancel' | translate }}</button>
                        </div>
                      </div>
                    } @else {
                      <button class="link-btn" (click)="openSign(r)">{{ 'receipts.signAction' | translate }}</button>
                    }
                  } @else { <span class="muted">✓</span> }
                </td>
              </tr>
            }
            @if (!receipts().length) { <tr><td colspan="7" class="muted empty">{{ 'receipts.empty' | translate }}</td></tr> }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .tabs { display: inline-flex; gap: 4px; background: var(--fill); border-radius: 980px; padding: 4px; margin-bottom: 18px; }
      .tab { appearance: none; border: none; background: none; border-radius: 980px; padding: 7px 18px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text-secondary); cursor: pointer; }
      .tab.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 600; }
      .muted { color: var(--text-tertiary); }
      .empty { text-align: center; padding: 28px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 980px; font-size: 12px; font-weight: 550; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
      .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
      .row-actions { display: flex; gap: 10px; align-items: center; }
      .link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .link-btn.danger { color: var(--red); }
      .link-btn:disabled { opacity: 0.5; cursor: default; }
      .sign-box { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .file-pick { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--hairline); border-radius: 980px; cursor: pointer; font-size: 12.5px; background: var(--surface); max-width: 220px; }
      .file-pick input[type=file] { display: none; }
      .file-pick span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .or { font-size: 12px; color: var(--text-tertiary); }
      .sign-actions { display: flex; gap: 10px; align-items: center; }
      .state-card { padding: 28px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
    `,
  ],
})
export class ReceiptsListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  readonly receipts = signal<Receipt[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly busy = signal<string | null>(null);
  readonly view = signal<'pending' | 'signed'>('pending');
  readonly signFor = signal<string | null>(null);
  readonly pickedName = signal<string | null>(null);
  fileUrl = '';
  private pickedFile: File | null = null;

  /** Origine dell'API (senza /api/v1) per costruire il link ai file caricati. */
  private readonly apiOrigin = environment.apiUrl.replace(/\/api\/v1\/?$/, '');

  constructor() { this.load(); }

  fileHref(r: Receipt): string {
    const url = r.fileUrl ?? '';
    return url.startsWith('/uploads') ? this.apiOrigin + url : url;
  }

  setView(v: 'pending' | 'signed'): void {
    if (this.view() === v) return;
    this.view.set(v);
    this.closeSign();
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    const signed = this.view() === 'signed';
    this.http.get<Receipt[]>(`${environment.apiUrl}/receipts`, { params: { signed: String(signed) } }).subscribe({
      next: (d) => { this.receipts.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
    });
  }

  openSign(r: Receipt): void {
    this.signFor.set(this.signFor() === r.id ? null : r.id);
    this.resetPick();
  }

  closeSign(): void {
    this.signFor.set(null);
    this.resetPick();
  }

  private resetPick(): void {
    this.fileUrl = '';
    this.pickedFile = null;
    this.pickedName.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.pickedFile = file;
    this.pickedName.set(file?.name ?? null);
  }

  /** Carica: se è stato scelto un file dal PC lo invia (multipart), altrimenti usa l'URL. */
  submitSign(r: Receipt): void {
    if (this.pickedFile) {
      this.uploadFile(r, this.pickedFile);
      return;
    }
    if (!this.fileUrl.trim()) { this.error.set(this.translate.instant('receipts.fileRequired')); return; }
    this.error.set(null);
    this.busy.set(r.id);
    this.http.post(`${environment.apiUrl}/receipts/${r.id}/sign`, { fileUrl: this.fileUrl.trim() }).subscribe({
      next: () => this.onSigned(),
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore'); },
    });
  }

  private uploadFile(r: Receipt, file: File): void {
    this.error.set(null);
    this.busy.set(r.id);
    const form = new FormData();
    form.append('file', file, file.name);
    this.http.post(`${environment.apiUrl}/receipts/${r.id}/upload`, form).subscribe({
      next: () => this.onSigned(),
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore'); },
    });
  }

  private onSigned(): void {
    this.busy.set(null);
    this.closeSign();
    this.banner.set(this.translate.instant('receipts.signedOk'));
    this.load();
  }
}
