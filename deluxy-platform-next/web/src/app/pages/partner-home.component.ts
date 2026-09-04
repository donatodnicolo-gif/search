import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

/** Una riga del LISTINO del partner: il servizio e i suoi prezzi. */
interface ServizioListino {
  serviceTypeId?: string;
  price?: number | null;
  includedKm?: number | null;
  extraKmPrice?: number | null;
  extraOutOfCityPrice?: number | null;
  pricePerItem?: number | null;
  serviceType: {
    id: string;
    name: string;
    pricingModel?: string | null;
    notes?: string | null;
    minHours?: number | null;
    active?: boolean;
  };
}
interface QuoteRequest {
  id: string;
  description: string;
  city?: string | null;
  requestedFor?: string | null;
  status: string;
  reply?: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { key: string; color: string }> = {
  // ⚠️ DIFETTO 6 (Libro UX cap.5): «Aperta» attende un'azione → --orange.
  aperta: { key: 'quotes.status.aperta', color: '#c93400' },
  in_lavorazione: { key: 'quotes.status.in_lavorazione', color: '#0071e3' },
  risposta: { key: 'quotes.status.risposta', color: '#248A3D' },
};

/** Icone per MODELLO di prezzo (24x24 stroke, come la sidebar). */
const ICONE_MODELLO: Record<string, string> = {
  PREZZO_FISSO: '<rect x="4" y="7" width="16" height="13" rx="2.5"/><path d="M4 11h16M12 7v13M8 7l1.5-3h5L16 7"/>',
  A_ORA: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  VENDITA: '<rect x="3.5" y="8.5" width="17" height="11.5" rx="2"/><path d="M3.5 13h17M12 8.5V20"/><path d="M12 8.5S10.5 4 8 4a2.2 2.2 0 0 0 0 4.5Zm0 0S13.5 4 16 4a2.2 2.2 0 0 1 0 4.5Z"/>',
  MAGAZZINO: '<path d="M3.5 9.5 12 5l8.5 4.5V20h-17Z"/><path d="M8.5 20v-6h7v6"/>',
  CORPORATE: '<path d="M4 20V6.5A1.5 1.5 0 0 1 5.5 5h7A1.5 1.5 0 0 1 14 6.5V20M14 10h4.5A1.5 1.5 0 0 1 20 11.5V20M3 20h18M7.5 8.5h3M7.5 12h3M7.5 15.5h3"/>',
  ricorrente: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>',
  altro: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.5c-.5.4-.8.2-.8-.4Z"/><path d="M12 7.5v5M9.5 10h5"/>',
  default: '<path d="M12.5 4H19a1 1 0 0 1 1 1v6.5a1.5 1.5 0 0 1-.44 1.06l-7.5 7.5a1.5 1.5 0 0 1-2.12 0l-5-5a1.5 1.5 0 0 1 0-2.12l7.5-7.5A1.5 1.5 0 0 1 12.5 4Z"/><circle cx="15.5" cy="8.5" r="1.3"/>',
};

/**
 * La casa del PARTNER: la prima schermata dopo l'accesso — per i partner a
 * cui è accesa (impostazione «home Servizi», 04/09/2026; nata per
 * chanel_consegne).
 *
 * ⭐ RIFATTA il 04/09 (regola utente: «la lista dei servizi che possono
 * essere richiesti»): non più la vetrina delle linee commerciali di Scout,
 * ma i SERVIZI DEL SUO LISTINO — ogni tessera apre il modulo di consegna
 * col servizio già scelto (`/deliveries/new?servizio=<id>`). In coda: il
 * servizio ricorrente e la richiesta libera (preventivo), più le ultime
 * richieste di preventivo aperte e il filo WhatsApp.
 */
@Component({
  selector: 'app-partner-home',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, TranslatePipe],
  template: `
    <!-- ===================== COPERTINA ===================== -->
    <header class="hero">
      <div class="hero-inner">
        <span class="monogram">D</span>
        <p class="hero-eyebrow">{{ 'partnerHome.eyebrow' | translate }}</p>
        <h1 class="hero-title">{{ 'partnerHome.hello' | translate: { nome: nome() } }}</h1>
        <p class="hero-sub">{{ 'partnerHome.sub2' | translate }}</p>
        <div class="hero-actions">
          <a class="btn btn-light" routerLink="/deliveries/new">{{ 'partnerHome.newDelivery' | translate }}</a>
          @if (whatsapp()) {
            <a class="btn btn-wa" [href]="whatsappHref()" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.1 8.1 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3 0-.2 0-.3-.1-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c.6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.3Z"/></svg>
              {{ 'quotes.whatsapp' | translate }}
            </a>
          }
        </div>
      </div>
    </header>

    <!-- ===================== I SERVIZI DEL LISTINO ===================== -->
    <section class="sezione">
      <div class="sez-head">
        <span class="occhiello">{{ 'partnerHome.servicesEyebrow' | translate }}</span>
        <h2 class="sez-title">{{ 'partnerHome.servicesTitle' | translate }}</h2>
        <p class="sez-sub">{{ 'partnerHome.servicesSub' | translate }}</p>
      </div>

      @if (errore()) { <p class="nota">{{ errore() }}</p> }
      @if (!caricando() && !servizi().length) { <p class="nota">{{ 'partnerHome.noServices' | translate }}</p> }

      <div class="servizi">
        @for (s of servizi(); track s.serviceType.id; let i = $index) {
          <a class="servizio" [routerLink]="['/deliveries/new']" [queryParams]="{ servizio: s.serviceType.id }">
            <span class="s-num">{{ due(i + 1) }}</span>
            <span class="s-icona" [innerHTML]="icona(s.serviceType.pricingModel)"></span>
            <span class="s-nome">{{ s.serviceType.name }}</span>
            <span class="s-pitch">
              {{ modello(s.serviceType.pricingModel) }}
              @if (prezzo(s); as p) { <span class="s-prezzo"> · {{ p }}</span> }
            </span>
            @if (s.serviceType.notes) { <span class="s-note">{{ s.serviceType.notes }}</span> }
            <span class="s-foot">{{ 'partnerHome.request' | translate }}<span class="arrow">→</span></span>
          </a>
        }
        <a class="servizio libera" routerLink="/recurring-services">
          <span class="s-icona" [innerHTML]="icona('ricorrente')"></span>
          <span class="s-nome">{{ 'partnerHome.recurring' | translate }}</span>
          <span class="s-pitch">{{ 'partnerHome.recurringSub' | translate }}</span>
          <span class="s-foot">{{ 'partnerHome.request' | translate }}<span class="arrow">→</span></span>
        </a>
        <a class="servizio libera" routerLink="/quotes">
          <span class="s-icona" [innerHTML]="icona('altro')"></span>
          <span class="s-nome">{{ 'partnerHome.other' | translate }}</span>
          <span class="s-pitch">{{ 'partnerHome.otherSub' | translate }}</span>
          <span class="s-foot">{{ 'quotes.askQuote' | translate }}<span class="arrow">→</span></span>
        </a>
      </div>
    </section>

    <!-- ===================== ULTIME RICHIESTE DI PREVENTIVO ===================== -->
    @if (richieste().length) {
      <section class="sezione">
        <div class="sez-head riga">
          <div>
            <span class="occhiello">{{ 'partnerHome.requestsEyebrow' | translate }}</span>
            <h2 class="sez-title">{{ 'quotes.mineTitle' | translate }}</h2>
          </div>
          <a class="vedi-tutte" routerLink="/quotes">{{ 'partnerHome.seeAll' | translate }} →</a>
        </div>
        <div class="card elenco">
          @for (r of richieste().slice(0, 4); track r.id) {
            <a class="riga-richiesta" routerLink="/quotes">
              <span class="r-desc">{{ r.description }}</span>
              <span class="r-meta">
                @if (r.city) { <span>{{ r.city }}</span> }
                <span>{{ r.createdAt | date: 'd MMM' }}</span>
                <span class="badge" [style.--c]="statusColor(r.status)"><span class="dot"></span>{{ statusKey(r.status) | translate }}</span>
              </span>
            </a>
          }
        </div>
      </section>
    }
  `,
  styles: [
    `
      :host { display: block; }

      /* ---------- Copertina ---------- */
      .hero {
        position: relative;
        overflow: hidden;
        border-radius: 24px;
        background:
          radial-gradient(120% 140% at 88% -20%, rgba(184, 150, 62, 0.35), transparent 55%),
          linear-gradient(150deg, #14161c 0%, #1d2027 55%, #2a2e37 100%);
        color: #fff;
        padding: 54px 48px 48px;
        margin-bottom: 44px;
        box-shadow: var(--shadow-card);
      }
      /* Filo dorato sul bordo alto: l'accento, non una campitura. */
      .hero::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(184, 150, 62, 0.85), transparent);
      }
      .hero-inner { position: relative; max-width: 760px; }
      .monogram {
        display: inline-flex; align-items: center; justify-content: center;
        width: 46px; height: 46px; margin-bottom: 22px;
        border: 1px solid rgba(184, 150, 62, 0.5);
        border-radius: 12px;
        color: var(--gold);
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 24px; font-weight: 700;
      }
      .hero-eyebrow {
        margin: 0 0 10px;
        font-size: 11px; font-weight: 600;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: var(--gold);
      }
      .hero-title {
        margin: 0;
        font-size: 42px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1;
        color: #fff;
      }
      .hero-sub {
        margin: 14px 0 0;
        font-size: 16px; line-height: 1.5;
        color: rgba(255, 255, 255, 0.68);
        max-width: 560px;
      }
      .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
      .btn-light { background: #fff; color: var(--ink); text-decoration: none; }
      .btn-light:hover { background: rgba(255, 255, 255, 0.88); }
      .btn-wa {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.22);
        display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
      }
      .btn-wa:hover { background: rgba(255, 255, 255, 0.17); }
      .btn-wa svg { width: 17px; height: 17px; color: #25d366; }

      /* ---------- Sezioni ---------- */
      .sezione { margin-bottom: 44px; }
      .sez-head { margin-bottom: 20px; }
      .sez-head.riga { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .occhiello {
        display: block; margin-bottom: 6px;
        font-size: 10.5px; font-weight: 600;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: var(--gold-strong);
      }
      .sez-title { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -0.025em; }
      .sez-sub { margin: 6px 0 0; font-size: 14.5px; color: var(--text-secondary); max-width: 560px; }
      .nota { margin: 0 0 16px; font-size: 12.5px; color: var(--text-tertiary); }
      .vedi-tutte { font-size: 13.5px; font-weight: 500; color: var(--text-secondary); text-decoration: none; }
      .vedi-tutte:hover { color: var(--text); }

      /* ---------- Tessere dei servizi ---------- */
      .servizi { display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 18px; }
      .servizio {
        position: relative; overflow: hidden;
        display: flex; flex-direction: column; gap: 10px;
        padding: 26px 24px 22px;
        background: var(--surface);
        border: 1px solid var(--hairline);
        border-radius: var(--radius-l);
        box-shadow: var(--shadow-card);
        text-decoration: none; color: inherit;
        transition: transform 260ms var(--ease), box-shadow 260ms var(--ease), border-color 260ms var(--ease);
      }
      /* Il filo dorato si stende in hover: l'accento arriva col gesto. */
      .servizio::after {
        content: '';
        position: absolute; top: 0; left: 0;
        height: 2px; width: 0;
        background: linear-gradient(90deg, var(--gold), rgba(184, 150, 62, 0.15));
        transition: width 380ms var(--ease);
      }
      .servizio:hover { transform: translateY(-4px); box-shadow: var(--shadow-float); border-color: rgba(184, 150, 62, 0.35); }
      .servizio:hover::after { width: 100%; }
      .s-num {
        position: absolute; top: 22px; right: 24px;
        font-size: 11px; font-variant-numeric: tabular-nums;
        letter-spacing: 0.08em; color: var(--text-tertiary);
      }
      .s-icona {
        display: inline-flex; align-items: center; justify-content: center;
        width: 50px; height: 50px; margin-bottom: 4px;
        border: 1px solid var(--hairline-strong);
        border-radius: 14px;
        color: var(--gold-strong);
        font-size: 19px; font-weight: 600;
        transition: background 260ms var(--ease), color 260ms var(--ease), border-color 260ms var(--ease);
      }
      .s-icona :where(svg) { width: 25px; height: 25px; }
      .servizio:hover .s-icona { background: var(--ink); border-color: var(--ink); color: var(--gold); }
      .s-nome { font-size: 17px; font-weight: 600; letter-spacing: -0.02em; }
      .s-pitch { font-size: 13.5px; line-height: 1.45; color: var(--text-secondary); }
      .s-prezzo { color: var(--text); font-weight: 550; font-variant-numeric: tabular-nums; }
      .s-note { font-size: 12.5px; line-height: 1.4; color: var(--text-tertiary); }
      .s-foot {
        margin-top: auto; padding-top: 14px;
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 13px; font-weight: 500; color: var(--text);
      }
      .arrow { transition: transform 260ms var(--ease); }
      .servizio:hover .arrow { transform: translateX(4px); }
      .servizio.libera { background: linear-gradient(180deg, #fff, #faf7f0); }
      .servizio.libera .s-icona { border-style: dashed; }

      /* ---------- Ultime richieste ---------- */
      .elenco { overflow: hidden; }
      .riga-richiesta {
        display: flex; align-items: center; justify-content: space-between; gap: 18px;
        padding: 16px 22px;
        border-bottom: 1px solid var(--hairline);
        text-decoration: none; color: inherit;
        transition: background 140ms var(--ease);
      }
      .riga-richiesta:last-child { border-bottom: none; }
      .riga-richiesta:hover { background: rgba(120, 120, 128, 0.05); }
      .r-desc { font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .r-meta { display: flex; align-items: center; gap: 14px; flex-shrink: 0; font-size: 12.5px; color: var(--text-tertiary); }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 980px; font-size: 12px; font-weight: 550; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
      .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }

      @media (max-width: 900px) {
        .hero { padding: 40px 26px 34px; border-radius: 20px; margin-bottom: 34px; }
        .hero-title { font-size: 32px; }
        .hero-sub { font-size: 15px; }
        .sez-title { font-size: 22px; }
        .servizi { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
        .r-desc { white-space: normal; }
        .riga-richiesta { flex-direction: column; align-items: flex-start; gap: 8px; }
      }
    `,
  ],
})
export class PartnerHomeComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly decimali = inject(DecimalPipe);

  /** Il listino del partner, così com'è arrivato dalla sua scheda. */
  private readonly listino = signal<ServizioListino[]>([]);
  readonly caricando = signal(true);
  readonly errore = signal<string | null>(null);
  readonly whatsapp = signal<string | null>(null);
  readonly richieste = signal<QuoteRequest[]>([]);

  /** L'insegna del partner se c'è, altrimenti il nome della persona. */
  readonly nome = signal('');

  /** I servizi richiedibili: quelli ATTIVI del listino, nell'ordine del form
   *  consegna (fisso, vendita, a ore, resto — poi per nome), così la prima
   *  tessera è la consegna e non il servizio a ore (lezione Chanel 01/09). */
  readonly servizi = computed(() => {
    const peso = (m?: string | null) =>
      m === 'PREZZO_FISSO' ? 0 : m === 'VENDITA' ? 1 : m === 'A_ORA' ? 2 : 3;
    return this.listino()
      .filter((s) => s.serviceType && s.serviceType.active !== false)
      .sort((a, b) =>
        peso(a.serviceType.pricingModel) - peso(b.serviceType.pricingModel)
        || a.serviceType.name.localeCompare(b.serviceType.name, 'it'));
  });

  constructor() {
    const u = this.auth.user();
    this.nome.set(u?.firstName ?? '');

    // La scheda del partner porta insegna E listino (il partner legge solo se stesso).
    if (u?.partnerId) {
      this.http.get<{ insegna?: string; services?: ServizioListino[] }>(`${environment.apiUrl}/partners/${u.partnerId}`)
        .subscribe({
          next: (p) => {
            if (p?.insegna) this.nome.set(p.insegna);
            this.listino.set(p?.services ?? []);
            this.caricando.set(false);
          },
          error: () => { this.caricando.set(false); this.errore.set(this.translate.instant('common.loadError')); },
        });
    } else {
      this.caricando.set(false);
    }

    this.http.get<{ whatsappNumero: string | null }>(`${environment.apiUrl}/settings/public`)
      .subscribe((s) => this.whatsapp.set(s.whatsappNumero || null));

    this.http.get<QuoteRequest[]>(`${environment.apiUrl}/quotes`)
      .subscribe({ next: (d) => this.richieste.set(d), error: () => this.richieste.set([]) });
  }

  /** Numerazione editoriale delle tessere: 01, 02, … */
  due(n: number): string { return String(n).padStart(2, '0'); }

  modello(m?: string | null): string {
    const chiave = `partnerHome.model.${m ?? ''}`;
    const t = this.translate.instant(chiave);
    return t === chiave ? '' : t;
  }

  /** La riga di prezzo della tessera, per modello: solo numeri > 0, mai zeri
   *  spacciati per prezzi (lo zero scritto non è mai il numero). */
  prezzo(s: ServizioListino): string {
    const n = (v?: number | null) => this.decimali.transform(v ?? 0, '1.0-2') ?? '';
    const t = (k: string, v: number) => this.translate.instant(`partnerHome.price.${k}`, { n: n(v) });
    const p = s.price ?? 0;
    const parti: string[] = [];
    switch (s.serviceType.pricingModel) {
      case 'PREZZO_FISSO':
        if (p > 0) parti.push(t('from', p));
        if ((s.includedKm ?? 0) > 0) parti.push(t('kmIncl', s.includedKm!));
        break;
      case 'A_ORA':
        if (p > 0) parti.push(t('perHour', p));
        if ((s.serviceType.minHours ?? 0) > 1) parti.push(t('minHours', s.serviceType.minHours!));
        break;
      case 'VENDITA':
        if (p > 0) parti.push(t('fee', p));
        break;
      case 'MAGAZZINO':
        if (p > 0) parti.push(t('from', p));
        if ((s.pricePerItem ?? 0) > 0) parti.push(t('perItem', s.pricePerItem!));
        break;
    }
    return parti.join(' · ');
  }

  statusKey(s: string): string { return STATUS_META[s]?.key ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }

  whatsappHref(): string {
    const testo = this.translate.instant('quotes.waGreeting', { nome: this.nome() });
    return `https://wa.me/${this.whatsapp()}?text=${encodeURIComponent(testo)}`;
  }

  icona(chiave?: string | null): SafeHtml {
    return this.svg(ICONE_MODELLO[chiave ?? ''] ?? ICONE_MODELLO['default']);
  }

  private svg(corpo: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`,
    );
  }
}
