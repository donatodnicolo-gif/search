import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

/** Vista pubblica: solo i dati minimi esposti dall'API di tracking. */
interface PublicTracking {
  code: number;
  status: string;
  date: string;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  recipientFirstName: string;
  partner?: string | null;
  valetFirstName?: string | null;
  logs: { type: string; etichetta: string; createdAt: string }[];
}

// Icone del percorso (SVG inline, currentColor). Sono costanti FISSE del
// codice: si passano al DOM con bypassSecurityTrustHtml (vedi sotto) — mai dati
// esterni, quindi il bypass non apre nessun buco.
const SVG_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4"/><path d="M9.5 12.5h5M9.5 15.5h5"/></svg>';
const SVG_BOX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.3 7.3 12 12l8.7-4.7"/><path d="M12 12v9.5"/><path d="M20.5 7.5v9L12 21 3.5 16.5v-9L12 3Z"/></svg>';
const SVG_SCOOTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="2.4"/><circle cx="18" cy="17" r="2.4"/><path d="M8.4 17h6.4l2.2-7H14"/><path d="M4 7h3l2.2 6.5"/><path d="M17 10l1.6 5"/></svg>';
const SVG_GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M3 7.5h18V11H3z"/><path d="M12 7.5V21"/><path d="M12 7.5S10.5 3.5 8 4.2C6.2 4.7 6.6 7.5 9 7.5h3Zm0 0S13.5 3.5 16 4.2c1.8.5 1.4 3.3-1 3.3h-3Z"/></svg>';
const SVG_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5"/><circle cx="12" cy="16.5" r=".7" fill="currentColor" stroke="none"/><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>';

/**
 * Pagina PUBBLICA di monitoraggio della consegna, da condividere col cliente
 * (link `/tracking/:token`). Nessun login, fuori dallo shell dell'app.
 *
 * ⚠️ È una vetrina rivolta al cliente finale: deve essere grafica e rassicurante
 * (stepper del percorso, stato «eroe», timeline). Espone SOLO ciò che l'API di
 * tracking concede — niente cognomi, contatti, indirizzo o economics.
 */
@Component({
  selector: 'app-tracking',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
  template: `
    <div class="page" [attr.data-state]="heroState()">
      <div class="aura"></div>

      <header class="topbar">
        <span class="brand-mark">D</span>
        <span class="brand-name">Deluxy</span>
      </header>

      @if (loading()) {
        <div class="card pad center muted">{{ 'common.loading' | translate }}</div>
      } @else if (error()) {
        <div class="card pad center err">
          <div class="err-ico">✕</div>
          <p>{{ 'tracking.notFound' | translate }}</p>
        </div>
      } @else {
        @if (data(); as d) {

        <!-- EROE: lo stato in grande, con l'icona che pulsa se in corso -->
        <section class="hero">
          <div class="badge" [class.pulse]="!finito()">
            <span class="badge-glow"></span>
            <span class="ico" [innerHTML]="heroIcon()"></span>
          </div>
          <p class="eyebrow">{{ 'tracking.hello' | translate: { name: d.recipientFirstName } }}</p>
          <h1>{{ 'tracking.hero.' + heroState() + '.title' | translate }}</h1>
          <p class="hero-sub">{{ 'tracking.hero.' + heroState() + '.sub' | translate }}</p>

          @if (!fallita() && d.deliveryTimeFrom) {
            <div class="window">
              <span class="w-label">{{ 'tracking.window' | translate }}</span>
              <span class="w-value">
                {{ d.date | date: 'EEEE d MMMM' : '' : 'it' }} · {{ d.deliveryTimeFrom }}{{ d.deliveryTimeTo ? '–' + d.deliveryTimeTo : '' }}
              </span>
            </div>
          }
        </section>

        <!-- STEPPER: il percorso della consegna -->
        @if (!fallita()) {
          <section class="stepper" [style.--fill.%]="fillPercent()">
            <div class="track"><div class="track-done"></div></div>
            @for (s of steps; track s.key; let i = $index) {
              <div class="step" [class.done]="i < stepIndex()" [class.active]="i === stepIndex()">
                <div class="node">
                  @if (i < stepIndex()) {
                    <svg viewBox="0 0 24 24" class="check" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  } @else {
                    <span class="s-ico" [innerHTML]="s.ico"></span>
                  }
                </div>
                <span class="s-label">{{ 'tracking.step.' + s.key | translate }}</span>
              </div>
            }
          </section>
        }

        <!-- DETTAGLI essenziali -->
        <section class="card details">
          <div class="row">
            <span class="k">{{ 'tracking.title' | translate: { code: d.code } }}</span>
            <span class="pill" [attr.data-state]="heroState()">
              <span class="pdot"></span>{{ 'status.delivery.' + d.status | translate }}
            </span>
          </div>
          @if (d.partner) {
            <div class="row sub">
              <span class="k">{{ 'tracking.by' | translate }}</span>
              <span class="v">{{ d.partner }}</span>
            </div>
          }
          @if (d.valetFirstName) {
            <div class="row sub">
              <span class="k">{{ 'tracking.courier' | translate }}</span>
              <span class="v">{{ d.valetFirstName }}</span>
            </div>
          }
        </section>

        <!-- TIMELINE degli eventi reali -->
        @if (d.logs.length) {
          <section class="card timeline">
            <h2>{{ 'tracking.history' | translate }}</h2>
            <ul>
              @for (l of ordinati(d.logs); track l.createdAt; let last = $last) {
                <li [class.first]="$first">
                  <span class="tl-dot"></span>
                  @if (!last) { <span class="tl-line"></span> }
                  <div class="tl-body">
                    <span class="tl-label">{{ l.etichetta }}</span>
                    <span class="tl-date">{{ l.createdAt | date: 'dd MMM, HH:mm' : '' : 'it' }}</span>
                  </div>
                </li>
              }
            </ul>
          </section>
        }
        }
      }

      <footer class="foot">
        <span class="brand-mini">Deluxy</span>
        <span>{{ 'app.tagline' | translate }}</span>
      </footer>
    </div>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background:
        radial-gradient(1200px 600px at 50% -200px, #fbfbfd 0%, #f5f5f7 55%, #eeeef1 100%); }
      .page { position: relative; max-width: 600px; margin: 0 auto; padding: 20px 18px 40px; overflow: hidden; }

      .aura { position: absolute; top: -180px; left: 50%; width: 460px; height: 460px;
        transform: translateX(-50%); border-radius: 50%; filter: blur(70px); opacity: .38;
        background: var(--accent); pointer-events: none; z-index: 0; transition: background .5s ease; }

      .page { --accent: #8e8e93; --accent-2: #b8963e; }
      .page[data-state="registered"] { --accent: #0a84ff; --accent-2: #64b5ff; }
      .page[data-state="preparing"]  { --accent: #ff9f0a; --accent-2: #ffd60a; }
      .page[data-state="onTheWay"]   { --accent: #7d5fff; --accent-2: #b18cff; }
      .page[data-state="delivered"]  { --accent: #30b46c; --accent-2: #7fe6a8; }
      .page[data-state="failed"]     { --accent: #8e8e93; --accent-2: #c7c7cc; }

      .topbar { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px;
        justify-content: center; margin-bottom: 22px; }
      .brand-mark { display: inline-flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; border-radius: 9px; color: #d9b64e;
        background: linear-gradient(145deg, #1d1f26, #3a3d47);
        font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 700; }
      .brand-name { font-size: 17px; font-weight: 650; letter-spacing: -0.02em; color: #1d1d1f; }

      .card { position: relative; z-index: 1; background: rgba(255,255,255,0.86);
        backdrop-filter: saturate(180%) blur(20px); border: 1px solid rgba(0,0,0,0.06);
        border-radius: 22px; box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 30px rgba(0,0,0,0.05);
        margin-bottom: 14px; }
      .pad { padding: 26px; } .center { text-align: center; }
      .muted { color: #86868b; } .err { color: #c0341d; }
      .err-ico { width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 10px;
        display: grid; place-items: center; background: #fbe9e6; color: #c0341d; font-size: 20px; }

      /* EROE */
      .hero { position: relative; z-index: 1; text-align: center; padding: 12px 8px 26px; }
      .badge { position: relative; width: 108px; height: 108px; margin: 0 auto 18px;
        border-radius: 30px; display: grid; place-items: center; color: #fff;
        background: linear-gradient(150deg, var(--accent), var(--accent-2));
        box-shadow: 0 14px 34px -8px color-mix(in srgb, var(--accent) 60%, transparent); }
      .badge-glow { position: absolute; inset: 0; border-radius: 30px; }
      .badge.pulse .badge-glow { animation: ring 2s ease-out infinite; }
      @keyframes ring {
        0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent); }
        100% { box-shadow: 0 0 0 26px color-mix(in srgb, var(--accent) 0%, transparent); } }
      .badge .ico { display: grid; place-items: center; width: 52px; height: 52px; }
      .badge .ico ::ng-deep svg { width: 52px; height: 52px; display: block; }
      .badge.pulse .ico { animation: bob 2.4s ease-in-out infinite; }
      @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

      .eyebrow { margin: 0 0 4px; font-size: 14px; font-weight: 550; color: var(--accent);
        letter-spacing: -0.01em; }
      .hero h1 { margin: 0 0 8px; font-size: 27px; font-weight: 680; letter-spacing: -0.03em; color: #1d1d1f; }
      .hero-sub { margin: 0 auto; max-width: 40ch; font-size: 15px; line-height: 1.5; color: #6e6e73; }
      .window { display: inline-flex; flex-direction: column; gap: 2px; margin-top: 18px;
        padding: 10px 18px; border-radius: 16px; background: rgba(255,255,255,0.7);
        border: 1px solid rgba(0,0,0,0.06); }
      .w-label { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #86868b; }
      .w-value { font-size: 15px; font-weight: 600; color: #1d1d1f; text-transform: capitalize; }

      /* STEPPER */
      .stepper { position: relative; z-index: 1; display: flex; justify-content: space-between;
        padding: 6px 6px 4px; margin: 4px 4px 18px; }
      .track { position: absolute; top: 24px; left: 34px; right: 34px; height: 3px;
        background: rgba(0,0,0,0.08); border-radius: 3px; }
      .track-done { height: 100%; width: var(--fill, 0%); border-radius: 3px;
        background: linear-gradient(90deg, var(--accent), var(--accent-2)); transition: width .6s cubic-bezier(.4,0,.2,1); }
      .step { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center;
        gap: 8px; flex: 1; }
      .node { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
        background: #fff; border: 2px solid rgba(0,0,0,0.1); color: #b0b0b5; transition: all .35s ease; }
      .step.done .node { background: linear-gradient(150deg, var(--accent), var(--accent-2));
        border-color: transparent; color: #fff; }
      .step.active .node { border-color: var(--accent); color: var(--accent); transform: scale(1.12);
        box-shadow: 0 6px 16px -4px color-mix(in srgb, var(--accent) 55%, transparent); }
      .node .check { width: 20px; height: 20px; display: block; }
      .node .s-ico { display: grid; place-items: center; width: 20px; height: 20px; }
      .node .s-ico ::ng-deep svg { width: 20px; height: 20px; display: block; }
      .s-label { font-size: 11.5px; font-weight: 550; color: #86868b; text-align: center; line-height: 1.2; max-width: 72px; }
      .step.active .s-label, .step.done .s-label { color: #1d1d1f; }

      /* DETTAGLI */
      .details { padding: 16px 18px; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .row.sub { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.05); }
      .row .k { font-size: 14px; font-weight: 600; color: #1d1d1f; }
      .row.sub .k { font-weight: 500; color: #86868b; }
      .row .v { font-size: 14px; font-weight: 600; color: #1d1d1f; }
      .pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 980px;
        font-size: 12.5px; font-weight: 600; color: var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, white); }
      .pdot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }

      /* TIMELINE */
      .timeline { padding: 18px 20px 22px; }
      .timeline h2 { margin: 0 0 14px; font-size: 13px; font-weight: 650; text-transform: uppercase;
        letter-spacing: .04em; color: #86868b; }
      .timeline ul { list-style: none; margin: 0; padding: 0; }
      .timeline li { position: relative; padding: 0 0 18px 26px; }
      .timeline li:last-child { padding-bottom: 0; }
      .tl-dot { position: absolute; left: 0; top: 3px; width: 12px; height: 12px; border-radius: 50%;
        background: #fff; border: 2px solid var(--accent); z-index: 1; }
      .timeline li.first .tl-dot { background: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent); }
      .tl-line { position: absolute; left: 5px; top: 12px; bottom: -6px; width: 2px; background: rgba(0,0,0,0.09); }
      .tl-body { display: flex; flex-direction: column; gap: 1px; }
      .tl-label { font-size: 14px; font-weight: 550; color: #1d1d1f; }
      .tl-date { font-size: 12.5px; color: #86868b; font-variant-numeric: tabular-nums; text-transform: capitalize; }

      .foot { position: relative; z-index: 1; text-align: center; margin-top: 22px; display: flex;
        flex-direction: column; gap: 3px; }
      .brand-mini { font-size: 13px; font-weight: 650; letter-spacing: -0.01em; color: #1d1d1f; }
      .foot span:last-child { font-size: 12px; color: #a1a1a6; }

      @media (max-width: 380px) {
        .hero h1 { font-size: 23px; }
        .s-label { font-size: 10.5px; }
        .node { width: 36px; height: 36px; }
        .track { left: 30px; right: 30px; }
      }

      @media (prefers-color-scheme: dark) {
        :host { background: radial-gradient(1200px 600px at 50% -200px, #1c1c1e 0%, #000 70%); }
        .brand-name, .row .k, .row .v, .hero h1, .tl-label, .step.active .s-label, .step.done .s-label, .brand-mini, .w-value { color: #f5f5f7; }
        .card { background: rgba(28,28,30,0.82); border-color: rgba(255,255,255,0.08); }
        .node { background: #1c1c1e; border-color: rgba(255,255,255,0.14); }
        .window { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.08); }
        .track { background: rgba(255,255,255,0.12); }
        .row.sub { border-color: rgba(255,255,255,0.08); }
        .tl-dot { background: #1c1c1e; }
      }
    `,
  ],
})
export class TrackingComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  readonly data = signal<PublicTracking | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  /** I quattro passi mostrati al cliente, con l'icona (SafeHtml). */
  readonly steps: { key: string; ico: SafeHtml }[] = [
    { key: 'registered', ico: this.sanitizer.bypassSecurityTrustHtml(SVG_DOC) },
    { key: 'preparing', ico: this.sanitizer.bypassSecurityTrustHtml(SVG_BOX) },
    { key: 'onTheWay', ico: this.sanitizer.bypassSecurityTrustHtml(SVG_SCOOTER) },
    { key: 'delivered', ico: this.sanitizer.bypassSecurityTrustHtml(SVG_GIFT) },
  ];
  private readonly icoAlert = this.sanitizer.bypassSecurityTrustHtml(SVG_ALERT);

  /** In quale passo siamo (0..3), dedotto dallo stato reale. */
  readonly stepIndex = computed(() => {
    const s = this.data()?.status ?? '';
    if (['delivered', 'approved', 'delivered_time_to_approve'].includes(s)) return 3;
    if (s === 'in_delivery') return 2;
    if (['accepted', 'in_preparation'].includes(s)) return 1;
    return 0; // created, assigned, e ripieghi
  });

  /** Stato «eroe» per il tema e i testi. */
  readonly heroState = computed(() => {
    const s = this.data()?.status ?? '';
    if (this.fallita()) return 'failed';
    if (['delivered', 'approved', 'delivered_time_to_approve'].includes(s)) return 'delivered';
    if (s === 'in_delivery') return 'onTheWay';
    if (['accepted', 'in_preparation'].includes(s)) return 'preparing';
    return 'registered';
  });

  readonly fallita = computed(() => {
    const s = this.data()?.status ?? '';
    return ['not_delivered', 'cancelled', 'invalidated', 'not_accepted', 'cancellation_requested'].includes(s);
  });
  /** Percorso concluso (consegnato o fallito): l'icona non pulsa più. */
  readonly finito = computed(() => this.fallita() || this.heroState() === 'delivered');

  readonly fillPercent = computed(() => {
    if (this.fallita()) return 0;
    return [8, 42, 75, 100][this.stepIndex()] ?? 0;
  });

  heroIcon(): SafeHtml {
    if (this.fallita()) return this.icoAlert;
    return this.steps[this.stepIndex()].ico;
  }

  /** Timeline dal più recente al meno recente. */
  ordinati(logs: PublicTracking['logs']): PublicTracking['logs'] {
    return [...logs].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  constructor() {
    const token = this.route.snapshot.paramMap.get('token');
    this.http
      .get<PublicTracking>(`${environment.apiUrl}/deliveries/tracking/${token}`)
      .subscribe({
        next: (d) => { this.data.set(d); this.loading.set(false); },
        error: () => { this.error.set(true); this.loading.set(false); },
      });
  }
}
