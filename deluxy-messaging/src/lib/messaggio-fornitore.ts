// Il messaggio con cui si chiede a un fornitore se può fare un ordine.
//
// ⚠️ È LO STESSO TESTO DELL'APP RICERCA FORNITORI, di proposito: è la frase che
// i fiorai e le pasticcerie della holding ricevono già da mesi da
// `search-deluxy` (MSG_LANG in `deluxy-search-supplier/index.html`), e due
// formulazioni diverse per la stessa richiesta, dalla stessa azienda, allo
// stesso fornitore, sono due mittenti diversi visti da fuori.
//
// Forma italiana:
//   «Buongiorno, per giovedì 20 agosto è possibile Millefoglie x6 da spedire
//    con consegna a Via Valdinievole 26, 50127 Firenze all'ora 12-16?»

export type DatiRichiestaFornitore = {
  /** Il prodotto: il titolo della riga d'ordine. */
  prodotto: string
  /** La variante, se c'è (es. «grande»). */
  variante?: string
  /** Quante ne servono. 1 non si scrive: «x1» suona come un modulo. */
  quantita?: number
  /** Data di consegna in ISO, oppure vuota se non la sappiamo. */
  dataConsegna?: string | null
  /** La fascia oraria chiesta dal cliente, com'è scritta («12-16»). */
  fascia?: string
  /** Dove va consegnato: via, CAP e città. */
  indirizzo: string
}

/** «oggi» / «domani» quando capita, altrimenti «giovedì 20 agosto». */
function quando(iso: string | null | undefined, adesso = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const soloGiorno = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const giorni = Math.round((soloGiorno(d) - soloGiorno(adesso)) / 86400000)
  if (giorni === 0) return 'oggi'
  if (giorni === 1) return 'domani'
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * La richiesta di disponibilità, pronta da mandare.
 *
 * ⚠️ Ogni pezzo che manca **sparisce dalla frase** invece di lasciare un buco o
 * un valore inventato: senza data non si scrive «per », senza ora non si
 * promette un orario che il cliente non ha chiesto. È la stessa regola dell'app
 * di ricerca, ed è il motivo per cui la frase resta leggibile anche sugli
 * ordini con pochi dati.
 */
export function richiestaFornitore(d: DatiRichiestaFornitore, adesso = new Date()): string {
  const data = quando(d.dataConsegna, adesso)
  const prodotto = (d.prodotto || 'questo prodotto').trim()
  const variante = (d.variante || '').trim()
  const qta = d.quantita && d.quantita > 1 ? ` x${d.quantita}` : ''
  const dove = (d.indirizzo || '').trim()
  const ora = (d.fascia || '').trim()
  return (
    'Buongiorno,' +
    (data ? ` per ${data}` : '') +
    ` è possibile ${prodotto}${variante ? ` ${variante}` : ''}${qta}` +
    (dove ? ` da spedire con consegna a ${dove}` : '') +
    (ora ? ` all'ora ${ora}` : '') +
    '?'
  )
}
