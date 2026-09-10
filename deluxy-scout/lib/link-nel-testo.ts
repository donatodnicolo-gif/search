// I LINK DENTRO UN TESTO (10/09/2026, segnalazione dell'utente sulla scheda
// del registro: «non si riesce a cliccare sui link»). Parte pura, provata
// con i test: il componente `TestoConLink` la veste.

const URL_RE = /(https?:\/\/[^\s<>"'\])]+)/g;

/** Toglie dal link la punteggiatura che il testo gli attacca in coda («…686.», «…686,»). */
export function pulisciUrl(u: string): { url: string; coda: string } {
  const m = u.match(/^(.*?)([.,;:!?)]+)$/);
  return m ? { url: m[1], coda: m[2] } : { url: u, coda: '' };
}

export type PezzoTesto = { testo: string } | { url: string; coda: string };

/** Spezza il testo in pezzi: testo normale e link (già puliti dalla coda). */
export function spezzaLink(testo: string): PezzoTesto[] {
  return testo
    .split(URL_RE)
    .map((p, i) => (i % 2 === 0 ? { testo: p } : pulisciUrl(p)))
    .filter((p) => !('testo' in p) || p.testo !== '');
}
