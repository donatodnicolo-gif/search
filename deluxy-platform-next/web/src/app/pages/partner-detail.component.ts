import { DatePipe, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { STATO_CONSEGNA_COLORE, STATO_CONSEGNA_COLORE_DEFAULT } from '../core/stati-consegna';
import { DeliveryRuleFormComponent } from './delivery-rule-form.component';

interface PartnerDetail {
  id: string;
  deleted?: boolean;
  insegna: string;
  email: string;
  businessName?: string;
  vatNumber?: string;
  fiscalCode?: string;
  address?: string;
  phone?: string;
  contactName?: string;
  contactSurname?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  commissionPercent?: number;
  active: boolean;
  isWarehouse?: boolean;
  storeUrl?: string;
  notes?: string;
  bankAccount?: string;
  sdiCode?: string;
  certifiedEmail?: string;
  invoiceEmail?: string;
  provinces?: { province: { id: string; code: string; name: string } }[];
  categories?: { category: { id: string; name: string } }[];
  hasWarehouse?: boolean;
  services?: {
    serviceType?: { id: string; name?: string; pricingModel?: string };
    price?: number; pricePerItem?: number | null; extraKmPrice?: number;
  }[];
  openingHours?: { dayOfWeek: number; openTime?: string | null; closeTime?: string | null; closed?: boolean }[];
}

/** Una riga del blocco «ultime consegne»: solo quello che si mostra. */
interface ConsegnaRecente {
  id: string;
  code: number;
  date: string;
  status: string;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  serviceType?: { name: string } | null;
  valet?: { firstName: string; lastName: string } | null;
}

interface CarnetRule {
  id: string;
  name: string;
  dailyRule: boolean;
  dailyCount: number;
  totalRule: boolean;
  totalCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  serviceType: { id: string; name: string } | null;
  usage: {
    totalUsed: number | null;
    totalRemaining: number | null;
    dailyUsedToday: number | null;
    dailyRemainingToday: number | null;
  };
}

/** Giorni in ordine lun→dom con la loro chiave i18n (dayOfWeek DB: 0=dom…6=sab). */
const WEEK_DAYS: { dayOfWeek: number; key: string }[] = [
  { dayOfWeek: 1, key: 'mon' },
  { dayOfWeek: 2, key: 'tue' },
  { dayOfWeek: 3, key: 'wed' },
  { dayOfWeek: 4, key: 'thu' },
  { dayOfWeek: 5, key: 'fri' },
  { dayOfWeek: 6, key: 'sat' },
  { dayOfWeek: 0, key: 'sun' },
];

/** Dettaglio partner (sola lettura). */
@Component({
  selector: 'app-partner-detail',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TranslatePipe, DeliveryRuleFormComponent],
  template: `
    <div class="form-head">
      <button type="button" class="back" (click)="indietro()">← {{ 'partners.title' | translate }}</button>
      @if (partner(); as p) {
        <div class="title-row">
          <h1>{{ p.insegna }}</h1>
          <span class="pill" [class.on]="p.active">
            {{ (p.active ? 'common.active' : 'common.inactive') | translate }}
          </span>
          <!-- Le azioni stanno INSIEME (28/08, segnalazione utente: coi due
               margin-left auto i bottoni finivano sparpagliati e «Modifica»
               sotto le bandierine fisse della lingua). -->
          <span class="azioni">
            @if (canSeeCalendar()) {
              <a class="btn btn-secondary" [routerLink]="['/calendar']" [queryParams]="{ partnerId: p.id }">{{ 'nav.calendario' | translate }}</a>
            }
            @if (canEdit()) {
              <a class="btn btn-secondary" [routerLink]="['/partners', p.id, 'edit']">{{ 'common.edit' | translate }}</a>
            }
            <!-- Elimina (31/08): sparisce da fatturazione e liste, reversibile. -->
            @if (isAdmin()) {
              @if (!p.deleted) {
                <button type="button" class="btn btn-secondary danger" [disabled]="inCorso()" (click)="elimina(p)">
                  {{ 'partners.delete' | translate }}
                </button>
              } @else {
                <span class="pill-eliminato">{{ 'partners.deleted' | translate }}</span>
                <button type="button" class="btn btn-secondary" [disabled]="inCorso()" (click)="ripristina(p)">
                  {{ 'partners.restore' | translate }}
                </button>
              }
            }
          </span>
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card err">{{ error() }}</div>
    } @else {
      @if (partner(); as p) {
        <div class="grid">
          <section class="card block">
            <h2>{{ 'partnerForm.general.title' | translate }}</h2>
            <dl>
              <dt>{{ 'partners.col.email' | translate }}</dt><dd>{{ p.email }}</dd>
              <dt>{{ 'partnerForm.general.businessName' | translate }}</dt><dd>{{ p.businessName || '—' }}</dd>
              <dt>{{ 'partners.col.phone' | translate }}</dt><dd>{{ p.phone || '—' }}</dd>
              <dt>{{ 'partnerForm.general.vatNumber' | translate }}</dt><dd>{{ p.vatNumber || '—' }}</dd>
              <dt>{{ 'partnerForm.general.fiscalCode' | translate }}</dt><dd>{{ p.fiscalCode || '—' }}</dd>
              <dt>{{ 'partnerForm.general.address' | translate }}</dt><dd>{{ p.address || '—' }}</dd>
              <dt>{{ 'partnerForm.general.contactName' | translate }}</dt>
              <dd>{{ (p.contactName || p.contactSurname) ? (p.contactName + ' ' + (p.contactSurname || '')) : '—' }}</dd>
            </dl>
          </section>

          <!-- Riconciliazione col registro Anagrafiche -->
          <section class="card block span-2">
            <h2>{{ 'partnerAnagrafica.title' | translate }}</h2>
            @if (!anagraficaCaricata()) {
              <button type="button" class="btn btn-secondary" [disabled]="cercando()" (click)="confronta()">
                {{ (cercando() ? 'common.loading' : 'partnerAnagrafica.check') | translate }}
              </button>
              <p class="hint">{{ 'partnerAnagrafica.hint' | translate }}</p>
            } @else {
              @if (anagrafica(); as a) {
              <p class="stato">
                @switch (a.stato) {
                  @case ('collegato') { <span class="badge ok">{{ 'partnerAnagrafica.linked' | translate }}</span> }
                  @case ('trovato-non-collegato') { <span class="badge warn">{{ 'partnerAnagrafica.foundNotLinked' | translate }}</span> }
                  @case ('ambiguo') { <span class="badge warn">{{ 'partnerAnagrafica.ambiguous' | translate }}</span> }
                  @default { <span class="badge">{{ 'partnerAnagrafica.notFound' | translate }}</span> }
                }
                @if (a.criterio) { <span class="criterio">{{ 'partnerAnagrafica.matchedBy' | translate:{ criterio: a.criterio } }}</span> }
              </p>

              @if (a.specchio) {
                <p class="avviso-doppione">
                  <strong>{{ 'partnerAnagrafica.mirrorTitle' | translate }}</strong>
                  {{ 'partnerAnagrafica.mirrorBody' | translate }}
                </p>
                <ul class="candidati">
                  @for (g of a.gemelli; track g.id) {
                    <li>
                      <strong>{{ g.ragioneSociale || g.nome }}</strong>
                      @if (g.citta) { <span class="mono">· {{ g.citta }}</span> }
                      <span class="mono">· {{ 'partnerAnagrafica.contacts' | translate:{ n: g.contatti } }}</span>
                    </li>
                  }
                </ul>
              }

              <!-- ⭐ 04/09/2026 (regola utente): si SCEGLIE quale scheda collegare,
                   e se nessuna va bene si chiede al registro di crearne una. -->
              @if (a.candidati?.length) {
                <p class="hint">{{ 'partnerAnagrafica.candidates' | translate }}</p>
                <ul class="candidati">
                  @for (c of a.candidati; track c.id) {
                    <li>
                      <span>{{ c.nome }} @if (c.pIva) { <span class="mono">· {{ c.pIva }}</span> }</span>
                      @if (canManage()) {
                        <button type="button" class="btn btn-secondary mini" [disabled]="sincronizzando()"
                                (click)="collegaA(c.id)">{{ 'partnerAnagrafica.linkThis' | translate }}</button>
                      }
                    </li>
                  }
                </ul>
                @if (canManage()) {
                  <button type="button" class="btn btn-secondary mini" [disabled]="sincronizzando()"
                          (click)="creaNelRegistro()">{{ 'partnerAnagrafica.createNew' | translate }}</button>
                }
              }

              @if (a.differenze?.length) {
                <table class="mini">
                  <thead><tr>
                    <th>{{ 'partnerAnagrafica.field' | translate }}</th>
                    <th>{{ 'partnerAnagrafica.here' | translate }}</th>
                    <th class="scegli">{{ 'partnerAnagrafica.toRegistry' | translate }}</th>
                    <th>{{ 'partnerAnagrafica.registry' | translate }}</th>
                    <th class="scegli">{{ 'partnerAnagrafica.fromRegistry' | translate }}</th>
                  </tr></thead>
                  <tbody>
                    @for (d of a.differenze; track d.campo) {
                      <tr [class.rischiosa]="rischioso(d.campo)">
                        <td>{{ d.campo }}</td>
                        <td>{{ d.piattaforma ?? '—' }}</td>
                        <!-- ⭐ 04/09/2026 (regola utente): si sceglie che cosa
                             mandare, campo per campo. Dove qui non c'è niente
                             non si spunta: un vuoto non corregge nessuno. -->
                        <td class="scegli">
                          @if (d.piattaforma) {
                            <input type="checkbox" [checked]="daMandare().has(d.campo)" (change)="scegliDaMandare(d.campo)"
                                   [title]="'partnerAnagrafica.toRegistryHint' | translate">
                          } @else {
                            <span class="vuoto" [title]="'partnerAnagrafica.emptyHere' | translate">—</span>
                          }
                        </td>
                        <td class="reg">{{ d.registro ?? '—' }}
                          @if (d.scrittoDa) {
                            <span class="provenienza">{{ 'partnerAnagrafica.writtenBy' | translate:{ sistema: d.scrittoDa, quando: (d.scrittoIl | date: 'dd/MM/yyyy') } }}</span>
                          }
                        </td>
                        <td class="scegli">
                          @if (d.registro) {
                            <input type="checkbox" [checked]="daPrendere().has(d.campo)"
                                   (change)="scegli(d.campo)"
                                   [title]="rischioso(d.campo) ? ('partnerAnagrafica.riskyField' | translate) : ''">
                          } @else {
                            <span class="vuoto" [title]="'partnerAnagrafica.emptyThere' | translate">—</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else if (a.anagrafica && !a.specchio) {
                <p class="hint ok">{{ 'partnerAnagrafica.identical' | translate }}</p>
              }

              @if (canManage()) {
                @if (a.differenze?.length && !a.specchio) {
                  <div class="azioni">
                    <button type="button" class="btn btn-primary" [disabled]="!daPrendere().size || importando()"
                            (click)="importa()">
                      {{ (importando() ? 'common.saving' : 'partnerAnagrafica.pull') | translate:{ n: daPrendere().size } }}
                    </button>
                    @if (esitoImport(); as e) { <span class="esito" [class.ok]="e.ok">{{ e.messaggio }}</span> }
                  </div>
                  <p class="hint">{{ 'partnerAnagrafica.pullHint' | translate }}</p>
                }
                <!-- ⚠️ I bottoni DICONO che cosa faranno, e cambiano con lo
                     stato del confronto: «Invia al registro» valeva sia per
                     creare una scheda che non c'e', sia per riscrivere su una
                     che c'e' gia' — due gesti diversi sotto la stessa parola.
                     Nel caso AMBIGUO il bottone resta visibile ma spento: il
                     server rifiuterebbe comunque (piu' record possibili, per
                     non crearne un altro), e un bottone che puo' solo fallire
                     e' peggio di uno spento che dice perche'. -->
                <div class="azioni">
                  <button type="button" class="btn btn-primary"
                          [disabled]="sincronizzando() || a.stato === 'ambiguo'"
                          [title]="a.stato === 'ambiguo' ? ('partnerAnagrafica.pushBlocked' | translate) : ''"
                          (click)="sincronizza()">
                    {{ (sincronizzando() ? 'common.saving' : etichettaInvio(a.stato)) | translate }}
                  </button>
                  <button type="button" class="btn btn-secondary" [disabled]="cercando()" (click)="confronta()">
                    {{ (cercando() ? 'common.loading' : 'partnerAnagrafica.recheck') | translate }}
                  </button>
                  @if (esitoSync(); as e) { <span class="esito" [class.ok]="e.ok">{{ e.messaggio }}</span> }
                </div>
                <p class="hint">{{ spiegazioneInvio(a.stato) | translate }}</p>
              }
              }
            }
          </section>

          <section class="card block">
            <h2>{{ 'partnerForm.payments.title' | translate }}</h2>
            <dl>
              <dt>{{ 'partnerForm.payments.paymentMethod' | translate }}</dt>
              <dd>{{ p.paymentMethod ? ('enums.paymentMethod.' + p.paymentMethod | translate) : '—' }}</dd>
              <dt>{{ 'partnerForm.payments.paymentStatus' | translate }}</dt>
              <dd>{{ p.paymentStatus ? ('enums.paymentStatus.' + p.paymentStatus | translate) : '—' }}</dd>
              <dt>{{ 'partnerForm.payments.bankAccount' | translate }}</dt><dd>{{ p.bankAccount || '—' }}</dd>
              <dt>{{ 'partnerForm.payments.sdiCode' | translate }}</dt><dd>{{ p.sdiCode || '—' }}</dd>
              <dt>{{ 'partnerForm.payments.certifiedEmail' | translate }}</dt><dd>{{ p.certifiedEmail || '—' }}</dd>
              <dt>{{ 'partnerForm.payments.invoiceEmail' | translate }}</dt><dd>{{ p.invoiceEmail || '—' }}</dd>
              <dt>{{ 'partnerForm.services.commissionPercent' | translate }}</dt><dd>{{ p.commissionPercent ?? 0 }}%</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'partnerForm.provinces.title' | translate }}</h2>
            @if (p.provinces?.length) {
              <div class="chips">
                @for (pp of p.provinces; track pp.province.id) {
                  <span class="chip">{{ pp.province.code }} · {{ pp.province.name }}</span>
                }
              </div>
            } @else { <p class="muted">{{ 'partnerForm.provinces.empty' | translate }}</p> }
          </section>

          <section class="card block">
            <h2>{{ 'partnerForm.categories.title' | translate }}</h2>
            @if (p.categories?.length) {
              <div class="chips">
                @for (c of p.categories; track c.category.id) { <span class="chip">{{ c.category.name }}</span> }
              </div>
            } @else { <p class="muted">{{ 'partnerForm.categories.empty' | translate }}</p> }
          </section>

          <section class="card block">
            <header class="block-head">
              <h2>{{ 'partnerForm.openingHours.title' | translate }}</h2>
              @if (canManage()) {
                <button type="button" class="btn btn-secondary mini" (click)="apriOrari(p)">
                  {{ (modificaOrari() ? 'common.cancel' : 'common.edit') | translate }}
                </button>
              }
            </header>

            @if (!modificaOrari()) {
              @if (weekHours(p).length) {
                <div class="hours">
                  @for (h of weekHours(p); track h.key) {
                    <div class="hours-row">
                      <span class="hours-day">{{ 'partnerForm.openingHours.days.' + h.key | translate }}</span>
                      @if (h.closed) { <span class="hours-closed">{{ 'partnerForm.openingHours.closed' | translate }}</span> }
                      @else { <span class="hours-time">{{ h.openTime }}<span class="sep">–</span>{{ h.closeTime }}</span> }
                    </div>
                  }
                </div>
              } @else { <p class="muted">{{ 'partnerForm.openingHours.emptyDetail' | translate }}</p> }
            } @else {
              <!-- Tutti e sette i giorni, anche quelli mai impostati: la lettura
                   mostra solo i giorni compilati, ma per COMPILARLI bisogna
                   vederli. Un giorno che non esiste nell'elenco non si aggiunge. -->
              <div class="orari-edit">
                @for (r of righeOrari(); track r.dayOfWeek) {
                  <div class="orari-riga">
                    <span class="orari-giorno">{{ 'partnerForm.openingHours.days.' + r.key | translate }}</span>
                    <label class="toggle mini">
                      <input type="checkbox" [(ngModel)]="r.closed" [name]="'closed' + r.dayOfWeek" />
                      <span>{{ 'partnerForm.openingHours.closed' | translate }}</span>
                    </label>
                    <input class="field" type="time" step="900" [(ngModel)]="r.openTime"
                           [name]="'open' + r.dayOfWeek" [disabled]="r.closed" />
                    <input class="field" type="time" step="900" [(ngModel)]="r.closeTime"
                           [name]="'close' + r.dayOfWeek" [disabled]="r.closed" />
                    <!-- ⭐ 04/09/2026 (regola utente): gli orari di UN giorno su
                         tutta la settimana, invece di riscriverli sette volte. -->
                    <button type="button" class="btn btn-secondary mini copia"
                            [title]="'partnerForm.openingHours.copyAllHint' | translate"
                            (click)="copiaSuTuttiIGiorni(r)">{{ 'partnerForm.openingHours.copyAll' | translate }}</button>
                  </div>
                }
              </div>
              <p class="hint">{{ 'partnerForm.openingHours.editHint' | translate }}</p>
              <div class="azioni">
                <button type="button" class="btn btn-primary" [disabled]="salvandoOrari()" (click)="salvaOrari(p)">
                  {{ (salvandoOrari() ? 'common.saving' : 'common.save') | translate }}
                </button>
                @if (esitoOrari(); as e) { <span class="esito" [class.ok]="e.ok">{{ e.messaggio }}</span> }
              </div>
            }
          </section>

          <section class="card block span-2">
            <h2>{{ 'partnerForm.services.title' | translate }}</h2>
            @if (p.services?.length) {
              <table class="mini">
                <thead><tr>
                  <th>{{ 'services.col.name' | translate }}</th>
                  <th class="num">{{ 'deliveryDetail.price' | translate }}</th>
                </tr></thead>
                <tbody>
                  @for (s of serviziVisibili(p); track $index) {
                    <tr>
                      <td>{{ s.serviceType?.name || '—' }}</td>
                      <td class="num">{{ prezzoServizio(s) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (serviziNascosti(p); as n) {
                @if (n > 0) {
                  <p class="hint">{{ 'partnerForm.services.warehouseHidden' | translate:{ n: n } }}</p>
                }
              }
            } @else { <p class="muted">{{ 'partnerForm.services.empty' | translate }}</p> }
          </section>

          <section class="card block span-2">
            <div class="sec-head">
              <h2>{{ 'deliveryRules.title' | translate }}</h2>
              @if (canEditRules()) {
                <button class="btn btn-secondary sm" (click)="addRule(p.id)">+ {{ 'deliveryRules.add' | translate }}</button>
              }
            </div>
            @if (carnetRules().length) {
              <div class="carnet-grid">
                @for (r of carnetRules(); track r.id) {
                  <div class="carnet">
                    <div class="carnet-head">
                      <span class="carnet-name">{{ r.name }}</span>
                      @if (r.serviceType) { <span class="chip">{{ r.serviceType.name }}</span> }
                      @if (canEditRules()) {
                        <button class="btn-icon" (click)="editRule(r.id, p.id)" [title]="'common.edit' | translate">✎</button>
                      }
                    </div>
                    <div class="carnet-body">
                      @if (r.totalRule) {
                        <div class="gauge">
                          <div class="gauge-top">
                            <span class="muted">{{ 'partnerDetail.carnet.remaining' | translate }}</span>
                            <span class="big" [class.zero]="r.usage.totalRemaining === 0">{{ r.usage.totalRemaining }}</span>
                            <span class="muted">/ {{ r.totalCount }}</span>
                          </div>
                          <div class="bar"><span class="bar-fill" [style.width.%]="pct(r.usage.totalRemaining, r.totalCount)"></span></div>
                          <span class="sub muted">{{ 'partnerDetail.carnet.used' | translate }}: {{ r.usage.totalUsed }}{{ periodLabel(r) }}</span>
                        </div>
                      }
                      @if (r.dailyRule) {
                        <div class="daily">
                          <span class="muted">{{ 'partnerDetail.carnet.today' | translate }}</span>
                          <span class="big sm" [class.zero]="r.usage.dailyRemainingToday === 0">{{ r.usage.dailyRemainingToday }}</span>
                          <span class="muted">/ {{ r.dailyCount }} {{ 'partnerDetail.carnet.perDay' | translate }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="muted">{{ 'partnerDetail.carnet.none' | translate }}</p>
            }
          </section>

          @if (p.notes) {
            <section class="card block span-2">
              <h2>{{ 'partnerForm.sales.notes' | translate }}</h2>
              <p class="notes">{{ p.notes }}</p>
            </section>
          }

          <!-- Le ultime consegne CHIESTE da questo partner.
               ⚠️ Non è una lista da consultare: sono dieci righe per capire a
               colpo d'occhio che cosa chiede e come sta andando. Chi vuole
               cercare, filtrare o scorrere va nell'elenco consegne — il link
               è qui sotto, già filtrato su questo partner. -->
          <section class="card block span-2">
            <div class="sec-head">
              <h2>{{ 'partnerDetail.ultimeConsegne.title' | translate }}</h2>
              <a class="btn btn-secondary sm" [routerLink]="['/deliveries']"
                 [queryParams]="{ partnerId: p.id }">
                {{ 'partnerDetail.ultimeConsegne.all' | translate }}
              </a>
            </div>
            @if (consegneInCorso()) {
              <p class="muted">{{ 'common.loading' | translate }}</p>
            } @else if (!ultimeConsegne().length) {
              <p class="muted">{{ 'partnerDetail.ultimeConsegne.none' | translate }}</p>
            } @else {
              <div class="table-wrap">
                <table class="mini consegne">
                  <thead><tr>
                    <th>#</th>
                    <th>{{ 'deliveries.col.date' | translate }}</th>
                    <th>{{ 'deliveries.col.recipient' | translate }}</th>
                    <th>{{ 'deliveries.col.service' | translate }}</th>
                    <th>{{ 'deliveries.col.valet' | translate }}</th>
                    <th>{{ 'deliveries.col.status' | translate }}</th>
                  </tr></thead>
                  <tbody>
                    @for (c of ultimeConsegne(); track c.id) {
                      <tr class="row-link" tabindex="0"
                          (click)="apriConsegna(c.id)" (keydown.enter)="apriConsegna(c.id)">
                        <td class="mono">#{{ c.code }}</td>
                        <td>{{ c.date | date: 'd/M/yy' }}</td>
                        <td>{{ nomeDestinatario(c) }}</td>
                        <td class="muted">{{ c.serviceType?.name || '—' }}</td>
                        <td class="muted">{{ nomeValet(c) }}</td>
                        <td>
                          <!-- Il colore viene dalla mappa UNICA degli stati
                               (core/stati-consegna.ts): ricopiarlo qui
                               rifarebbe il difetto delle cinque copie. -->
                          <span class="stato-chip">
                            <span class="dot" [style.background]="coloreStato(c.status)"></span>
                            {{ 'status.delivery.' + c.status | translate }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        </div>
      }
    }

    @if (ruleFormOpen()) {
      <app-delivery-rule-form
        [ruleId]="editRuleId()"
        [lockPartnerId]="lockPartnerId()"
        (saved)="onRuleSaved()"
        (closed)="ruleFormOpen.set(false)"
      />
    }
  `,
  styles: [
    `
      .stato { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; }
      .badge { padding: 3px 10px; border-radius: 999px; font-size: 12.5px; background: var(--surface-sunken, #ececef); }
      .badge.ok { background: rgba(36,138,61,.12); color: #1a7f37; }
      .badge.warn { background: rgba(184,150,62,.14); color: #8a6d1f; }
      .criterio { font-size: 12.5px; color: var(--text-tertiary); }
      .avviso-doppione {
        margin: 10px 0 6px; padding: 10px 12px; border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--danger) 8%, transparent);
        border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
        font-size: 13px; line-height: 1.5;
      }
      .avviso-doppione strong { display: block; }
      .mini th.scegli, .mini td.scegli { width: 34px; text-align: center; }
      .mini tr.rischiosa td { background: color-mix(in srgb, var(--warning, #B8963E) 8%, transparent); }
      .mini td.scegli .vuoto { color: var(--text-tertiary); }
      .candidati { margin: 6px 0 0 18px; font-size: 13px; }
      .azioni { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
      .azioni .danger { color: var(--red); }
      .pill-eliminato { background: var(--red-soft, rgba(215,0,21,0.09)); color: var(--red);
        border-radius: 999px; padding: 4px 12px; font-size: 12.5px; font-weight: 600; }
      .esito { font-size: 13px; color: var(--red, #d70015); }
      .provenienza { display: block; font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
      .orari-edit { display: flex; flex-direction: column; gap: 8px; }
      .orari-riga { display: grid; grid-template-columns: 92px 96px 1fr 1fr; gap: 8px; align-items: center; }
      .orari-giorno { font-size: 13px; font-weight: 550; }
      .orari-riga .field { padding: 6px 8px; font-size: 13px; }
      .orari-riga .toggle.mini span { font-size: 12px; }
      @media (max-width: 640px) { .orari-riga { grid-template-columns: 1fr 1fr; } .orari-giorno { grid-column: 1 / -1; } }
      .esito.ok { color: #1a7f37; }
      .reg { color: var(--text-secondary); }
      .hint.ok { color: #1a7f37; }
      .form-head { margin-bottom: 24px; }
      .back { appearance: none; background: none; border: none; padding: 0; font: inherit; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      /* padding-right: le bandierine della lingua sono FISSE in alto a destra
         (shell, z-index 45): la riga del titolo lascia loro il posto, o
         l'ultimo bottone ci finisce sotto (segnalazione utente 28/08). */
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; padding-right: 96px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .azioni { margin-left: auto; display: inline-flex; gap: 10px; }
      .azioni .btn { text-decoration: none; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0; }
      /* Le ultime consegne: righe basse, si legge a colpo d'occhio. */
      .consegne td { padding: 7px 8px; white-space: nowrap; }
      .consegne .row-link { cursor: pointer; }
      .consegne .row-link:hover { background: var(--fill); }
      .stato-chip { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
      .stato-chip .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
      .notes { margin: 0; font-size: 13.5px; white-space: pre-wrap; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .hours { display: flex; flex-direction: column; gap: 6px; }
      .hours-row { display: flex; align-items: baseline; gap: 12px; font-size: 14px; }
      .hours-day { width: 92px; color: var(--text-secondary); font-weight: 550; }
      .hours-time { font-variant-numeric: tabular-nums; }
      .hours-time .sep { margin: 0 4px; color: var(--text-tertiary); }
      .hours-closed { color: var(--text-tertiary); font-style: italic; }
      .orari-riga .copia { margin-left: 8px; white-space: nowrap; }
      .candidati li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 3px 0; }
      .btn.mini { padding: 4px 12px; font-size: 12px; }
      .chip { border: 1px solid var(--hairline-strong); border-radius: 980px; padding: 4px 12px; font-size: 12.5px; }
      table.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
      table.mini th, table.mini td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--hairline); }
      table.mini th { color: var(--text-tertiary); font-weight: 500; font-size: 12px; }
      .num { text-align: right; }
      .pill { border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .pill.on { background: rgba(36,138,61,0.12); color: var(--green); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.err { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      .carnet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .carnet { border: 1px solid var(--hairline); border-radius: var(--radius-m); padding: 14px 16px; }
      .sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .sec-head h2 { margin: 0; }
      .btn.sm { padding: 5px 12px; font-size: 13px; }
      .btn-icon { border: none; background: none; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: var(--radius-s); color: var(--text-secondary); margin-left: auto; }
      .btn-icon:hover { background: var(--fill); color: var(--text); }
      .carnet-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      .carnet-name { font-weight: 600; font-size: 14px; }
      .carnet-body { display: flex; flex-direction: column; gap: 12px; }
      .gauge-top { display: flex; align-items: baseline; gap: 6px; }
      .big { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .big.sm { font-size: 20px; }
      .big.zero { color: var(--red); }
      .bar { height: 6px; border-radius: 980px; background: var(--fill); overflow: hidden; margin: 6px 0 4px; }
      .bar-fill { display: block; height: 100%; background: var(--green); border-radius: 980px; }
      .sub { font-size: 12px; }
      .daily { display: flex; align-items: baseline; gap: 6px; }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class PartnerDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /**
   * «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2): arrivando da dentro
   * l'app si torna con la history (che conserva filtri, pagina e scroll);
   * da fuori (link diretto, refresh) si ripiega sull'elenco.
   */
  indietro(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/partners']);
  }

  // ---- Riconciliazione col registro Anagrafiche ----
  readonly anagrafica = signal<{
    stato: string; criterio: string | null;
    specchio?: boolean;
    gemelli?: { id: string; nome: string; ragioneSociale: string | null; citta: string | null; fonte: string | null; contatti: number }[];
    anagrafica: { id: string; nome: string; platformId: string | null } | null;
    // `scrittoDa`/`scrittoIl`: chi ha scritto quel dato nel registro e quando.
    // Ci sono solo dove il registro lo sa — non si inventa una provenienza.
    differenze: { campo: string; piattaforma: string | null; registro: string | null; scrittoDa?: string | null; scrittoIl?: string | null }[];
    candidati: { id: string; nome: string; pIva?: string | null }[];
  } | null>(null);
  readonly anagraficaCaricata = signal(false);
  readonly cercando = signal(false);
  readonly sincronizzando = signal(false);
  readonly esitoSync = signal<{ ok: boolean; messaggio: string } | null>(null);
  readonly importando = signal(false);
  readonly esitoImport = signal<{ ok: boolean; messaggio: string } | null>(null);
  /** I campi spuntati per essere presi dal registro. */
  readonly daPrendere = signal<Set<string>>(new Set());

  /** Solo chi gestisce può scrivere sul registro. */
  canManage(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  /**
   * Il confronto NON parte da solo all'apertura della scheda: interroga un
   * servizio esterno e può metterci qualche secondo. Si chiede quando serve.
   */
  confronta(): void {
    const p = this.partner();
    if (!p) return;
    this.cercando.set(true);
    this.esitoSync.set(null);
    this.http.get<any>(`${environment.apiUrl}/partners/${p.id}/anagrafica`).subscribe({
      next: (r) => { this.cercando.set(false); this.anagrafica.set(r); this.anagraficaCaricata.set(true); this.preselezione(r.differenze ?? []); },
      error: (e) => {
        this.cercando.set(false);
        this.anagraficaCaricata.set(true);
        this.anagrafica.set({ stato: 'errore', criterio: null, anagrafica: null, differenze: [], candidati: [] });
        this.esitoSync.set({ ok: false, messaggio: e?.error?.message ?? 'Registro non raggiungibile' });
      },
    });
  }

  /**
   * Campi che il registro conosce peggio di noi.
   *
   * Nel registro c'e' l'AZIENDA, qui il PUNTO VENDITA: prendere l'insegna
   * trasforma «DR VRANJES FIORI CHIARI» in «DR. VRANJES», e l'indirizzo diventa
   * quello della sede legale, uguale per tutti i negozi della catena. Si possono
   * spuntare lo stesso, ma non partono mai da soli.
   */
  /**
   * Il numero a listino non e' sempre in euro: dipende dal modello di prezzo.
   *
   * Per un servizio di VENDITA quei «15» sono 15 **per cento** — e' la Fee che
   * tratteniamo sul venduto, non il costo della consegna. Scriverci «15 €»
   * accanto e' un errore che si legge come un prezzo.
   */
  prezzoServizio(s: { price?: number; pricePerItem?: number | null; serviceType?: { pricingModel?: string } }): string {
    if (s.price == null) return '—';
    switch (s.serviceType?.pricingModel) {
      case 'VENDITA': return `${s.price} %`;
      case 'A_ORA': return `${s.price} €/ora`;
      case 'MAGAZZINO':
        return s.pricePerItem != null ? `${s.price} € · ${s.pricePerItem} € a pezzo` : `${s.price} €`;
      default: return `${s.price} €`;
    }
  }

  /**
   * I servizi di magazzino non si mostrano a chi il magazzino non ce l'ha.
   *
   * La riga a listino esiste davvero nel database originario — 142 RESTAURANT
   * ha «Stock Pallet» con `partnerHasWarehouse = 0` — ma l'app originale la
   * nasconde, ed e' giusto: e' un listino che non si puo' usare.
   */
  serviziVisibili(p: PartnerDetail) {
    return (p.services ?? []).filter((s) => p.hasWarehouse || s.serviceType?.pricingModel !== 'MAGAZZINO');
  }

  serviziNascosti(p: PartnerDetail): number {
    return (p.services ?? []).length - this.serviziVisibili(p).length;
  }

  rischioso(campo: string): boolean {
    // ⚠️ IBAN e P.IVA sono qui per una ragione diversa dalle altre due: non
    // sono «l'azienda contro il punto vendita», sono SOLDI. Un IBAN preso per
    // sbaglio e' un bonifico a un estraneo, e su 97 partner abbinati 3 IBAN e
    // 12 P.IVA discordano gia' oggi.
    return campo === 'Insegna / nome' || campo === 'Indirizzo'
      || campo === 'IBAN' || campo === 'P.IVA';
  }

  scegli(campo: string): void {
    const s = new Set(this.daPrendere());
    s.has(campo) ? s.delete(campo) : s.add(campo);
    this.daPrendere.set(s);
  }

  /** Spunta di partenza: quello che si guadagna senza perdere nulla. */
  preselezione(differenze: { campo: string; piattaforma: string | null; registro: string | null }[]): void {
    const s = new Set<string>();
    for (const d of differenze) {
      if (!d.registro) continue;              // un vuoto non sovrascrive mai
      if (this.rischioso(d.campo)) continue;  // azienda vs punto vendita
      s.add(d.campo);
    }
    this.daPrendere.set(s);
  }

  importa(): void {
    const p = this.partner();
    if (!p || !this.daPrendere().size) return;
    this.importando.set(true);
    this.esitoImport.set(null);
    this.http.post<{ ok: boolean; messaggio: string }>(
      `${environment.apiUrl}/partners/${p.id}/anagrafica/importa`,
      { campi: [...this.daPrendere()] },
    ).subscribe({
      next: (r) => {
        this.importando.set(false);
        this.esitoImport.set(r);
        if (r.ok) { this.ricarica(); this.confronta(); }
      },
      error: (e) => {
        this.importando.set(false);
        this.esitoImport.set({ ok: false, messaggio: e?.error?.message ?? 'Import non riuscito' });
      },
    });
  }

  /**
   * Che cosa farà davvero il bottone, detto sul bottone.
   *
   * ⚠️ Sotto «Invia al registro» c'erano tre gesti diversi: CREARE una scheda
   * che non esiste, COLLEGARE una che esiste ma non è nostra, RISCRIVERE su
   * una già collegata. Chi legge deve sapere quale dei tre sta per fare —
   * creare per sbaglio un doppione nel registro è già successo (23/08).
   */
  etichettaInvio(stato: string): string {
    switch (stato) {
      case 'collegato': return 'partnerAnagrafica.pushUpdate';
      case 'trovato-non-collegato': return 'partnerAnagrafica.pushLink';
      case 'ambiguo': return 'partnerAnagrafica.pushAmbiguous';
      default: return 'partnerAnagrafica.pushCreate';
    }
  }

  /** La riga sotto i bottoni: conseguenza del gesto, non descrizione generica. */
  spiegazioneInvio(stato: string): string {
    switch (stato) {
      case 'collegato': return 'partnerAnagrafica.pushUpdateHint';
      case 'trovato-non-collegato': return 'partnerAnagrafica.pushLinkHint';
      case 'ambiguo': return 'partnerAnagrafica.pushBlocked';
      default: return 'partnerAnagrafica.pushCreateHint';
    }
  }

  /** Manda il partner al registro e ATTENDE l'esito, poi rilegge il confronto. */
  /**
   * ⭐ 04/09/2026 (regola utente): copia gli orari di UN giorno su tutti gli
   * altri. Copia anche «chiuso»: se quel giorno è chiuso, lo diventa la
   * settimana — è quello che il bottone promette. Niente è salvato finché non
   * si preme Salva.
   */
  copiaSuTuttiIGiorni(riga: { dayOfWeek: number; closed: boolean; openTime: string; closeTime: string }): void {
    this.righeOrari.update((righe) =>
      righe.map((r) => (r.dayOfWeek === riga.dayOfWeek
        ? r
        : { ...r, closed: riga.closed, openTime: riga.openTime, closeTime: riga.closeTime })));
  }

  /** Collega il partner a UNA scheda scelta a mano fra i candidati. */
  /** I campi della piattaforma scelti per il registro (nomi come in tabella). */
  readonly daMandare = signal<Set<string>>(new Set());
  scegliDaMandare(campo: string): void {
    this.daMandare.update((s) => {
      const n = new Set(s);
      if (n.has(campo)) n.delete(campo); else n.add(campo);
      return n;
    });
  }

  /**
   * Dai nomi di tabella alle chiavi del registro. È la stessa mappa che usa
   * il confronto lato server: tenerla qui è l'unico modo per mandare solo i
   * campi spuntati senza inventare un secondo linguaggio.
   */
  private static readonly CHIAVI: Record<string, string> = {
    'Insegna / nome': 'nome', 'Ragione sociale': 'ragioneSociale', Email: 'email',
    'P.IVA': 'pIva', 'Codice fiscale': 'codiceFiscale', Indirizzo: 'indirizzo',
    Telefono: 'telefono', Referente: 'contatti', Attivo: 'attivo',
    'Codice SDI': 'codiceSdi', PEC: 'pec', IBAN: 'iban',
    'Intestatario conto': 'intestatarioConto', 'Metodo di pagamento': 'metodoPagamento',
    'Amministrazione — nome': 'amministrazioneNome',
    'Amministrazione — email': 'amministrazioneEmail',
    'Amministrazione — telefono': 'amministrazioneTelefono',
  };

  /** Le chiavi da mandare, o undefined = tutto (comportamento di prima). */
  private campiScelti(): string[] | undefined {
    const scelti = [...this.daMandare()]
      .map((campo) => PartnerDetailComponent.CHIAVI[campo])
      .filter(Boolean);
    return scelti.length ? scelti : undefined;
  }

  collegaA(anagraficaId: string): void {
    this.inviaAlRegistro({ anagraficaId });
  }

  /** Nessun candidato va bene: si chiede al registro di crearne una nuova. */
  creaNelRegistro(): void {
    this.inviaAlRegistro({ creaNuova: true });
  }

  private inviaAlRegistro(scelta: { anagraficaId?: string; creaNuova?: boolean; campi?: string[] }): void {
    const p = this.partner();
    if (!p) return;
    this.sincronizzando.set(true);
    this.esitoSync.set(null);
    this.http.post<{ ok: boolean; messaggio: string }>(
      `${environment.apiUrl}/partners/${p.id}/anagrafica/sincronizza`, { ...scelta, campi: scelta.campi ?? this.campiScelti() },
    ).subscribe({
      next: (r) => {
        this.sincronizzando.set(false);
        this.esitoSync.set(r);
        if (r.ok) this.confronta();
      },
      error: (e) => {
        this.sincronizzando.set(false);
        this.esitoSync.set({ ok: false, messaggio: e?.error?.message ?? 'Invio non riuscito' });
      },
    });
  }

  sincronizza(): void {
    const p = this.partner();
    if (!p) return;
    this.sincronizzando.set(true);
    this.esitoSync.set(null);
    this.http.post<{ ok: boolean; messaggio: string }>(
      // ⭐ 04/09 (regola utente): si mandano SOLO i campi spuntati; nessuna
      // spunta = tutto, come prima.
      `${environment.apiUrl}/partners/${p.id}/anagrafica/sincronizza`, { campi: this.campiScelti() },
    ).subscribe({
      next: (r) => {
        this.sincronizzando.set(false);
        this.esitoSync.set(r);
        // Si rilegge: dopo l'invio il collegamento dovrebbe risultare fatto, e
        // mostrare ancora lo stato vecchio farebbe credere che non sia andata.
        if (r.ok) this.confronta();
      },
      error: (e) => {
        this.sincronizzando.set(false);
        this.esitoSync.set({ ok: false, messaggio: e?.error?.message ?? 'Invio non riuscito' });
      },
    });
  }

  readonly partner = signal<PartnerDetail | null>(null);
  readonly carnetRules = signal<CarnetRule[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // Modale regola carnet (crea/modifica) da questa scheda.
  readonly ruleFormOpen = signal(false);
  readonly editRuleId = signal<string | null>(null);
  readonly lockPartnerId = signal<string | null>(null);

  /** Solo chi puo' gestire le regole (l'API le limita ad ADMIN/OPERATION/PM). */
  canEditRules(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER';
  }

  addRule(partnerId: string): void {
    this.editRuleId.set(null);
    this.lockPartnerId.set(partnerId);
    this.ruleFormOpen.set(true);
  }

  editRule(ruleId: string, partnerId: string): void {
    this.editRuleId.set(ruleId);
    this.lockPartnerId.set(partnerId);
    this.ruleFormOpen.set(true);
  }

  onRuleSaved(): void {
    this.ruleFormOpen.set(false);
    const id = this.partner()?.id;
    if (id) {
      this.loadCarnet(id);
      this.caricaConsegne(id);
    } else {
      this.consegneInCorso.set(false);
    }
  }

  private loadCarnet(id: string): void {
    this.http.get<CarnetRule[]>(`${environment.apiUrl}/delivery-rules/partner/${id}`).subscribe({
      next: (rules) => this.carnetRules.set(rules),
      error: () => {},
    });
  }

  /** Percentuale della barra = quota rimasta sul totale. */
  pct(remaining: number | null, total: number): number {
    if (!total || remaining === null) return 0;
    return Math.round((remaining / total) * 100);
  }

  /** " nel periodo dd/mm–dd/mm" se la regola ha un periodo, altrimenti "". */
  periodLabel(r: CarnetRule): string {
    if (!r.periodStart && !r.periodEnd) return '';
    const f = (d: string | null) => (d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '…');
    return ` (${f(r.periodStart)}–${f(r.periodEnd)})`;
  }

  /** Modifica partner: admin, operation, project manager e il partner stesso. */
  canEdit(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER' || r === 'PARTNER';
  }

  isAdmin(): boolean { return this.auth.user()?.role === 'ADMIN'; }
  readonly inCorso = signal(false);

  elimina(p: PartnerDetail): void {
    this.inCorso.set(true);
    this.http.patch(`${environment.apiUrl}/partners/${p.id}/elimina`, {}).subscribe({
      next: () => { this.inCorso.set(false); this.ricarica(); },
      error: () => this.inCorso.set(false),
    });
  }
  ripristina(p: PartnerDetail): void {
    this.inCorso.set(true);
    this.http.patch(`${environment.apiUrl}/partners/${p.id}/ripristina`, {}).subscribe({
      next: () => { this.inCorso.set(false); this.ricarica(); },
      error: () => this.inCorso.set(false),
    });
  }

  /** Calendario del partner: admin/operation (vedono le consegne di ogni partner). */
  canSeeCalendar(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  // --- modifica orari dalla scheda ------------------------------------------

  readonly modificaOrari = signal(false);
  readonly salvandoOrari = signal(false);
  readonly esitoOrari = signal<{ ok: boolean; messaggio: string } | null>(null);
  /** Le sette righe in lavorazione: tutti i giorni, anche quelli vuoti. */
  righeOrari = signal<{ dayOfWeek: number; key: string; closed: boolean; openTime: string; closeTime: string }[]>([]);

  apriOrari(p: PartnerDetail): void {
    if (this.modificaOrari()) { this.modificaOrari.set(false); return; }
    const perGiorno = new Map((p.openingHours ?? []).map((h) => [h.dayOfWeek, h]));
    this.righeOrari.set(WEEK_DAYS.map((d) => {
      const h = perGiorno.get(d.dayOfWeek);
      return {
        dayOfWeek: d.dayOfWeek, key: d.key,
        closed: !!h?.closed,
        openTime: h?.openTime ?? '',
        closeTime: h?.closeTime ?? '',
      };
    }));
    this.esitoOrari.set(null);
    this.modificaOrari.set(true);
  }

  /**
   * Salva gli orari settimanali.
   *
   * ⚠️ Si mandano SOLO i giorni compilati (chiusi, o con l'orario completo).
   * Un giorno lasciato vuoto significa «non lo so», non «aperto 00:00–00:00»:
   * mandarlo comunque riempirebbe la settimana di orari inventati, e lo
   * smistamento li prenderebbe per veri — un partner risulterebbe aperto a
   * mezzanotte perché nessuno aveva compilato il martedì.
   *
   * ⚠️ E si manda solo `openingHours`: il PUT del partner sostituisce ciò che
   * riceve, quindi mandare l'intero modello riscriverebbe anche campi che
   * nessuno ha toccato.
   */
  salvaOrari(p: PartnerDetail): void {
    const righe = this.righeOrari()
      .filter((r) => r.closed || (r.openTime && r.closeTime))
      .map((r) => ({
        dayOfWeek: r.dayOfWeek,
        closed: r.closed,
        openTime: r.closed ? null : r.openTime,
        closeTime: r.closed ? null : r.closeTime,
      }));
    const incomplete = this.righeOrari().filter((r) => !r.closed && ((r.openTime && !r.closeTime) || (!r.openTime && r.closeTime)));
    if (incomplete.length) {
      this.esitoOrari.set({ ok: false, messaggio: this.translate.instant('partnerForm.openingHours.incomplete') });
      return;
    }
    this.salvandoOrari.set(true);
    this.esitoOrari.set(null);
    this.http.put(`${environment.apiUrl}/partners/${p.id}`, { openingHours: righe }).subscribe({
      next: () => {
        this.salvandoOrari.set(false);
        this.modificaOrari.set(false);
        this.ricarica();
      },
      error: (e) => {
        this.salvandoOrari.set(false);
        this.esitoOrari.set({ ok: false, messaggio: e?.error?.message ?? 'Salvataggio non riuscito' });
      },
    });
  }

  /** Orari settimanali ordinati lun→dom, solo i giorni impostati (chiusi o con orario). */
  weekHours(p: PartnerDetail): { key: string; closed: boolean; openTime: string; closeTime: string }[] {
    const byDay = new Map((p.openingHours ?? []).map((h) => [h.dayOfWeek, h]));
    return WEEK_DAYS.flatMap((d) => {
      const h = byDay.get(d.dayOfWeek);
      if (!h || (!h.closed && !h.openTime && !h.closeTime)) return [];
      return [{ key: d.key, closed: !!h.closed, openTime: h.openTime ?? '', closeTime: h.closeTime ?? '' }];
    });
  }

  /**
   * Quante consegne recenti si mostrano nella scheda del partner.
   *
   * ⚠️ Dieci, non «le ultime»: la scheda deve dire come sta andando, non
   * diventare un secondo elenco consegne. Il bottone accanto al titolo porta
   * all'elenco vero, già filtrato su questo partner.
   */
  private static readonly QUANTE_CONSEGNE = 10;

  readonly ultimeConsegne = signal<ConsegnaRecente[]>([]);
  readonly consegneInCorso = signal(true);

  /**
   * Le ultime consegne di questo partner.
   *
   * ⚠️ `view: 'tutte'` di proposito: il valore predefinito dell'elenco è
   * «attive», e su un partner che non ha lavoro in corso la scheda direbbe
   * «nessuna consegna» avendone migliaia chiuse. L'ordinamento predefinito
   * del server è già data decrescente.
   *
   * ⚠️ Best-effort come il carnet: se fallisce, il resto della scheda si
   * carica lo stesso — ma il blocco lo dice, non resta a «caricamento».
   */
  private caricaConsegne(partnerId: string): void {
    this.http
      .get<{ items: ConsegnaRecente[] }>(`${environment.apiUrl}/deliveries`, {
        params: {
          partnerId,
          view: 'tutte',
          pageSize: String(PartnerDetailComponent.QUANTE_CONSEGNE),
          page: '1',
        },
      })
      .subscribe({
        next: (r) => { this.ultimeConsegne.set(r?.items ?? []); this.consegneInCorso.set(false); },
        error: () => { this.ultimeConsegne.set([]); this.consegneInCorso.set(false); },
      });
  }

  apriConsegna(id: string): void {
    this.router.navigate(['/deliveries', id]);
  }

  nomeDestinatario(c: ConsegnaRecente): string {
    return [c.recipientFirstName, c.recipientLastName].filter(Boolean).join(' ') || '—';
  }

  nomeValet(c: ConsegnaRecente): string {
    return c.valet ? [c.valet.firstName, c.valet.lastName].filter(Boolean).join(' ') : '—';
  }

  /** Il colore viene dalla mappa unica, mai riscritto qui (Libro cap. 5). */
  coloreStato(stato: string): string {
    return STATO_CONSEGNA_COLORE[stato] ?? STATO_CONSEGNA_COLORE_DEFAULT;
  }

  /** Rilegge il partner dal server: serve dopo un import dal registro. */
  ricarica(): void {
    const id = this.route.snapshot.paramMap.get('id');
      this.http.get<PartnerDetail>(`${environment.apiUrl}/partners/${id}`).subscribe({
        next: (p) => { this.partner.set(p); this.loading.set(false); },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Errore nel caricamento del partner');
        },
      });
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.ricarica();
    // Regole carnet del partner con le consegne rimaste (best-effort: se
    // fallisce, la scheda partner si carica lo stesso senza la sezione).
    if (id) this.loadCarnet(id);
  }
}
