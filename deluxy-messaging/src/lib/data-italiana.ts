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
 * Il «/» apre il calendario, ma solo dove è un COMANDO.
 *
 * ⚠️⚠️ Dentro una parola la barra è un carattere come un altro — «27/08»,
 * «e/o», «16/20» — e aprire un pannello mentre qualcuno sta scrivendo una data
 * in cifre sarebbe un dispetto. Quindi si apre solo se la barra è **a inizio di
 * parola**: campo vuoto, oppure preceduta da uno spazio.
 *
 * ⚠️ E solo se è stata appena SCRITTA IN FONDO: incollare un testo che contiene
 * una barra, o correggere in mezzo alla riga, non è un comando.
 */
export function barraEComando(prima: string, dopo: string): boolean {
  if (dopo.length !== prima.length + 1) return false
  if (!dopo.endsWith('/')) return false
  if (dopo.slice(0, -1) !== prima) return false
  const precedente = prima.slice(-1)
  return precedente === '' || precedente === ' '
}
