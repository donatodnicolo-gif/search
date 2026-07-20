import { Component, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * Selettore lingua con bandierine (SVG, cross-platform).
 * Fisso in alto a destra; persiste la scelta in localStorage.
 */
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  template: `
    <div class="lang-switch" role="group" aria-label="Lingua">
      <button
        type="button"
        class="flag-btn"
        [class.on]="current() === 'it'"
        (click)="setLang('it')"
        title="Italiano"
        aria-label="Italiano"
      >
        <svg viewBox="0 0 3 2" class="flag">
          <rect width="3" height="2" fill="#f1f2f2" />
          <rect width="1" height="2" fill="#009246" />
          <rect width="1" height="2" x="2" fill="#ce2b37" />
        </svg>
      </button>
      <button
        type="button"
        class="flag-btn"
        [class.on]="current() === 'en'"
        (click)="setLang('en')"
        title="English"
        aria-label="English"
      >
        <svg viewBox="0 0 60 30" class="flag">
          <clipPath id="uk-s"><path d="M0,0 v30 h60 v-30 z" /></clipPath>
          <clipPath id="uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
          <g clip-path="url(#uk-s)">
            <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
            <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6" />
            <path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#uk-t)" stroke="#C8102E" stroke-width="4" />
            <path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10" />
            <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6" />
          </g>
        </svg>
      </button>
    </div>
  `,
  styles: [
    `
      .lang-switch {
        position: fixed;
        top: 16px;
        right: 20px;
        z-index: 45;
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        background: var(--surface-translucent);
        -webkit-backdrop-filter: blur(18px) saturate(180%);
        backdrop-filter: blur(18px) saturate(180%);
        border: 1px solid var(--hairline);
        border-radius: 980px;
        box-shadow: var(--shadow-float);
      }
      .flag-btn {
        width: 30px;
        height: 22px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 5px;
        background: transparent;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        opacity: 0.5;
        transition: opacity 0.15s var(--ease), border-color 0.15s var(--ease);
      }
      .flag-btn:hover {
        opacity: 0.85;
      }
      .flag-btn.on {
        opacity: 1;
        border-color: var(--gold-strong);
      }
      .flag {
        width: 24px;
        height: 16px;
        border-radius: 2px;
        display: block;
        box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.12);
      }
      @media (max-width: 800px) {
        .lang-switch {
          top: 10px;
          right: 12px;
        }
      }
    `,
  ],
})
export class LanguageSwitcherComponent {
  private readonly translate = inject(TranslateService);
  readonly current = this.translate.currentLang;

  setLang(lang: string): void {
    this.translate.use(lang);
    localStorage.setItem('lang', lang);
  }
}
