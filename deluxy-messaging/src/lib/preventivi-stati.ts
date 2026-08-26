// Gli stati di un preventivo e come si chiamano a schermo.
//
// ⚠️⚠️ FILE A PARTE, e non è pignoleria: `preventivi.ts` importa
// `nuovo-ordine.ts` per creare la bozza su Shopify, e quello importa
// `crypto.ts` (`node:crypto`, che nel browser non esiste). Un componente
// client che importi anche solo `nomeStato` da lì si tira dietro tutta la
// catena e **la build fallisce** — con un errore che parla di webpack e di
// «Unhandled scheme node:», cioè che non nomina mai la vera causa.
//
// È già successo il 26/08/2026 con `piattaforma.ts` → `piattaforma-stati.ts`:
// stessa forma, stesso rimedio. Qui dentro deve restare solo roba che gira
// anche nel browser.

export const STATI_PREVENTIVO = [
  'da_fare',
  'inviato',
  'accettato',
  'rifiutato',
  'scaduto',
] as const
export type StatoPreventivo = (typeof STATI_PREVENTIVO)[number]

/** Gli stati ancora APERTI: aspettano qualcosa da noi o dal cliente. */
export const STATI_APERTI: StatoPreventivo[] = ['da_fare', 'inviato']

export function nomeStato(s: string): string {
  switch (s) {
    case 'da_fare':
      return 'Da preparare'
    case 'inviato':
      return 'Inviato, in attesa'
    case 'accettato':
      return 'Accettato'
    case 'rifiutato':
      return 'Rifiutato'
    case 'scaduto':
      return 'Scaduto'
    default:
      return s
  }
}
