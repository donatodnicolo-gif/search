// Le regole del correttore di bozze, senza AI e senza database.
//
// ⚠️⚠️ **Qui dentro non si parla né col modello né col database.** Questo file
// lo importa anche l'Inbox, che è un componente client: un `import OpenAI` o un
// `import { db }` trascinerebbe mezzo server nel bundle del browser. Le
// chiamate stanno in `src/lib/correttore.ts`.
//
// ⚠️⚠️ **È QUI che si decide.** L'AI propone un elenco di refusi; queste
// funzioni tengono solo quelli che reggono a un controllo in codice — la parola
// sbagliata deve **esistere davvero nel testo**, come parola intera. Senza
// questo filtro un modello che «migliora» la frase riscriverebbe un nome
// proprio o un indirizzo, e nessuno se ne accorgerebbe. È la stessa regola
// dell'IBAN letto da una foto: l'AI legge, il checksum decide.

export type Refuso = { sbagliato: string; giusto: string }

/** Quante proposte, oltre le quali non è più un refuso ma un fraintendimento. */
const TROPPI = 5

/**
 * Una parola c'è davvero nel testo, come parola intera?
 *
 * ⚠️ Non basta `\b` di un'espressione regolare: sull'italiano accentato si
 * comporta male, e le proposte possono contenere uno spazio («tutta via»). Si
 * guarda a mano che ai due bordi non ci sia una lettera.
 */
export function compareNelTesto(testo: string, parola: string): boolean {
  if (!parola) return false
  const i = testo.toLowerCase().indexOf(parola.toLowerCase())
  if (i < 0) return false
  return !attaccataAUnaLettera(testo, i, parola.length)
}

function attaccataAUnaLettera(testo: string, da: number, lunghezza: number): boolean {
  const lettera = /\p{L}/u
  const prima = da > 0 ? testo[da - 1] : ''
  const dopo = da + lunghezza < testo.length ? testo[da + lunghezza] : ''
  return lettera.test(prima) || lettera.test(dopo)
}

/**
 * Tiene solo le proposte che reggono.
 *
 * Passa una proposta se: la parola sbagliata è nel testo come parola intera, la
 * correzione è diversa, e nessuna delle due contiene cifre. Tutto il resto si
 * scarta **in silenzio** — meglio un refuso che passa che una correzione
 * inventata sul cognome di un cliente.
 */
export function filtra(testo: string, proposte: Refuso[]): Refuso[] {
  const viste = new Set<string>()
  const buone: Refuso[] = []
  for (const p of proposte ?? []) {
    const sbagliato = (p?.sbagliato ?? '').trim()
    const giusto = (p?.giusto ?? '').trim()
    if (!sbagliato || !giusto) continue
    if (sbagliato.toLowerCase() === giusto.toLowerCase()) continue
    // ⚠️ Mai sulle cifre: «21018» non è un refuso, è un CAP.
    if (/\d/.test(sbagliato) || /\d/.test(giusto)) continue
    // Il segnaposto delle parti mascherate non deve tornare indietro.
    if (sbagliato.includes('·') || giusto.includes('·')) continue
    if (!compareNelTesto(testo, sbagliato)) continue
    const chiave = sbagliato.toLowerCase()
    if (viste.has(chiave)) continue
    viste.add(chiave)
    buone.push({ sbagliato, giusto })
  }
  // ⚠️ Più di cinque non è un messaggio con dei refusi: è un testo che il
  // modello non ha capito (un'altra lingua, un elenco di codici). In quel caso
  // non si dice niente e si manda: cinque bandierine rosse insegnano a premere
  // «Manda così» senza leggere, e da lì il correttore è spento anche se acceso.
  return buone.length > TROPPI ? [] : buone
}

/**
 * Applica le correzioni scelte.
 *
 * ⚠️ **Solo la prima occorrenza** di ciascuna, e solo come parola intera: se
 * una parola è scritta due volte e una sola è sbagliata, correggerle entrambe
 * rompe la frase giusta.
 * ⚠️ La maiuscola iniziale si conserva: «Mornign» → «Morning», non «morning».
 */
export function applica(testo: string, refusi: Refuso[]): string {
  let out = testo
  for (const r of refusi ?? []) {
    const i = out.toLowerCase().indexOf(r.sbagliato.toLowerCase())
    if (i < 0) continue
    if (attaccataAUnaLettera(out, i, r.sbagliato.length)) continue
    const originale = out.slice(i, i + r.sbagliato.length)
    const iniziale = originale[0] ?? ''
    const maiuscola = iniziale === iniziale.toUpperCase() && iniziale !== iniziale.toLowerCase()
    const giusto = maiuscola ? r.giusto[0].toUpperCase() + r.giusto.slice(1) : r.giusto
    out = out.slice(0, i) + giusto + out.slice(i + r.sbagliato.length)
  }
  return out
}

/**
 * Le parti di testo che il correttore non deve vedere: quello che non vede non
 * può correggere.
 *
 * ⚠️ Link, email, numeri d'ordine, telefoni e IBAN sono la fonte principale dei
 * falsi allarmi — e un falso allarme di troppo insegna a mandare senza leggere.
 */
const DA_NON_TOCCARE: RegExp[] = [
  /https?:\/\/\S+/g,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
  /#\d{3,7}\b/g,
  // ⚠️ Il `+` del prefisso internazionale sta FUORI da qualsiasi confine di
  // parola: con `\b` davanti non veniva mangiato, e nel testo mascherato
  // restava un «+·» — un carattere orfano che il modello poteva prendere per
  // un refuso.
  /\+?\d[\d\s./-]{5,}\d/g,
  /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
]

/** Sostituisce le parti intoccabili con un segnaposto neutro. */
export function maschera(testo: string): string {
  let out = testo
  for (const r of DA_NON_TOCCARE) out = out.replace(r, '·')
  return out
}
