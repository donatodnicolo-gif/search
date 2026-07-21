'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Nei risultati di ricerca: mentre guardi i risultati locali, chiede al server
 * IMAP di cercare ANCHE nella posta mai scaricata. Le mail trovate vengono
 * importate e la lista si aggiorna da sola. Una sola chiamata per ogni testo
 * cercato: niente loop.
 */
export function CercaServer({ q }: { q: string }) {
  const [stato, setStato] = useState<'cerco' | 'trovate' | 'niente' | 'zitto'>('cerco')
  const [quante, setQuante] = useState(0)
  const router = useRouter()
  // Il testo già cercato sul server in questa visita: non si rifà a ogni render.
  const cercato = useRef<string | null>(null)

  useEffect(() => {
    const testo = q.trim()
    if (testo.length < 2 || cercato.current === testo) return
    cercato.current = testo
    let vivo = true
    setStato('cerco')

    ;(async () => {
      try {
        const res = await fetch('/api/cerca-server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: testo }),
        })
        if (!vivo) return
        if (!res.ok) {
          setStato('zitto') // sessione o server: i risultati locali bastano
          return
        }
        const esito = (await res.json().catch(() => ({}))) as { importati?: number }
        if (!vivo) return
        const n = esito.importati ?? 0
        setQuante(n)
        if (n > 0) {
          setStato('trovate')
          router.refresh() // i nuovi risultati entrano nella lista
        } else {
          setStato('niente')
        }
      } catch {
        if (vivo) setStato('zitto')
      }
    })()

    return () => {
      vivo = false
    }
  }, [q, router])

  if (stato === 'zitto') return null

  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '8px 2px 0' }}>
      {stato === 'cerco' && '⏳ Cerco anche sul server (posta non ancora scaricata)…'}
      {stato === 'trovate' && `✓ Trovate ${quante} mail in più sul server: sono state aggiunte ai risultati.`}
      {stato === 'niente' && '✓ Cercato anche sul server: nient’altro.'}
    </div>
  )
}
