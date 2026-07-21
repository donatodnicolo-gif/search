'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Scarico in BACKGROUND di tutta la posta di sempre (lo storico), quando
 * l'utente ha attivato l'impostazione. Chiama `/api/scarica-storico` (una
 * fetch, non una Server Action → non blocca i clic) un blocco alla volta,
 * finché la casella non è completa. Si ferma se lasci la scheda o quando non
 * arriva più niente; riprende alla prossima apertura dell'app.
 *
 * Parte con un piccolo ritardo per lasciare la precedenza allo scarico della
 * posta NUOVA all'apertura (SyncButton): lo storico è a bassa priorità.
 */
export function StoricoAuto({ attivo }: { attivo: boolean }) {
  const router = useRouter()
  const inCorso = useRef(false)
  // Quando abbiamo aggiornato la pagina l'ultima volta: un router.refresh() a
  // OGNI blocco ri-renderizza tutta l'app ogni ~2s e inchioda la CPU. Lo
  // storico è posta vecchia: basta far comparire le novità ogni tanto.
  const ultimoRefresh = useRef(0)

  useEffect(() => {
    if (!attivo) return
    let vivo = true

    const refreshOgniTanto = (forza = false) => {
      const ora = Date.now()
      if (forza || ora - ultimoRefresh.current > 30_000) {
        ultimoRefresh.current = ora
        router.refresh()
      }
    }

    const drena = async () => {
      if (inCorso.current) return
      inCorso.current = true
      let scaricatiTotali = 0
      try {
        // Tetto alto solo come rete di sicurezza: si esce prima per "finito".
        for (let giro = 0; giro < 1000 && vivo; giro++) {
          if (document.visibilityState !== 'visible') break
          const res = await fetch('/api/scarica-storico', { method: 'POST' })
          if (!res.ok) break // sessione scaduta o errore: riprova alla prossima apertura
          const esito = (await res.json().catch(() => ({}))) as { scaricati?: number; finito?: boolean }
          if (esito.scaricati && esito.scaricati > 0) {
            scaricatiTotali += esito.scaricati
            refreshOgniTanto() // al massimo ogni 30s, non a ogni blocco
          }
          if (esito.finito || !esito.scaricati) break // completo o niente da prendere
          // Un respiro fra un blocco e l'altro: lo storico è a bassa priorità e
          // non deve stressare il server IMAP/DB né la CPU del browser.
          await new Promise((r) => setTimeout(r, 3000))
        }
      } finally {
        // Un ultimo aggiornamento a fine giro, così la lista è allineata.
        if (vivo && scaricatiTotali > 0) refreshOgniTanto(true)
        inCorso.current = false
      }
    }

    // Ritardo iniziale: prima la posta nuova, poi lo storico.
    const t = setTimeout(drena, 8000)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [attivo, router])

  return null
}
