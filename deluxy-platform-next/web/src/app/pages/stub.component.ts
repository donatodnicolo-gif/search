import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';

/** Pagina segnaposto per le sezioni non ancora migrate. */
@Component({
  selector: 'app-stub',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <h1>{{ title() }}</h1>
    <p class="page-caption">{{ 'stub.caption' | translate }}</p>
    <div class="card stub-card">
      <div class="stub-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3.5 4.5 7.5v9L12 20.5l7.5-4v-9L12 3.5Z"/>
          <path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9"/>
        </svg>
      </div>
      <h2>{{ 'stub.migratingTitle' | translate }}</h2>
      <p>
        {{ 'stub.availableSoonPart1' | translate }} <strong>{{ title() }}</strong> {{ 'stub.availableSoonPart2' | translate }}
      </p>
      <a class="btn btn-secondary" href="/api/docs" target="_blank" rel="noopener">
        {{ 'stub.openApiDocs' | translate }}
      </a>
    </div>
  `,
  styles: [
    `
      h1 {
        margin: 0;
        font-size: 32px;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      .page-caption {
        margin: 4px 0 24px;
        color: var(--text-secondary);
        font-size: 14px;
      }
      .stub-card {
        padding: 56px 32px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 6px;
      }
      .stub-icon {
        width: 46px;
        height: 46px;
        color: var(--gold-strong);
        background: var(--gold-soft);
        border-radius: 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px;
        margin-bottom: 10px;
      }
      .stub-icon svg {
        width: 100%;
        height: 100%;
      }
      h2 {
        margin: 0;
        font-size: 19px;
        font-weight: 600;
        letter-spacing: -0.02em;
      }
      p {
        margin: 4px 0 18px;
        color: var(--text-secondary);
        font-size: 14px;
        max-width: 420px;
      }
    `,
  ],
})
export class StubComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data);
  readonly title = computed(() => (this.data()?.['title'] as string) ?? 'Sezione');
}
