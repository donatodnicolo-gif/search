'use client'

import Link from 'next/link'
import { apriFinestraScrivi, finestraDisponibile } from './FinestraScrivi'

/**
 * Rispondi / Rispondi a tutti / Inoltra in alto a destra di ogni riga di posta.
 *
 * Restano link VERI (href alla pagina di scrittura): così il tasto centrale,
 * "apri in una nuova scheda" e il click con Ctrl/Cmd continuano a funzionare.
 * Sul click normale, però, se in pagina c'è la finestra di scrittura (desktop,
 * posta in arrivo) si apre QUELLA e non si cambia pagina.
 *
 * Su desktop mostrano il testo; su mobile solo l'iconcina (vedi globals.css):
 * così le tre azioni ci stanno anche sullo schermo stretto invece di sparire.
 */

const IconaRispondi = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6 3 10l5 4" />
    <path d="M3 10h8a5 5 0 0 1 5 5v1" />
  </svg>
)

const IconaATutti = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6 2 10l4 4" />
    <path d="M11 6 7 10l4 4" />
    <path d="M7 10h6a4 4 0 0 1 4 4v1" />
  </svg>
)

const IconaInoltra = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6l5 4-5 4" />
    <path d="M17 10H9a5 5 0 0 0-5 5v1" />
  </svg>
)

export function RispostaAzioni({ id }: { id: string }) {
  // Click normale (senza Ctrl/Cmd/Shift, tasto sinistro) → finestra, se c'è.
  const apri = (e: React.MouseEvent, modo: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (!finestraDisponibile()) return
    e.preventDefault()
    e.stopPropagation()
    apriFinestraScrivi(id, modo)
  }

  const voci = [
    { modo: 'rispondi', icona: IconaRispondi, testo: 'Rispondi', titolo: 'Rispondi al mittente' },
    { modo: 'tutti', icona: IconaATutti, testo: 'A tutti', titolo: 'Rispondi a tutti i destinatari' },
    { modo: 'inoltra', icona: IconaInoltra, testo: 'Inoltra', titolo: 'Inoltra a qualcun altro' },
  ]

  return (
    <div className="risposta-azioni">
      {voci.map((v) => (
        <Link
          key={v.modo}
          href={`/messaggio/${id}/scrivi?modo=${v.modo}`}
          className="risposta-btn"
          title={v.titolo}
          aria-label={v.testo}
          onClick={(e) => apri(e, v.modo)}
        >
          <span className="risposta-icona" aria-hidden>{v.icona}</span>
          <span className="risposta-testo">{v.testo}</span>
        </Link>
      ))}
    </div>
  )
}
