'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Il "primo carico": quante mail ricevute e quante inviate l'app si porta in
// pancia da sola, in background, quando una casella è appena collegata.
const TARGET = 500

/**
 * Al primo accesso (casella nuova o quasi vuota) scarica in background le
 * ultime 500 ricevute e 500 inviate, un blocco alla volta, senza bloccare
 * l'app. Raggiunto il target — o esaurita la casella — si ferma DA SOLO e le
 * aperture successive costano una sola chiamata leggera (il server risponde
 * subito "finito" contando le mail già presenti, senza toccare l'IMAP).
 * Il resto dello storico resta on-demand (fondo lista / ricerca sul server).
 */
export function PrimoCarico() {
  const router = useRouter()
  const inCorso = useRef(false)
  // Refresh diluiti: ri-renderizzare tutto a ogni blocco consuma CPU inutilmente.
  const ultimoRefresh = useRef(0)

  useEffect(() => {
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
        // ~500+500 a blocchi di 80 = una quindicina di giri per casella: il
        // tetto a 60 copre anche più caselle. Si esce prima con "finito".
        for (let giro = 0; giro < 60 && vivo; giro++) {
          if (document.visibilityState !== 'visible') break
          const res = await fetch('/api/scarica-storico', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: TARGET }),
          })
          if (!res.ok) break // sessione scaduta o errore: si riprova alla prossima apertura
          const esito = (await res.json().catch(() => ({}))) as { scaricati?: number; finito?: boolean }
          if (esito.scaricati && esito.scaricati > 0) {
            scaricatiTotali += esito.scaricati
            refreshOgniTanto()
          }
          if (esito.finito || !esito.scaricati) break // target raggiunto o niente da prendere
          // Un respiro fra un blocco e l'altro: non si stressa IMAP/DB/CPU.
          await new Promise((r) => setTimeout(r, 3000))
        }
      } finally {
        if (vivo && scaricatiTotali > 0) refreshOgniTanto(true)
        inCorso.current = false
      }
    }

    // Parte dopo il drain della posta NUOVA (SyncButton, all'apertura): serve
    // anche il primo cursore della INBOX prima di poter scendere nello storico.
    const t = setTimeout(drena, 12_000)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [router])

  return null
}
