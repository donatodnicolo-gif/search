// Le lingue che l'utente legge (e quindi scrive) senza bisogno di traduzione.
// Una sola regola, usata sia in arrivo (non tradurre la mail) sia in uscita
// (non tradurre la risposta): se cambia qui, cambia dappertutto.

/** Le lingue lette dell'utente, normalizzate (minuscole, senza vuoti). */
export function lingueLetteDi(campo: string | null | undefined): string[] {
  return (campo ?? 'italiano')
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Vero se questa lingua NON va tradotta: è l'italiano, oppure una di quelle che
 * l'utente ha spuntato in Impostazioni. Confronto tollerante a maiuscole/spazi
 * e a forme come "inglese (britannico)".
 */
export function leggiSenzaTraduzione(lingua: string | null | undefined, lingueLette: string[]): boolean {
  const l = (lingua ?? '').trim().toLowerCase()
  if (!l || l === 'italiano') return true
  return lingueLette.some((letta) => l.includes(letta) || letta.includes(l))
}
