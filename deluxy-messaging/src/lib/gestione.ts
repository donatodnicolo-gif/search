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
  // ⚠️⚠️ «IN APP» dice che di quell'ordine si occupa la **piattaforma
  // consegne** (app.deluxy.it). Lo scrive la sincronizzazione quando la
  // piattaforma propone l'ordine a un partner da sola, **e** una persona
  // quando lo manda di là dal modulo «Manda in app» (31/08/2026).
  // Dal 31/08 è l'ultimo dei `PASSI`, prima di «Gestito».
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
 * Fuori resta `comunicazione` — lo scrive l'app da sé quando si scrive al
 * cliente, e non è un punto della lavorazione ma una cosa che è successa.
 *
 * ⚠️ `in_app` invece è ENTRATO nella fila il 31/08/2026 (chiesto dall'utente):
 * è l'ultimo passo prima di «Gestito», perché da lì la consegna la fa la
 * piattaforma. Lo scrivono tutti e due — la sincronizzazione quando l'app
 * propone l'ordine da sola, e la persona che lo manda di là dalla scheda.
 */
export const PASSI = [
  'da_gestire',
  'ricerca_fornitore',
  'in_pagamento',
  'attesa_consegna',
  // ⚠️⚠️ «IN APP» È ENTRATO FRA I PASSI il 31/08/2026, chiesto dall'utente: «un
  // nuovo stato prima di Gestito che indichi che l'ordine è stato spostato in
  // app». Prima stava fuori perché lo scriveva solo la sincronizzazione; adesso
  // lo può scegliere anche una persona, ed è l'ULTIMO passo prima della fine —
  // da lì l'ordine non torna indietro da solo, lo consegna la piattaforma.
  //
  // ⚠️⚠️ SCEGLIERLO DALLA FILA NON CREA LA CONSEGNA DI LÀ: la crea il modulo
  // «Manda in app» sulla scheda (`manda-in-app.ts`), che è dove sta il vero
  // passaggio. Il passo scrive solo dove siamo. La differenza conta — segnare
  // «In App» a mano su un ordine che di là non è mai arrivato ferma il nostro
  // lavoro su una consegna che non esiste: per questo il riquadro sulla scheda
  // dice sempre SE la consegna c'è (numero e stato) o se c'è solo l'etichetta.
  'in_app',
] as const

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
