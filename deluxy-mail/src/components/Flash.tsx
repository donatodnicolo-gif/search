'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const CHIAVE = 'aimail:flash'

/** Da chiamare PRIMA di navigare: l'avviso comparirà sulla pagina d'arrivo. */
export function mettiFlash(messaggio: string) {
  try {
    sessionStorage.setItem(CHIAVE, messaggio)
  } catch {
    /* niente sessionStorage (privato?): si perde l'avviso, non è grave */
  }
}

/** Da chiamare per un avviso SENZA cambiare pagina. */
export function mostraFlash(messaggio: string) {
  window.dispatchEvent(new CustomEvent(CHIAVE, { detail: messaggio }))
}

/**
 * L'avviso "verde" in alto (es. «✓ Messaggio inviato»): compare per qualche
 * secondo dopo un'azione andata a buon fine, anche se nel frattempo si è
 * cambiata pagina. Montato una volta nel layout.
 */
export function Flash() {
  const [msg, setMsg] = useState<string | null>(null)
  const path = usePathname()

  // Al montaggio e a ogni cambio pagina: se qualcuno ha lasciato un avviso, lo
  // mostro e lo consumo.
  useEffect(() => {
    let salvato: string | null = null
    try {
      salvato = sessionStorage.getItem(CHIAVE)
      if (salvato) sessionStorage.removeItem(CHIAVE)
    } catch {
      salvato = null
    }
    if (salvato) setMsg(salvato)
  }, [path])

  // Avvisi "al volo" (senza navigazione).
  useEffect(() => {
    const su = (e: Event) => setMsg((e as CustomEvent).detail as string)
    window.addEventListener(CHIAVE, su)
    return () => window.removeEventListener(CHIAVE, su)
  }, [])

  // Sparisce da solo dopo 4 secondi.
  useEffect(() => {
    if (!msg) return
    const id = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(id)
  }, [msg])

  if (!msg) return null

  return (
    <div className="flash" role="status" onClick={() => setMsg(null)}>
      <span className="flash-icona">✓</span>
      <span>{msg}</span>
    </div>
  )
}
