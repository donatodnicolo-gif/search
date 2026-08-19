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
 * I passi che si scelgono a mano, in ordine di lavorazione — **`gestito`
 * compreso**, come ultimo.
 *
 * ⚠️ Prima era un bottone a parte in mezzo alle azioni: ma «Gestito» non è una
 * cosa da fare all'ordine (come «Rimborso» o «WhatsApp»), è il punto in cui
 * l'ordine è arrivato — l'ultimo. Stando fra le azioni, la fila raccontava una
 * lavorazione che non finiva mai, e la fine si cercava altrove.
 *
 * ⚠️ Cliccarlo fa **sparire l'ordine** dalla lista di lavoro (il filtro parte da
 * «non gestiti»): è l'unico passo con questa conseguenza, ed è scritto nel suo
 * titolo. Per riaprirlo basta ricliccare «Da iniziare».
 *
 * Fuori resta solo `comunicazione`: quello lo scrive l'app da sé quando si
 * scrive al cliente, non lo sceglie nessuno.
 */
export const PASSI = [
  'da_gestire',
  'ricerca_fornitore',
  'in_pagamento',
  'attesa_consegna',
  'gestito',
] as const

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
