// Piccole regole sul testo, pure (le usano anche i componenti client).

/**
 * «MODENA» → «Modena», «CASTELNUOVO RANGONE» → «Castelnuovo Rangone»,
 * «sant'agnello» → «Sant'Agnello».
 *
 * ⚠️ Utente, 06/09/2026: nella tendina delle città uscivano «FIRENZE» e
 * «Firenze» come due voci, e in un ordine che non era alfabetico (le maiuscole
 * vengono prima nel confronto grezzo). Il registro Anagrafiche tiene le città
 * come sono state scritte; qui si uniforma solo quello che si MOSTRA e si
 * raggruppa — il valore originale resta, perché il filtro del registro
 * distingue le maiuscole («MODENA» trova 2, «Modena» 0).
 */
export function primaMaiuscola(testo: string | null | undefined): string {
  const t = (testo ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t
    .toLowerCase()
    .replace(/(^|[\s'’\-\/(])(\p{L})/gu, (_m, prima: string, lettera: string) => prima + lettera.toUpperCase())
}

/** Confronto alfabetico italiano, senza distinguere maiuscole e accenti. */
export function confrontaTesto(a: string, b: string): number {
  return a.localeCompare(b, 'it', { sensitivity: 'base' })
}
