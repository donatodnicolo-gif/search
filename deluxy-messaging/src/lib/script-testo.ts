// Inserire uno script dentro una mail già cominciata.
//
// IL PROBLEMA CONCRETO: ogni script parte con un saluto («Buongiorno, ci
// scusiamo per l'attesa…») e il corpo della mail è già aperto con il suo
// («Buongiorno Shontelle, le scriviamo riguardo al suo ordine #1731.»).
// Incollando lo script così com'è, il saluto esce DUE volte — ogni volta, non
// per caso. Uno strumento che produce in modo affidabile una bozza sbagliata è
// uno strumento che si smette di usare.
//
// Quindi: se il testo dove si inserisce ha già un saluto, allo script si toglie
// il suo. Niente di più: non si riscrive, non si "migliora", non si traduce.

// I saluti che si riconoscono. Volutamente pochi e in testa alla frase: meglio
// lasciare un doppio saluto che tagliare una parola che serviva.
const SALUTI = [
  'buongiorno',
  'buonasera',
  'buon pomeriggio',
  'salve',
  'ciao',
  'hello',
  'hi',
  'bonjour',
  'buenos días',
  'buenos dias',
  'guten tag',
]

// «Gentile Mario,» / «Gentile Dott. Rossi,»: il nome è variabile, quindi si
// prende fino alla virgola, ma con un tetto — senza, una frase senza virgole
// verrebbe mangiata intera.
const RE_GENTILE = /^(gentile|gentilissim[oa]|caro|cara|dear|estimad[oa])\b[^,\n]{0,40},\s*/i

function reSaluto(): RegExp {
  return new RegExp(`^(${SALUTI.join('|')})\\b[^,\\n]{0,40}?\\s*[,:;!]\\s*`, 'i')
}

/** Il testo comincia con un saluto? */
export function iniziaConSaluto(testo: string): boolean {
  const t = (testo || '').trimStart()
  return reSaluto().test(t) || RE_GENTILE.test(t)
}

/** Lo stesso testo senza il saluto iniziale, con la prima lettera maiuscola. */
export function senzaSaluto(testo: string): string {
  const t = (testo || '').trimStart()
  const senza = t.replace(reSaluto(), '').replace(RE_GENTILE, '')
  if (senza === t) return t
  // Tolto «Buongiorno, » resta «ci scusiamo…»: va maiuscolo, altrimenti la frase
  // comincia con la minuscola e si vede che è un incollaggio.
  return senza.charAt(0).toLocaleUpperCase('it-IT') + senza.slice(1)
}

/**
 * Inserisce lo script nel corpo, alla posizione del cursore.
 *
 * `da`/`a` sono la selezione nel riquadro di testo: se coincidono si inserisce
 * lì, se sono diverse si sostituisce quel pezzo — è il comportamento che ci si
 * aspetta da un campo di testo, e non fa perdere quello che c'era scritto.
 *
 * Torna anche `nuovoCursore`, per rimettere il cursore in fondo a ciò che si è
 * appena inserito invece di rimandarlo all'inizio.
 */
export function inserisciScript(
  corpo: string,
  script: string,
  da: number,
  a: number
): { testo: string; nuovoCursore: number } {
  const prima = corpo.slice(0, da)
  const dopo = corpo.slice(a)

  // Il saluto dello script si toglie solo se ce n'è già uno PRIMA nel corpo.
  const daInserire = iniziaConSaluto(prima) ? senzaSaluto(script) : script.trimStart()

  // C'era del testo SELEZIONATO: si sostituisce quello, in linea. Aggiungere
  // righe vuote spezzerebbe la frase in cui l'operatore stava scrivendo — è
  // un'altra intenzione, e va rispettata.
  if (a > da) {
    const testo = prima + daInserire + dopo
    return { testo, nuovoCursore: (prima + daInserire).length }
  }

  // Punto d'inserimento semplice: lo script è un paragrafo suo. Righe vuote di
  // separazione, ma senza accumularne se uno stacco c'è già.
  const staccoPrima = prima.length === 0 || /\n\s*\n$/.test(prima) ? '' : /\n$/.test(prima) ? '\n' : '\n\n'
  const staccoDopo = dopo.length === 0 || /^\s*\n/.test(dopo) ? '' : '\n'

  const testo = prima + staccoPrima + daInserire + staccoDopo + dopo
  return { testo, nuovoCursore: (prima + staccoPrima + daInserire).length }
}
