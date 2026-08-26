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
  // ⚠️⚠️ «IN APP» NON È UN PASSO NOSTRO: dice che di quell'ordine si sta
  // occupando la **piattaforma consegne** (app.deluxy.it), che l'ha proposto a
  // un partner in automatico. Lo scrive la sincronizzazione, non una persona —
  // per questo sta fuori da `PASSI`, come `comunicazione`.
  //
  // ⚠️ Sapere che un ordine è «in app» cambia il lavoro: non si cerca un
  // fornitore a mano, non si chiama nessuno. E quando invece si vuole fare a
  // mano, si INTERROMPE (bottone sulla scheda), altrimenti si lavora in due
  // sullo stesso ordine senza saperlo.
  { chiave: 'in_app', nome: 'In App', colore: '#5856d6' },
  // ⚠️ `comunicazione` NON si toglie anche se non è fra i quattro passi: lo
  // scrive da sola l'app quando scrivi al cliente (WhatsApp, Email, Chiama), e
  // toglierlo dal vocabolario farebbe comparire uno stato senza nome sugli
  // ordini che ce l'hanno già.
  { chiave: 'comunicazione', nome: 'Comunicazione con cliente', colore: '#0071e3' },
  { chiave: 'gestito', nome: 'Gestito', colore: '#248a3d' },
] as const

/**
 * I passi della lavorazione, in ordine. Sono **dove sta** l'ordine adesso.
 *
 * ⚠️⚠️ `gestito` NON è in questa fila, ed è una distinzione da non perdere:
 * gli altri dicono a che punto siamo, `gestito` dice che **abbiamo finito** —
 * l'ordine esce dalla lista di lavoro. È l'unico con una conseguenza, e in una
 * fila di pari sembrerebbe il quinto passo di un percorso invece della fine.
 * Sta accanto alla fila, staccato, con la spunta e il verde: si vede che è
 * un'altra cosa.
 *
 * Fuori restano anche `comunicazione` — lo scrive l'app da sé quando si scrive
 * al cliente — e `in_app`, che lo scrive la sincronizzazione con la piattaforma
 * consegne: nessuno dei due lo sceglie una persona.
 */
export const PASSI = ['da_gestire', 'ricerca_fornitore', 'in_pagamento', 'attesa_consegna'] as const

/** Lo stato che chiude l'ordine: uno solo, e tenuto separato apposta. */
export const CHIUSURA = 'gestito'

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
