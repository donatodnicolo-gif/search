'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const CHIAVE = 'aimail:flash'

/** Da chiamare PRIMA di navigare: l'avviso comparirà sulla pagina d'arrivo.
 *  ⚠️ Prende il TONO come `mostraFlash`: prima non poteva riceverlo affatto,
 *  e la lettura forzava 'ok' — così un fallimento che attraversava una
 *  navigazione (es. «Cestina la conversazione», che poi torna in posta) era
 *  verde col ✓ **per costruzione**, non per un argomento dimenticato. */
export function mettiFlash(messaggio: string, tono: TonoFlash = 'ok') {
  try {
    sessionStorage.setItem(CHIAVE, JSON.stringify({ messaggio, tono }))
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
      // La forma nuova è un oggetto {messaggio, tono}; la stringa secca
      // resta valida (un avviso lasciato dalla versione di prima, o da
      // codice che non è ancora passato al tono).
      try {
        const d = JSON.parse(salvato) as { messaggio?: string; tono?: TonoFlash }
        if (d && typeof d.messaggio === 'string') {
          setMsg(d.messaggio)
          setTono(d.tono === 'errore' ? 'errore' : 'ok')
        } else {
          setMsg(salvato)
          setTono('ok')
        }
      } catch {
        setMsg(salvato)
        setTono('ok')
      }
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
