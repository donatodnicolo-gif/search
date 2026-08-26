// Il diario di lavoro: righe brevi legate agli ordini.
//
// Il formato con cui si scrivono davvero è quello del quaderno che c'era prima:
//
//   12562 da fare 16 luglio
//   2506 ital fiori blumen bolzano pagamento su cs, per oggi
//   1700 fanno loro, mandano dati e totale a torta pronta
//
// cioè **numero d'ordine, poi la cosa da fare**. Questa libreria riconosce quel
// numero e lo stacca, così la riga finisce anche sull'ordine giusto — senza
// chiedere a chi scrive di compilare due campi invece di uno.

/** Il numero d'ordine in testa alla riga, se c'è. */
export function numeroInTesta(testo: string): { numero: string; resto: string } {
  const pulito = (testo ?? '').trim()
  // ⚠️ SOLO IN TESTA e solo 3-6 cifre: dentro la frase i numeri sono date,
  // importi e orari («per il 16 luglio», «45 euro», «ore 16»), e prenderli per
  // numeri d'ordine attaccherebbe la nota all'ordine sbagliato — che è peggio
  // che non attaccarla a nessuno.
  const m = /^#?\s?(\d{3,6})\b[\s:.,-]*/.exec(pulito)
  if (!m) return { numero: '', resto: pulito }
  return { numero: '#' + m[1], resto: pulito.slice(m[0].length).trim() }
}

/**
 * Come si scrive un numero d'ordine per confrontarlo.
 *
 * ⚠️ In tabella stanno col cancelletto («#1741»), a mano si scrivono senza: se
 * non si normalizza, la nota c'è ma sull'ordine non compare — e il difetto è
 * invisibile, perché nessuna delle due schermate dà errore.
 */
export function normalizzaNumero(numero: string): string {
  const cifre = (numero ?? '').replace(/\D/g, '')
  return cifre ? '#' + cifre : ''
}

/**
 * Cosa salvare quando si CORREGGE una riga già scritta.
 *
 * ⚠️⚠️ Il numero in testa vale come ordine **solo se la riga un ordine ce
 * l'aveva già** — cioè solo se quel numero l'ha messo lì la schermata di
 * correzione. Su quelle righe, cambiarlo le sposta e toglierlo le stacca.
 *
 * ⚠️⚠️ Sulle righe SENZA ordine il numero in testa resta **testo**. È il caso che
 * questa regola esiste per non rovinare: «100 rose da consegnare» comincia con
 * tre cifre, e trattarle da numero d'ordine farebbe sparire la riga dentro
 * l'ordine #100 **in silenzio**, mentre chi scriveva stava correggendo un refuso
 * più avanti. Quando la riga NASCE quella scommessa si può fare — la si vede
 * subito, ed è il modo in cui si scrive sul quaderno; su una riga già esistente
 * e già letta da altri, no.
 *
 * Fra due sbagli si sceglie quello che si VEDE: chi voleva legarla e non ci
 * riesce se ne accorge subito, perché il numero resta scritto e il badge
 * dell'ordine non compare.
 *
 * @param grezzo quello che c'è nel campo
 * @param avevaUnOrdine se la riga era già legata a un ordine
 * @returns `ordineNumero` assente = non si tocca; `''` = staccala.
 */
export function correggiRiga(
  grezzo: string,
  avevaUnOrdine: boolean
): { testo: string; ordineNumero?: string } {
  const pulito = (grezzo ?? '').trim()
  if (!avevaUnOrdine) return { testo: pulito }
  const { numero, resto } = numeroInTesta(pulito)
  return {
    // ⚠️ `resto || pulito`: se la riga fosse solo il numero, svuotarla
    // cancellerebbe il testo — e una correzione che cancella non è una
    // correzione.
    testo: numero ? resto || pulito : pulito,
    ordineNumero: numero,
  }
}

/** Le forme con cui quel numero può stare scritto in tabella. */
export function formeNumero(numero: string): string[] {
  const cifre = (numero ?? '').replace(/\D/g, '')
  if (!cifre) return []
  return ['#' + cifre, cifre]
}
