// Ricorrenze degli appuntamenti.
//
// Qui si lavora SOLO con giorni di calendario ("YYYY-MM-DD"), mai con istanti:
// così l'ora legale non sposta niente. È chi crea gli eventi che trasforma
// giorno + ora italiana nell'istante UTC da salvare.
//
// Le occorrenze diventano righe vere nel database (una per data, legate dallo
// stesso serieId): tutto ciò che legge il calendario per intervallo di date
// continua a funzionare senza sapere nulla delle ripetizioni.

export type TipoRicorrenza = 'no' | 'giorni' | 'settimana' | 'mese'
export type ModoMese = 'giorno' | 'ultimo' | 'ultimo-feriale' | 'primo-feriale'

export type Ricorrenza = {
  tipo: TipoRicorrenza
  /** Per 'giorni': ogni quanti giorni. Per 'settimana': ogni quante settimane. */
  ogni: number
  /** Per 'settimana': i giorni scelti (0 = domenica … 6 = sabato). */
  giorni: number[]
  /** Per 'mese': quale giorno del mese. */
  mese: ModoMese
  /** Per mese='giorno': il numero del giorno (1–31). */
  giornoMese: number
  /** Ultimo giorno in cui ripetere (YYYY-MM-DD). Vuoto = 12 mesi. */
  fine: string
}

export const RICORRENZA_VUOTA: Ricorrenza = {
  tipo: 'no',
  ogni: 1,
  giorni: [],
  mese: 'giorno',
  giornoMese: 1,
  fine: '',
}

// Tetto di sicurezza: nessuna serie può generare più di così (una riga per
// occorrenza, e il calendario non deve diventare un generatore infinito).
const MAX_OCCORRENZE = 400

const NOMI_GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

/** "YYYY-MM-DD" → parti numeriche. */
function parti(giorno: string): [number, number, number] {
  const [Y, M, G] = giorno.split('-').map(Number)
  return [Y, M, G]
}

/** Data UTC "pura" (mezzanotte) usata solo per fare i conti sui giorni. */
function aData(giorno: string): Date {
  const [Y, M, G] = parti(giorno)
  return new Date(Date.UTC(Y, M - 1, G))
}

function aGiorno(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function piuGiorni(giorno: string, n: number): string {
  const d = aData(giorno)
  d.setUTCDate(d.getUTCDate() + n)
  return aGiorno(d)
}

/** Il giorno della settimana (0 = domenica) di una data di calendario. */
export function giornoSettimana(giorno: string): number {
  return aData(giorno).getUTCDay()
}

const eFeriale = (giorno: string) => {
  const g = giornoSettimana(giorno)
  return g >= 1 && g <= 5
}

/** L'ultimo giorno del mese di una data (come "YYYY-MM-DD"). */
function ultimoDelMese(anno: number, mese1: number): string {
  const d = new Date(Date.UTC(anno, mese1, 0)) // giorno 0 del mese dopo = ultimo di questo
  return aGiorno(d)
}

/** La data scelta dentro un mese, secondo il modo indicato. null se non esiste
 *  (es. il 31 in un mese di 30 giorni: quel mese si salta). */
function dataNelMese(anno: number, mese1: number, r: Ricorrenza): string | null {
  const ultimo = ultimoDelMese(anno, mese1)
  const quanti = Number(ultimo.slice(8, 10))

  if (r.mese === 'ultimo') return ultimo

  if (r.mese === 'ultimo-feriale') {
    let g = ultimo
    while (!eFeriale(g)) g = piuGiorni(g, -1)
    return g
  }

  if (r.mese === 'primo-feriale') {
    let g = `${anno}-${String(mese1).padStart(2, '0')}-01`
    while (!eFeriale(g)) g = piuGiorni(g, 1)
    return g
  }

  // Giorno preciso del mese: se quel mese non ce l'ha (il 31 a febbraio), si salta.
  const n = Math.min(Math.max(r.giornoMese || 1, 1), 31)
  if (n > quanti) return null
  return `${anno}-${String(mese1).padStart(2, '0')}-${String(n).padStart(2, '0')}`
}

/** Il giorno oltre il quale non si ripete più (default: 12 mesi dall'inizio). */
function finePredefinita(primo: string, r: Ricorrenza): string {
  if (r.fine) return r.fine
  const [Y, M, G] = parti(primo)
  return aGiorno(new Date(Date.UTC(Y + 1, M - 1, G)))
}

/**
 * Tutte le date della serie, a partire dal primo giorno (incluso), in ordine.
 * Con tipo 'no' torna solo il primo giorno.
 */
export function dateRicorrenza(primoGiorno: string, r: Ricorrenza): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(primoGiorno)) return []
  if (r.tipo === 'no') return [primoGiorno]

  const fine = finePredefinita(primoGiorno, r)
  if (fine < primoGiorno) return [primoGiorno]

  const date: string[] = []

  if (r.tipo === 'giorni') {
    const passo = Math.min(Math.max(Math.round(r.ogni || 1), 1), 365)
    let g = primoGiorno
    while (g <= fine && date.length < MAX_OCCORRENZE) {
      date.push(g)
      g = piuGiorni(g, passo)
    }
    return date
  }

  if (r.tipo === 'settimana') {
    // Nessun giorno spuntato: si usa quello del primo appuntamento.
    const scelti = r.giorni.length > 0 ? [...new Set(r.giorni)].sort() : [giornoSettimana(primoGiorno)]
    const settimane = Math.min(Math.max(Math.round(r.ogni || 1), 1), 52)
    // Si parte dalla domenica della settimana del primo giorno, così il salto
    // "ogni N settimane" è regolare qualunque giorno si sia scelto.
    const inizioSettimana = piuGiorni(primoGiorno, -giornoSettimana(primoGiorno))
    let base = inizioSettimana
    while (base <= fine && date.length < MAX_OCCORRENZE) {
      for (const gs of scelti) {
        const g = piuGiorni(base, gs)
        // Mai prima del primo appuntamento, mai dopo la fine.
        if (g >= primoGiorno && g <= fine) date.push(g)
      }
      base = piuGiorni(base, 7 * settimane)
    }
    return [...new Set(date)].sort()
  }

  // Mensile.
  let [anno, mese] = parti(primoGiorno)
  while (date.length < MAX_OCCORRENZE) {
    const g = dataNelMese(anno, mese, r)
    if (g && g >= primoGiorno && g <= fine) date.push(g)
    // Avanti di un mese.
    mese += 1
    if (mese > 12) {
      mese = 1
      anno += 1
    }
    if (`${anno}-${String(mese).padStart(2, '0')}-01` > fine) break
  }
  // Se la regola non ha prodotto niente (es. il primo giorno è dopo la data del
  // mese scelto e la fine è vicina), resta almeno l'appuntamento di partenza.
  return date.length > 0 ? date : [primoGiorno]
}

/** La descrizione leggibile della regola, da mostrare sulla scheda. */
export function descriviRicorrenza(r: Ricorrenza): string {
  if (r.tipo === 'no') return ''
  const finale = r.fine ? ` fino al ${r.fine.split('-').reverse().join('/')}` : ''

  if (r.tipo === 'giorni') {
    const n = Math.max(Math.round(r.ogni || 1), 1)
    return `${n === 1 ? 'Ogni giorno' : `Ogni ${n} giorni`}${finale}`
  }

  if (r.tipo === 'settimana') {
    const scelti = [...new Set(r.giorni)].sort()
    const elenco = scelti.length > 0 ? scelti.map((g) => NOMI_GIORNI[g]).join(', ') : 'lo stesso giorno'
    const n = Math.max(Math.round(r.ogni || 1), 1)
    return `${n === 1 ? 'Ogni settimana' : `Ogni ${n} settimane`} (${elenco})${finale}`
  }

  const comeMese =
    r.mese === 'ultimo'
      ? 'l’ultimo giorno del mese'
      : r.mese === 'ultimo-feriale'
        ? 'l’ultimo giorno feriale del mese'
        : r.mese === 'primo-feriale'
          ? 'il primo giorno feriale del mese'
          : `il giorno ${Math.min(Math.max(r.giornoMese || 1, 1), 31)} del mese`
  return `Ogni mese, ${comeMese}${finale}`
}

/** Legge la ricorrenza dai campi del form (nomi usati da NuovoEvento). */
export function ricorrenzaDaForm(leggi: (campo: string) => string): Ricorrenza {
  const tipo = leggi('ripetiTipo') as TipoRicorrenza
  return {
    tipo: (['no', 'giorni', 'settimana', 'mese'] as const).includes(tipo) ? tipo : 'no',
    ogni: Number(leggi('ripetiOgni') || '1') || 1,
    giorni: (leggi('ripetiGiorni') || '')
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    mese: (['giorno', 'ultimo', 'ultimo-feriale', 'primo-feriale'] as const).includes(
      leggi('ripetiMese') as ModoMese
    )
      ? (leggi('ripetiMese') as ModoMese)
      : 'giorno',
    giornoMese: Number(leggi('ripetiGiornoMese') || '1') || 1,
    fine: /^\d{4}-\d{2}-\d{2}$/.test(leggi('ripetiFine')) ? leggi('ripetiFine') : '',
  }
}
