// Lo stato di lavorazione di un ordine DA PARTE NOSTRA, distinto dallo stato
// della pipeline di Deluxy Orders (`statoChiave`): quello dice a che punto è
// l'ordine per l'azienda, questo dice cosa abbiamo fatto noi in questa app.
// Lo scarico da Orders non lo sovrascrive mai.

export const GESTIONI = [
  // ⚠️ La chiave resta `da_gestire` anche se a schermo si legge «Da iniziare»:
  // è scritta su 1.274 ordini, nei filtri salvati e nelle query. Rinominarla
  // per cambiare un'etichetta vorrebbe dire migrare i dati per una parola.
  { chiave: 'da_gestire', nome: 'Da iniziare', colore: '#6e6e73' },
  { chiave: 'ricerca_fornitore', nome: 'Ricerca fornitore', colore: '#8944ab' },
  { chiave: 'in_pagamento', nome: 'In pagamento', colore: '#c93400' },
  { chiave: 'attesa_consegna', nome: 'Attesa consegna', colore: '#b8963e' },
  // ⚠️ `comunicazione` NON si toglie anche se non è fra i quattro passi: lo
  // scrive da sola l'app quando scrivi al cliente (WhatsApp, Email, Chiama), e
  // toglierlo dal vocabolario farebbe comparire uno stato senza nome sugli
  // ordini che ce l'hanno già.
  { chiave: 'comunicazione', nome: 'Comunicazione con cliente', colore: '#0071e3' },
  { chiave: 'gestito', nome: 'Gestito', colore: '#248a3d' },
] as const

/**
 * I passi che si scelgono a mano, in ordine di lavorazione.
 *
 * Sono la fila di stati sopra i bottoni: dove sta l'ordine adesso. Fuori
 * restano `comunicazione` (lo mette l'app da sé) e `gestito` (è la fine, e ha
 * il suo bottone: è l'unica azione che fa sparire l'ordine dalla lista).
 */
export const PASSI = ['da_gestire', 'ricerca_fornitore', 'in_pagamento', 'attesa_consegna'] as const

export type ChiaveGestione = (typeof GESTIONI)[number]['chiave']

export function gestioneValida(v: string): v is ChiaveGestione {
  return GESTIONI.some((g) => g.chiave === v)
}

export function nomeGestione(chiave: string): string {
  return GESTIONI.find((g) => g.chiave === chiave)?.nome ?? 'Da gestire'
}

export function coloreGestione(chiave: string): string {
  return GESTIONI.find((g) => g.chiave === chiave)?.colore ?? '#6e6e73'
}
