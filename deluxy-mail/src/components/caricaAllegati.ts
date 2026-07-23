'use client'

/**
 * Caricamento degli allegati GRANDI prima dell'invio.
 *
 * Perché: su Vercel il corpo di UNA richiesta non può superare 4,5 MB. Gli
 * allegati viaggiavano dentro la Server Action dell'invio, quindi una mail con
 * file pesanti veniva rifiutata dalla piattaforma prima di arrivare al codice —
 * e a schermo compariva «Application error: a client-side exception…» senza
 * inviare niente. Ora i file grossi si caricano PRIMA, a pezzi da 3 MB, e
 * l'invio porta con sé solo il codice del gruppo.
 */

/** Oltre questa soglia complessiva si passa dal caricamento a pezzi. */
export const SOGLIA_CARICAMENTO = 3 * 1024 * 1024
const PEZZO = 3 * 1024 * 1024

export const pesoTotale = (files: File[]) => files.reduce((n, f) => n + f.size, 0)

/** True se questi allegati non possono viaggiare dentro l'invio. */
export const servonoAPezzi = (files: File[]) => pesoTotale(files) > SOGLIA_CARICAMENTO

/**
 * Carica i file a pezzi e torna il codice del gruppo da mettere nel form
 * (campo `allegatiGruppo`). Lancia un errore col motivo se qualcosa va storto:
 * chi chiama lo mostra e NON invia una mail monca.
 */
export async function caricaAllegatiGrandi(
  files: File[],
  onAvanzamento?: (fatti: number, totali: number) => void
): Promise<string> {
  const gruppo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  // Quanti pezzi in tutto, per la barra di avanzamento.
  const pezziPerFile = files.map((f) => Math.max(1, Math.ceil(f.size / PEZZO)))
  const totali = pezziPerFile.reduce((a, b) => a + b, 0)
  let fatti = 0

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    for (let parte = 0; parte < pezziPerFile[i]; parte++) {
      const pezzo = f.slice(parte * PEZZO, (parte + 1) * PEZZO)
      const form = new FormData()
      form.set('gruppo', gruppo)
      form.set('file', String(i))
      form.set('parte', String(parte))
      form.set('nome', f.name)
      form.set('tipo', f.type || '')
      form.set('pezzo', pezzo)

      const res = await fetch('/api/allegato-carica', { method: 'POST', body: form })
      if (!res.ok) {
        const dettaglio = await res.json().catch(() => null)
        throw new Error(
          (dettaglio as { messaggio?: string } | null)?.messaggio ||
            `Caricamento di «${f.name}» non riuscito.`
        )
      }
      fatti++
      onAvanzamento?.(fatti, totali)
    }
  }

  return gruppo
}
