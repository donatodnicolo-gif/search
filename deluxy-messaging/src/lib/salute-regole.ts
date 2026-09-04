// LE REGOLE DELLA SALUTE, SENZA DATABASE E SENZA RETE.
//
// ⚠️⚠️ Questo file NON importa niente. Lo usa anche `DettaglioOrdine.tsx`,
// che e' un componente CLIENT: importando `salute-ordine.ts` — che parla con
// Orders, quindi con la configurazione cifrata — la build fallisce con
// «Reading from "node:crypto" is not handled by plugins». E' la stessa regola
// scritta in `fornitore-ordine.ts`, `turni.ts`, `refusi.ts` e `glossario.ts`,
// ed e' gia' costata quattro volte: le regole stanno qui, le chiamate di la'.

/** I cinque valori che Orders può dare. Uno solo per ordine. */
export const SALUTI = ['conforme', 'a_rischio', 'non_pagato', 'cancellato', 'nullo'] as const
export type Salute = (typeof SALUTI)[number]

/** Come si scrive a schermo. */
const NOMI: Record<string, string> = {
  conforme: 'conforme',
  a_rischio: 'a rischio',
  non_pagato: 'non pagato',
  cancellato: 'cancellato',
  nullo: 'nullo',
}

/** Perché quella salute ferma il lavoro: la frase che legge chi sta lavorando. */
const PERCHE: Record<string, string> = {
  a_rischio: 'Shopify segnala un rischio di frode da guardare a mano.',
  non_pagato: 'Il denaro non è (ancora) arrivato.',
  cancellato: 'È stato annullato o rimborsato per una decisione nostra.',
  nullo: 'È stato annullato o rimborsato su richiesta del cliente.',
}

export function nomeSalute(v: string): string {
  return NOMI[v] ?? v
}

export function percheSalute(v: string): string {
  return PERCHE[v] ?? ''
}


/**
 * QUESTO PASSO MANDA AVANTI L'ORDINE?
 *
 * ⚠️⚠️ «Non può essere mandato avanti» non vuol dire «non si può toccare».
 * Un ordine annullato dal cliente **deve** poter essere chiuso, e un ordine
 * finito nel posto sbagliato deve poter tornare indietro: bloccare anche quelli
 * lascerebbe righe che non si possono né lavorare né togliere dalla lista, che
 * è il modo migliore per farsi ignorare la regola.
 *
 * Fermiamo i passi in cui **noi facciamo fare il lavoro**, e solo quelli.
 */
const PASSI_CHE_MANDANO_AVANTI = new Set([
  'ricerca_fornitore',
  'comunicazione',
  'in_pagamento',
  'attesa_consegna',
  'in_app',
])

export function mandaAvanti(gestione: string): boolean {
  return PASSI_CHE_MANDANO_AVANTI.has(gestione)
}
