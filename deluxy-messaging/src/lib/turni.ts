// I turni degli operatori: chi lavora, quando.
//
// ⚠️⚠️ **Ore e giorni sono testo, non date.** `"09:00"` è un orario da parete e
// `"2026-08-25"` un giorno di calendario: nessuno dei due è un istante. Se
// fossero `DateTime`, a fine ottobre — finita l'ora legale — tutti i turni si
// sposterebbero di un'ora da soli, e il 25 agosto salvato a mezzanotte italiana
// tornerebbe indietro come «24 agosto, 22:00». È la stessa scelta dei periodi
// nella pagina Operatori: il fuso si tocca il meno possibile.
//
// ⚠️⚠️ **Qui dentro non si parla col database.** Questo file lo importa anche
// il componente client (gli serve «chi è di turno adesso», che si calcola con
// l'orologio di chi guarda): un `import { db }` trascinerebbe Prisma nel
// bundle del browser e la build fallirebbe. Le query stanno in
// `src/app/api/turni/route.ts`.

/** 1 = lunedì … 7 = domenica: come le settimane ISO, e come le conta la gente. */
export const GIORNI = [
  { n: 1, nome: 'Lunedì', breve: 'Lun' },
  { n: 2, nome: 'Martedì', breve: 'Mar' },
  { n: 3, nome: 'Mercoledì', breve: 'Mer' },
  { n: 4, nome: 'Giovedì', breve: 'Gio' },
  { n: 5, nome: 'Venerdì', breve: 'Ven' },
  { n: 6, nome: 'Sabato', breve: 'Sab' },
  { n: 7, nome: 'Domenica', breve: 'Dom' },
] as const

export type Turno = {
  id: string
  utenteId: string
  utenteNome: string
  giorno: number
  dalle: string
  alle: string
}

export type Eccezione = {
  id: string
  utenteId: string
  utenteNome: string
  giorno: string
  tipo: 'riposo' | 'orario'
  dalle: string
  alle: string
  motivo: string
  creatoDaNome: string
}

export type EsitoTurni = {
  operatori: { id: string; nome: string; ruolo: string }[]
  turni: Turno[]
  eccezioni: Eccezione[]
}

/**
 * «09:00» sì, «9» no, «25:00» no. Da «00:00» a «23:59» e basta.
 *
 * ⚠️⚠️ **Niente «24:00», nemmeno come fine.** C'era, e sembrava una gentilezza
 * verso chi stacca a mezzanotte. Ma il campo orario del browser
 * (`<input type="time">`) arriva alle **23:59**: un turno salvato con le 24:00
 * tornava a schermo con **la casella di fine vuota** — dato giusto nel
 * database, pagina che sembra rotta, che è il modo peggiore di sbagliare.
 * Chi stacca a mezzanotte scrive **23:59**.
 */
export function oraValida(v: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v)
}

/** Minuti dalla mezzanotte: serve solo a confrontare due orari. */
export function inMinuti(v: string): number {
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}

/** «2026-08-25» e basta: nessuna data inventata, nessun fuso. */
export function giornoValido(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00`)
  // ⚠️ Mezzogiorno e non mezzanotte: con `T00:00:00` un giorno inesistente
  // (31 aprile) scivolerebbe al primo maggio senza dare errore.
  if (Number.isNaN(d.getTime())) return false
  return giornoIso(d) === v
}

export function giornoIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Controlla una fascia oraria. Torna l'errore da mostrare, o stringa vuota.
 *
 * ⚠️ I turni che scavalcano la mezzanotte **non ci sono**: qui si finisce al
 * più tardi alle 23:59. Dirlo con un messaggio chiaro è meglio che accettarli e
 * poi contarli storti — il servizio clienti dei fiori non lavora di notte, e se
 * un giorno servisse è una cosa da progettare, non da far entrare di lato.
 */
export function controllaFascia(dalle: string, alle: string): string {
  if (!oraValida(dalle)) return 'L’ora di inizio va scritta come 09:00.'
  if (!oraValida(alle)) return 'L’ora di fine va scritta come 13:00 (al massimo 23:59).'
  if (inMinuti(alle) <= inMinuti(dalle)) {
    return 'La fine deve venire dopo l’inizio. Un turno che scavalca la mezzanotte va spezzato in due.'
  }
  return ''
}

/**
 * Chi lavora in un certo giorno, tenendo conto delle eccezioni.
 *
 * ⚠️ **L'eccezione vince sempre sulla settimana**, ed è tutto il motivo per cui
 * esiste: se il 25 agosto Federica è in ferie, il suo lunedì abituale quel
 * giorno non c'è. Un `riposo` cancella tutte le sue fasce di quel giorno; un
 * `orario` le sostituisce.
 */
export function turniDelGiorno(
  esito: EsitoTurni,
  giornoIsoData: string,
  giornoSettimana: number
): { utenteId: string; nome: string; dalle: string; alle: string; motivo: string }[] {
  const eccezioniOggi = esito.eccezioni.filter((e) => e.giorno === giornoIsoData)
  const conEccezione = new Set(eccezioniOggi.map((e) => e.utenteId))

  const dalleSettimane = esito.turni
    .filter((t) => t.giorno === giornoSettimana && !conEccezione.has(t.utenteId))
    .map((t) => ({
      utenteId: t.utenteId,
      nome: t.utenteNome,
      dalle: t.dalle,
      alle: t.alle,
      motivo: '',
    }))

  const dalleEccezioni = eccezioniOggi
    .filter((e) => e.tipo === 'orario')
    .map((e) => ({
      utenteId: e.utenteId,
      nome: e.utenteNome,
      dalle: e.dalle,
      alle: e.alle,
      motivo: e.motivo,
    }))

  return [...dalleSettimane, ...dalleEccezioni].sort(
    (a, b) => inMinuti(a.dalle) - inMinuti(b.dalle) || a.nome.localeCompare(b.nome)
  )
}
