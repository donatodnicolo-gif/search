'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { traduciMessaggio } from '@/lib/actions'

/**
 * Traduzione automatica NON bloccante: la mail si apre subito con l'originale,
 * poi (a render avvenuto) questo componente chiede la traduzione in background
 * e, quando è pronta, aggiorna la pagina. Gira una volta sola per messaggio:
 * dopo, `lingua` è valorizzata e non viene più montato.
 */
export function TraduzioneAllApertura({ messaggioId }: { messaggioId: string }) {
  const router = useRouter()
  const fatto = useRef(false)

  useEffect(() => {
    if (fatto.current) return
    fatto.current = true
    let vivo = true
    ;(async () => {
      try {
        const r = await traduciMessaggio(messaggioId)
        // Si aggiorna solo se c'è davvero qualcosa di nuovo (lingua rilevata):
        // se la traduzione non è servita o è fallita, niente refresh e niente
        // rischio di ciclo.
        if (vivo && r.lingua !== null) router.refresh()
      } catch {
        /* una traduzione fallita non deve disturbare la lettura */
      }
    })()
    return () => {
      vivo = false
    }
  }, [messaggioId, router])

  return null
}
