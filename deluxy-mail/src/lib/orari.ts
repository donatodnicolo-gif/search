/**
 * Gli orari di un appuntamento: convertire «16:30» in minuti e ritorno, e
 * spostare la FINE quando cambia l'INIZIO conservando la durata.
 *
 * ⚠️ Perché in un file a parte. La regola stava scritta dentro `NuovoEvento`,
 * e `EventoDettaglio` — che è lo stesso modulo, in modifica — non ce l'aveva:
 * cambiando «Dalle» la fine restava ferma e si poteva salvare un appuntamento
 * che finisce prima di cominciare. Segnalato dal custode UX l'11/09/2026 come
 * violazione di «un solo modo per ogni cosa»: stesso campo, tre comportamenti.
 * Una regola scritta due volte diverge sempre, quindi qui si scrive una volta.
 */

/** «16:30» → 990. `null` se non è un orario. */
export function inMinuti(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 990 → «16:30». Resta sempre dentro la giornata. */
export function daMinuti(n: number): string {
  const g = ((n % 1440) + 1440) % 1440
  return `${String(Math.floor(g / 60)).padStart(2, '0')}:${String(g % 60).padStart(2, '0')}`
}

/**
 * La nuova ORA DI FINE quando si sposta l'inizio: **si conserva la durata**.
 * Se la durata attuale non è sensata (fine mancante, o prima dell'inizio) vale
 * un'ora. Torna `null` quando non c'è niente da fare — cioè quando il nuovo
 * inizio non è ancora un orario valido, come succede a metà digitazione.
 */
export function fineConDurata(
  inizioPrima: string,
  finePrima: string,
  inizioDopo: string
): string | null {
  const dopo = inMinuti(inizioDopo)
  if (dopo === null) return null
  const prima = inMinuti(inizioPrima)
  const fine = inMinuti(finePrima)
  const durata = prima !== null && fine !== null && fine > prima ? fine - prima : 60
  return daMinuti(dopo + durata)
}
