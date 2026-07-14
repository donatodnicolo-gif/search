import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

/** Pagina segnaposto per le sezioni non ancora migrate. */
@Component({
  selector: 'app-stub',
  standalone: true,
  template: `
    <h1>{{ title() }}</h1>
    <div class="card">
      <p>
        Questa sezione ({{ title() }}) e' in fase di migrazione dalla
        piattaforma legacy.
      </p>
      <p class="muted">
        L'endpoint API corrispondente e' gia' disponibile: consulta la
        documentazione su <code>/api/docs</code>.
      </p>
    </div>
  `,
  styles: [
    `
      h1 {
        margin: 0 0 20px;
        font-size: 24px;
      }
      .card {
        background: var(--deluxy-white);
        border: 1px solid var(--deluxy-border);
        border-radius: 12px;
        padding: 28px;
      }
      .muted {
        color: var(--deluxy-muted);
        font-size: 14px;
      }
      code {
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 4px;
      }
    `,
  ],
})
export class StubComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data);
  readonly title = computed(() => (this.data()?.['title'] as string) ?? 'Sezione');
}
