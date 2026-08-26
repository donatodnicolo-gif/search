// Come si scrive una data DENTRO una riga di diario.
//
// ⚠️ Le righe vere del quaderno sono queste:
//
//   12562 da fare 16 luglio
//   per 27 agosto , loro per la torta, devono mandare
//   chiamare domani alle 9!
//
// cioè **giorno e mese a parole**, senza anno e senza zeri davanti. Il
// calendario che si apre col «/» deve scrivere così: se scrivesse «27/08/2026»
// la riga smetterebbe di somigliare a quelle che scrivono le persone, e la
// differenza si vede subito.
//
// Sta in una libreria perché è la parte che si può provare da sola, con dei
// casi, senza aprire un browser.

const MESI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
]

/** Lunedì per primo, come si guarda un calendario di lavoro. */
export const GIORNI_CORTI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']

export function nomeMese(m: number): string {
  return MESI[((m % 12) + 12) % 12]
}

/** Mezzanotte di quel giorno: due date si confrontano solo così. */
export function inizioGiorno(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function stessoGiorno(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * La data come la scriverebbe una persona in una riga di diario.
 *
 * ⚠️ L'ANNO SOLO SE NON È QUESTO. «16 luglio» in un quaderno vuol dire quello di
 * quest'anno; scrivere «16 luglio 2026» su ogni riga è rumore che nessuno legge.
 * Ma su una data dell'anno prossimo l'anno **serve**, e ometterlo direbbe una
 * cosa falsa — a gennaio, «27 dicembre» sarebbe letto come fra undici mesi
 * invece che un mese fa.
 */
export function scriviData(giorno: Date, oggi: Date = new Date()): string {
  const base = `${giorno.getDate()} ${nomeMese(giorno.getMonth())}`
  return giorno.getFullYear() === oggi.getFullYear() ? base : `${base} ${giorno.getFullYear()}`
}

/**
 * Le caselle del mese, lunedì per primo, comprese quelle vuote in testa.
 *
 * `null` = casella vuota prima del primo del mese: serve perché il giorno cada
 * nella colonna del suo giorno della settimana. Senza, il calendario è un
 * elenco di numeri e non si legge più «il 27 è un giovedì».
 */
export function caselleDelMese(anno: number, mese: number): (Date | null)[] {
  const primo = new Date(anno, mese, 1)
  // getDay(): 0 = domenica. Con la settimana che comincia di lunedì, la
  // domenica va in fondo (6) e non in testa (0).
  const salta = (primo.getDay() + 6) % 7
  const quanti = new Date(anno, mese + 1, 0).getDate()
  const caselle: (Date | null)[] = Array(salta).fill(null)
  for (let g = 1; g <= quanti; g++) caselle.push(new Date(anno, mese, g))
  return caselle
}

/** Sposta di N giorni senza toccare l'originale. */
export function piuGiorni(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/**
 * DOVE sta la barra appena scritta, se è un comando. `-1` = non lo è.
 *
 * ⚠️⚠️ Dentro una parola la barra è un carattere come un altro — «27/08»,
 * «e/o», «16/20» — e aprire un pannello mentre qualcuno sta scrivendo una data
 * in cifre sarebbe un dispetto. Quindi vale solo **a inizio di parola**: campo
 * vuoto, oppure preceduta da uno spazio.
 *
 * ⚠️⚠️ MA IN QUALUNQUE PUNTO DELLA RIGA, non solo in fondo. Segnalato
 * dall'utente il 26/08/2026 mentre correggeva una nota: «chiamare domani alle
 * 9!» → si seleziona «domani», si scrive «/», e lì la data ci deve andare. La
 * prima versione guardava solo la fine della riga, e correggendo — che è il
 * momento in cui una data si sostituisce — non si apriva mai. In fondo si
 * scrive quando la riga NASCE; in mezzo quando la si CORREGGE, e sono lo stesso
 * gesto.
 *
 * Si confronta prima e dopo per prefisso e suffisso comuni: così vale sia per
 * una barra **inserita** (niente selezionato) sia per una barra scritta **al
 * posto di qualcosa** (una parola selezionata e sostituita) — che è esattamente
 * il caso del racconto qui sopra.
 *
 * ⚠️ Quello che resta fuori: incollare un testo che contiene una barra. Il pezzo
 * nuovo dev'essere **una barra e basta**.
 */
export function posizioneBarraComando(prima: string, dopo: string): number {
  if (!dopo.includes('/')) return -1
  // Il prefisso in comune.
  let i = 0
  while (i < prima.length && i < dopo.length && prima[i] === dopo[i]) i++
  // Il suffisso in comune, senza scavalcare il prefisso.
  let j = 0
  while (
    j < prima.length - i &&
    j < dopo.length - i &&
    prima[prima.length - 1 - j] === dopo[dopo.length - 1 - j]
  )
    j++
  // Quello che è cambiato, dalla parte del testo NUOVO.
  const scritto = dopo.slice(i, dopo.length - j)
  if (scritto !== '/') return -1
  // ⚠️ Il carattere prima è quello del testo nuovo, non del vecchio: sostituendo
  // una parola selezionata, quello vecchio sarebbe la prima lettera della parola
  // sparita.
  const precedente = i === 0 ? '' : dopo[i - 1]
  return precedente === '' || precedente === ' ' ? i : -1
}
