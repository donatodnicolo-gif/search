// Raggruppamento dei messaggi in conversazioni (thread).
//
// Due segnali, combinati con union-find:
//  1. la RADICE della catena di risposte (campo `thread` = References[0] o
//     In-Reply-To o Message-ID): lega una conversazione anche se cambia oggetto
//     o destinatari a metà.
//  2. l'OGGETTO NORMALIZZATO (tolti Re:/Fwd:): lega mail che hanno rotto la
//     catena — "stesso oggetto anche con più destinatari".
//
// L'oggetto raggruppa solo se è abbastanza specifico, per non fondere "(senza
// oggetto)" o parole generiche di conversazioni diverse.

/** Toglie i prefissi di risposta/inoltro e normalizza gli spazi. */
export function normalizzaOggetto(oggetto: string): string {
  return oggetto
    .replace(/^((re|r|fwd|fw|i|aw|wg|tr|rif|antw|sv|vs)\s*:\s*)+/i, '')
    .trim()
    .replace(/\s+/g, ' ')
}

// Oggetti troppo vaghi per raggruppare da soli: fonderebbero conversazioni
// diverse. Su questi conta solo la catena di risposte.
const GENERICI = new Set([
  'senza oggetto', '(senza oggetto)', 'info', 'ciao', 'salve', 'buongiorno',
  'buonasera', 'preventivo', 'ordine', 'fattura', 'richiesta', 'informazioni',
  'domanda', 'aggiornamento', 'urgente', 'test', 'ok', 'grazie', 'reminder',
  'promemoria', 'newsletter',
])

export function oggettoSpecifico(oggettoNorm: string): boolean {
  const s = oggettoNorm.trim().toLowerCase()
  return s.length >= 4 && !GENERICI.has(s)
}

export type Raggruppabile = {
  id: string
  thread: string | null // radice della catena (Message-ID del capostipite)
  oggetto: string
  data: Date
  /** Aggancio deciso a mano dall'utente: unisce anche mail senza altri legami. */
  threadManuale?: string | null
}

/**
 * Raggruppa i messaggi in thread. Restituisce un array di gruppi, ognuno
 * ordinato dal più vecchio al più recente, e i gruppi ordinati per messaggio
 * più recente (come una posta in arrivo).
 */
export function raggruppa<T extends Raggruppabile>(messaggi: T[]): T[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x)
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b))
  }

  const primoPerRadice = new Map<string, string>()
  const primoPerOggetto = new Map<string, string>()
  const primoPerManuale = new Map<string, string>()

  for (const m of messaggi) {
    find(m.id)

    // aggancio manuale → stesso thread. È una scelta esplicita dell'utente:
    // vale anche quando non c'è nessun altro legame fra le due mail.
    if (m.threadManuale) {
      const giaM = primoPerManuale.get(m.threadManuale)
      if (giaM) union(m.id, giaM)
      else primoPerManuale.set(m.threadManuale, m.id)
    }

    // stessa radice → stesso thread (la catena di risposte)
    const radice = m.thread || m.id
    const gia = primoPerRadice.get(radice)
    if (gia) union(m.id, gia)
    else primoPerRadice.set(radice, m.id)

    // stesso oggetto specifico → stesso thread (catena rotta)
    const norm = normalizzaOggetto(m.oggetto).toLowerCase()
    if (oggettoSpecifico(norm)) {
      const giaO = primoPerOggetto.get(norm)
      if (giaO) union(m.id, giaO)
      else primoPerOggetto.set(norm, m.id)
    }
  }

  const gruppi = new Map<string, T[]>()
  for (const m of messaggi) {
    const g = find(m.id)
    if (!gruppi.has(g)) gruppi.set(g, [])
    gruppi.get(g)!.push(m)
  }

  const ordinati = [...gruppi.values()]
  for (const g of ordinati) g.sort((a, b) => a.data.getTime() - b.data.getTime())
  ordinati.sort((a, b) => ultima(b) - ultima(a))
  return ordinati
}

function ultima(gruppo: Raggruppabile[]): number {
  return Math.max(...gruppo.map((m) => m.data.getTime()))
}

/** L'identità stabile di un thread per salvarne il riassunto: l'id del
 *  messaggio più vecchio (il capostipite). */
export function chiaveThread(gruppo: { id: string; data: Date }[]): string {
  return [...gruppo].sort((a, b) => a.data.getTime() - b.data.getTime())[0].id
}
