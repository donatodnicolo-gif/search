'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { rigeneraFeedCalendario, spegniFeedCalendario } from '@/lib/actions'

/**
 * Il pannello di sincronizzazione: accende il feed iCal e mostra il link
 * segreto da incollare nelle altre agende (Google, Apple, Outlook).
 */
export function FeedCalendario({ token }: { token: string }) {
  const [copiato, setCopiato] = useState(false)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const url = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/calendario?token=${token}`
    : ''

  const rigenera = () =>
    start(async () => {
      await rigeneraFeedCalendario()
      setCopiato(false)
      router.refresh()
    })

  const spegni = () =>
    start(async () => {
      if (!window.confirm('Spegnere il feed? Il link smette di funzionare per tutte le agende che lo usano.')) return
      await spegniFeedCalendario()
      router.refresh()
    })

  if (!token) {
    return (
      <>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Il calendario si sincronizza con le altre agende tramite un <strong>link iCal
          segreto</strong>, in sola lettura: Google Calendar, il calendario dell’iPhone e
          Outlook lo leggono da soli e si aggiornano periodicamente.
        </p>
        <button className="btn primary" type="button" onClick={rigenera} disabled={inCorso}>
          {inCorso ? 'Accendo…' : 'Accendi la sincronizzazione'}
        </button>
      </>
    )
  }

  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Questo è il tuo link segreto (chi lo ha può <strong>vedere</strong> gli appuntamenti,
        non modificarli):
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          style={{ flex: 1, minWidth: 260, fontSize: 12.5 }}
        />
        <button
          className="btn secondary small"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url)
            setCopiato(true)
          }}
        >
          {copiato ? 'Copiato ✓' : 'Copia'}
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 14, lineHeight: 1.7 }}>
        <strong>Google Calendar</strong>: Impostazioni → Aggiungi calendario → <em>Da URL</em> → incolla il link.
        <br />
        <strong>iPhone / Mac</strong>: Impostazioni → Calendario → Account → Aggiungi <em>account calendar sottoscritto</em>.
        <br />
        <strong>Outlook</strong>: Aggiungi calendario → <em>Sottoscrivi dal Web</em>.
        <br />
        Le agende esterne ricontrollano il link ogni qualche ora: le novità non compaiono all’istante.
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn secondary small" type="button" onClick={rigenera} disabled={inCorso}>
          Rigenera link (invalida il vecchio)
        </button>
        <button className="btn secondary small" type="button" onClick={spegni} disabled={inCorso} style={{ color: 'var(--red)' }}>
          Spegni il feed
        </button>
      </div>
    </>
  )
}
