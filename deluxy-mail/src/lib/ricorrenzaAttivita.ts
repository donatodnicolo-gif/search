/**
 * LE DATE DI UN'ATTIVITÀ CHE SI RIPETE — calcolate qui, non dal modello.
 *
 * ⚠️ Al modello si chiede **ogni quanto** (`ripeti`) e la **prima** scadenza; le
 * date successive le fa il programma. È la regola già pagata in questo progetto:
 * ciò che deve essere vero si applica nel codice, non nel prompt — una lista di
 * date scritta da un modello sbaglia i mesi corti, i cambi d'anno e i giorni che
 * non esistono (31 febbraio).
 */
export type Ripetizione = 'settimanale' | 'mensile' | 'annuale' | ''

/** Quante volte si crea, se l'utente non lo dice. Un anno di lavoro, non di più:
 *  una coda infinita di attività non è un promemoria, è rumore. */
const QUANTE_DEFAULT: Record<Exclude<Ripetizione, ''>, number> = {
  settimanale: 12, // un trimestre
  mensile: 12, // un anno
  annuale: 3,
}

/** Tetto invalicabile: nessuna istruzione può creare più di così. */
const MASSIMO = 24

/**
 * Le scadenze da creare, prima compresa. Con `ripeti` vuoto è una sola.
 * ⚠️ Sul mensile si tiene il GIORNO della prima scadenza: chiedendo «il 15 di
 * ogni mese» tutte cadono il 15. Se un mese è troppo corto (il 31), si prende
 * l'ultimo giorno di quel mese invece di scivolare al mese dopo — «il 31 di ogni
 * mese» a febbraio vuol dire fine febbraio, non il 3 marzo.
 */
export function scadenzeRipetute(prima: Date, ripeti: Ripetizione, quante = 0): Date[] {
  if (!ripeti) return [prima]
  const volte = Math.min(quante > 0 ? quante : QUANTE_DEFAULT[ripeti], MASSIMO)
  const giorno = prima.getDate()
  const date: Date[] = []

  for (let i = 0; i < volte; i++) {
    if (ripeti === 'settimanale') {
      const d = new Date(prima)
      d.setDate(prima.getDate() + i * 7)
      date.push(d)
      continue
    }
    const mesiAvanti = ripeti === 'mensile' ? i : i * 12
    const d = new Date(prima)
    d.setDate(1) // prima si cambia mese, poi si rimette il giorno: senza, il 31 gennaio + 1 mese diventa il 3 marzo
    d.setMonth(prima.getMonth() + mesiAvanti)
    const ultimoDelMese = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(giorno, ultimoDelMese))
    date.push(d)
  }
  return date
}

/** Come si dice a parole, per l'esito mostrato all'utente. */
export function comeSiRipete(ripeti: Ripetizione, quante: number): string {
  if (!ripeti) return ''
  const ogni = ripeti === 'settimanale' ? 'ogni settimana' : ripeti === 'mensile' ? 'ogni mese' : 'ogni anno'
  return `${ogni}, ${quante} volte`
}
