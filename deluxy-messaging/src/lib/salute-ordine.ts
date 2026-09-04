import { ordineDaOrders } from './orders'

// LA SALUTE DELL'ORDINE, CHIESTA A ORDERS — e il cancello che ne discende.
//
// ⚠️⚠️ Regola dell'utente (04/09/2026): «importa lo stato di Orders; se lo
// stato non è conforme l'ordine non può essere mandato avanti».
//
// ⚠️⚠️ LA SALUTE NON SI RICALCOLA QUI E NON SI COPIA IN TABELLA. La calcola
// Orders (`salute.ts` di là) da annullamento, motivo, pagamento e rischio, e di
// là **non è una colonna**: si ricava dai campi veri ogni volta, quindi cambia
// da sola nel momento in cui l'ordine viene annullato o rimborsato. Una copia
// in questa app sarebbe vecchia proprio quando conta — un ordine annullato
// stamattina resterebbe «conforme» qui fino al prossimo giro di sync, ed è
// esattamente il giro in cui qualcuno lo manderebbe a un fioraio. Quindi si
// chiede, e si chiede nel momento della decisione.
//
// ⚠️ Rifarne la formula sarebbe la stessa regola scritta in due posti: il
// giorno che di là la cambiano, qui resta quella vecchia e nessuna delle due
// schermate dà errore. Direbbero solo due cose diverse sullo stesso ordine.

export {
  SALUTI,
  nomeSalute,
  percheSalute,
  mandaAvanti,
} from './salute-regole'
export type { Salute } from './salute-regole'

import { percheSalute, type Salute } from './salute-regole'

/**
 * L'esito della domanda a Orders.
 *
 * ⚠️⚠️ TRE CASI, NON DUE, e vanno tenuti distinti a vista: «conforme»,
 * «non conforme, ed ecco quale», e **«non lo so»**. Schiacciare il terzo su uno
 * dei due è il difetto: se «non lo so» valesse «no», Orders giù fermerebbe
 * tutto il lavoro dell'azienda; se sparisse dentro un «sì» silenzioso, la
 * regola si aggirerebbe staccando la spina. Vale «sì, ma detto», e a schermo si
 * legge che non si è potuto chiedere.
 */
export type EsitoSalute =
  | { stato: 'ok'; salute: Salute | string; conforme: boolean; perche: string }
  | { stato: 'sconosciuta'; perche: string }

/**
 * La salute di un ordine, chiesta a Orders adesso.
 *
 * `numero` è il numero dell'ordine (#2867 o 2867), `shopifyId` aiuta a
 * riconoscerlo quando lo stesso numero esiste su più negozi.
 */
export async function saluteDaOrders(numero: string, shopifyId = ''): Promise<EsitoSalute> {
  // ⚠️⚠️ `true` = «anche gli annullati». Senza, gli ordini che questa regola
  // deve fermare per primi sono proprio quelli che Orders non restituisce:
  // tornavano «non è nel registro» → «non lo so» → passavano. Misurato su
  // #12858 il 04/09/2026.
  const esito = await ordineDaOrders(numero, shopifyId, true).catch(() => null)
  if (!esito) return { stato: 'sconosciuta', perche: "L'app Ordini non risponde." }
  if (esito.stato === 'non-configurato') {
    return { stato: 'sconosciuta', perche: 'App Ordini non collegata (Impostazioni).' }
  }
  if (esito.stato === 'errore') return { stato: 'sconosciuta', perche: esito.messaggio }

  const v = (esito.ordine.salute ?? '').trim()
  if (!v) {
    // ⚠️ Vuoto non è «conforme»: è una versione di Orders che questo campo non
    // lo manda ancora, o un ordine che di là non c'è. Dirlo, non dedurlo.
    return { stato: 'sconosciuta', perche: "L'app Ordini non ha risposto con la salute." }
  }
  return {
    stato: 'ok',
    salute: v,
    conforme: v === 'conforme',
    perche: percheSalute(v),
  }
}
