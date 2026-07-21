// Motore delle variabili degli Script email.
//
// Due tipi di segnaposto tra parentesi quadre [ ... ]:
//  - CONTATTO (automatiche, diverse per ogni destinatario): [nome], [negozio],
//    [ruolo], [email], [telefono], [zona]. Riempite dai dati del contatto.
//  - MANUALI (uguali per tutti in un invio): qualsiasi altro [xxx], es. [data].
//    L'app le rileva nel testo e chiede di compilarle prima dell'invio.
//
// Retro-compatibilità: si accettano ancora anche le vecchie {nome}/{negozio}.

export interface VariabileContatto {
  chiave: string;
  label: string;
}

export const VARIABILI_CONTATTO: VariabileContatto[] = [
  { chiave: 'nome', label: 'Nome referente' },
  { chiave: 'negozio', label: 'Negozio' },
  { chiave: 'ruolo', label: 'Ruolo' },
  { chiave: 'email', label: 'Email' },
  { chiave: 'telefono', label: 'Telefono' },
  { chiave: 'zona', label: 'Zona' },
];

const SET_CONTATTO = new Set(VARIABILI_CONTATTO.map((v) => v.chiave));

export interface DatiContatto {
  nome?: string | null;
  negozio?: string | null;
  ruolo?: string | null;
  email?: string | null;
  telefono?: string | null;
  zona?: string | null;
}

/** Estrae le variabili MANUALI (tra [ ] e non di contatto) presenti nei testi. */
export function variabiliManuali(...testi: (string | null | undefined)[]): string[] {
  const trovate = new Map<string, string>(); // chiave-lower → etichetta originale
  const re = /\[\s*([\p{L}\p{N}_][\p{L}\p{N}_ .-]*?)\s*\]/gu;
  for (const t of testi) {
    for (const m of (t ?? '').matchAll(re)) {
      const raw = m[1].trim();
      const lower = raw.toLowerCase();
      if (!SET_CONTATTO.has(lower) && !trovate.has(lower)) trovate.set(lower, raw);
    }
  }
  return [...trovate.values()];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sostituisce nel testo una variabile [chiave] (o {chiave}), case-insensitive. */
function sostituisci(testo: string, chiave: string, valore: string): string {
  const c = escapeRe(chiave);
  return testo
    .replace(new RegExp(`\\[\\s*${c}\\s*\\]`, 'gi'), valore)
    .replace(new RegExp(`\\{\\s*${c}\\s*\\}`, 'gi'), valore);
}

/**
 * Applica al testo le variabili di contatto + quelle manuali.
 * `manuali` è la mappa {chiave-lower: valore} compilata prima dell'invio.
 */
export function applicaVariabili(testo: string, c: DatiContatto, manuali?: Record<string, string>): string {
  let out = testo ?? '';
  out = sostituisci(out, 'nome', (c.nome ?? '').trim() || 'Gentile cliente');
  out = sostituisci(out, 'negozio', (c.negozio ?? '').trim());
  out = sostituisci(out, 'ruolo', (c.ruolo ?? '').trim());
  out = sostituisci(out, 'email', (c.email ?? '').trim());
  out = sostituisci(out, 'telefono', (c.telefono ?? '').trim());
  out = sostituisci(out, 'zona', (c.zona ?? '').trim());
  if (manuali) for (const [chiave, valore] of Object.entries(manuali)) out = sostituisci(out, chiave, valore);
  return out;
}

// ── Utilità HTML (il corpo degli Script è HTML) ────────────────────────────────

/** True se il testo contiene già markup HTML (per distinguere i vecchi testi piani). */
export function sembraHtml(s: string | null | undefined): boolean {
  return /<[a-z][\s\S]*>/i.test(s ?? '');
}

/** Testo piano → HTML minimale (a capo → <br>), per i modelli vecchi. */
export function htmlDaTesto(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/** HTML → testo piano leggibile (per anteprime di lista e fallback email). */
export function testoSemplice(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
