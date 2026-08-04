'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * PRECEDENTE / SUCCESSIVA: si scorre la posta senza tornare ogni volta
 * nell'elenco. «Precedente» è la mail SOPRA (più recente), «Successiva» quella
 * SOTTO (più vecchia) — l'elenco è ordinato dalla più nuova.
 *
 * Le due mail le calcola il server (`lib/vicine.ts`) restando nella stessa
 * lista da cui si arriva. Qui dentro c'è solo la navigazione, più le
 * scorciatoie `p` e `n`: stanno QUI e non nelle scorciatoie generali perché
 * solo questa pagina sa quali sono le mail confinanti.
 *
 * Quando non c'è dove andare il tasto resta **visibile e spento**, non sparisce:
 * un comando che compare e scompare si smette di cercare.
 */
export function NavigaMessaggi({
  precedente,
  successivo,
}: {
  precedente: string | null
  successivo: string | null
}) {
  const router = useRouter()

  useEffect(() => {
    const su = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return
      }
      if (e.key === 'p' && precedente) {
        e.preventDefault()
        router.push(`/messaggio/${precedente}`)
      }
      if (e.key === 'n' && successivo) {
        e.preventDefault()
        router.push(`/messaggio/${successivo}`)
      }
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  }, [precedente, successivo, router])

  return (
    <div className="naviga-messaggi">
      {precedente ? (
        <Link href={`/messaggio/${precedente}`} className="btn secondary small" title="La mail più recente di questa (tasto P)">
          ↑ Precedente <kbd className="tasto">P</kbd>
        </Link>
      ) : (
        <span className="btn secondary small disabilitato" aria-disabled title="Questa è la più recente dell’elenco">
          ↑ Precedente
        </span>
      )}
      {successivo ? (
        <Link href={`/messaggio/${successivo}`} className="btn secondary small" title="La mail più vecchia di questa (tasto N)">
          ↓ Successiva <kbd className="tasto">N</kbd>
        </Link>
      ) : (
        <span className="btn secondary small disabilitato" aria-disabled title="Questa è l’ultima dell’elenco">
          ↓ Successiva
        </span>
      )}
    </div>
  )
}
