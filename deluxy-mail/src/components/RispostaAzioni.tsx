import Link from 'next/link'

/**
 * Rispondi / Rispondi a tutti / Inoltra in alto a destra di ogni riga di posta.
 *
 * Sono link veri, non pulsanti con onClick: portano a una pagina, quindi
 * funzionano anche col tasto centrale o "apri in una nuova scheda". Stanno
 * fuori dal link che apre la mail — un link dentro un altro link non si può.
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
  return (
    <div className="risposta-azioni">
      <Link
        href={`/messaggio/${id}/scrivi?modo=rispondi`}
        className="risposta-btn"
        title="Rispondi al mittente"
        aria-label="Rispondi"
      >
        <span className="risposta-icona" aria-hidden>{IconaRispondi}</span>
        <span className="risposta-testo">Rispondi</span>
      </Link>
      <Link
        href={`/messaggio/${id}/scrivi?modo=tutti`}
        className="risposta-btn"
        title="Rispondi a tutti i destinatari"
        aria-label="Rispondi a tutti"
      >
        <span className="risposta-icona" aria-hidden>{IconaATutti}</span>
        <span className="risposta-testo">A tutti</span>
      </Link>
      <Link
        href={`/messaggio/${id}/scrivi?modo=inoltra`}
        className="risposta-btn"
        title="Inoltra a qualcun altro"
        aria-label="Inoltra"
      >
        <span className="risposta-icona" aria-hidden>{IconaInoltra}</span>
        <span className="risposta-testo">Inoltra</span>
      </Link>
    </div>
  )
}
