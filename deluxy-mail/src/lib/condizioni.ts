// Le condizioni delle regole (mittente/oggetto/testo) accettano PIÙ alternative
// separate da virgola: la condizione è soddisfatta se il testo ne contiene
// almeno una. Es. oggetto = "[DELUXY], [DELUXYFLOWERS]" scatta su entrambe.
//
// Fra condizioni diverse vale la E (tutte quelle valorizzate devono valere);
// dentro la SINGOLA condizione vale la O. Una condizione vuota non filtra.

/** Spezza una condizione nelle sue alternative (virgola = «oppure»). */
export function alternative(condizione: string | null | undefined): string[] {
  if (!condizione) return []
  return condizione
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Vero se il testo soddisfa la condizione: nessuna alternativa (condizione
 * vuota) = non filtra; altrimenti basta che UNA sia contenuta (case-insensitive).
 */
export function condizioneSoddisfatta(testo: string, condizione: string | null | undefined): boolean {
  const alt = alternative(condizione)
  if (alt.length === 0) return true
  const t = testo.toLowerCase()
  return alt.some((a) => t.includes(a.toLowerCase()))
}
