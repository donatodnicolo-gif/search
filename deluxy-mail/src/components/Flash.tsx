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

/** Il tono dell'avviso: «fatto» (verde, ✓) o «non riuscito» (rosso, ⚠). Un
 *  errore mostrato col segno di spunta direbbe il falso. */
export type TonoFlash = 'ok' | 'errore'

/** Da chiamare per un avviso SENZA cambiare pagina. */
export function mostraFlash(messaggio: string, tono: TonoFlash = 'ok') {
  window.dispatchEvent(new CustomEvent(CHIAVE, { detail: { messaggio, tono } }))
}

/**
 * L'avviso "verde" in alto (es. «✓ Messaggio inviato»): compare per qualche
 * secondo dopo un'azione andata a buon fine, anche se nel frattempo si è
 * cambiata pagina. Montato una volta nel layout.
 */
export function Flash() {
  const [msg, setMsg] = useState<string | null>(null)
  const [tono, setTono] = useState<TonoFlash>('ok')
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
    if (salvato) {
      setMsg(salvato)
      setTono('ok')
    }
  }, [path])

  // Avvisi "al volo" (senza navigazione). Il dettaglio è un oggetto; la forma
  // vecchia (stringa secca) resta valida.
  useEffect(() => {
    const su = (e: Event) => {
      const d = (e as CustomEvent).detail as string | { messaggio: string; tono?: TonoFlash }
      if (typeof d === 'string') {
        setMsg(d)
        setTono('ok')
      } else {
        setMsg(d.messaggio)
        setTono(d.tono ?? 'ok')
      }
    }
    window.addEventListener(CHIAVE, su)
    return () => window.removeEventListener(CHIAVE, su)
  }, [])

  // Sparisce da solo: un errore resta più a lungo, c'è da leggerlo.
  useEffect(() => {
    if (!msg) return
    const id = setTimeout(() => setMsg(null), tono === 'errore' ? 9000 : 4000)
    return () => clearTimeout(id)
  }, [msg, tono])

  if (!msg) return null

  return (
    <div
      className={tono === 'errore' ? 'flash errore' : 'flash'}
      role="status"
      onClick={() => setMsg(null)}
    >
      <span className="flash-icona">{tono === 'errore' ? '⚠' : '✓'}</span>
      <span>{msg}</span>
    </div>
  )
}
