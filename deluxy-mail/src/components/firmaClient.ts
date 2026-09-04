// La firma che SEGUE la casella, lato client: cambiando il «Da» dalla tendina,
// il blocco firma nel corpo va sostituito con quello della casella nuova.
//
// ⚠️ Si sostituisce SOLO se il blocco si ritrova: se l'utente ha cancellato o
// riscritto la firma, il suo testo non si tocca — meglio una firma vecchia che
// un pezzo di mail sparito.

import { plainAHtml, sembraHtml } from '@/lib/htmlMail'

/**
 * Sostituisce la firma dentro `corpo` con `nuova` (la firma grezza della
 * casella scelta, HTML o testo). Restituisce il corpo nuovo, o `null` se la
 * firma non si è trovata (corpo da lasciare com'è).
 *
 * Due strade:
 * - corpo HTML col blocco marcato `data-firma-casella` (lo mette
 *   `avvolgiFirma` in rispondi.ts): si rimpiazza il CONTENUTO del blocco via
 *   DOM — regge anche se l'editor ha normalizzato l'HTML interno;
 * - corpo testuale senza marcatore: si rimpiazza la vecchia firma per
 *   confronto esatto, se c'è ancora.
 */
export function scambiaFirmaNelCorpo(corpo: string, vecchia: string, nuova: string): string | null {
  if (corpo.includes('data-firma-casella')) {
    const doc = new DOMParser().parseFromString(corpo, 'text/html')
    const blocco = doc.querySelector('[data-firma-casella]')
    if (!blocco) return null
    blocco.innerHTML = nuova ? (sembraHtml(nuova) ? nuova : plainAHtml(nuova)) : ''
    return doc.body.innerHTML
  }
  if (vecchia && corpo.includes(vecchia)) return corpo.replace(vecchia, nuova)
  return null
}
