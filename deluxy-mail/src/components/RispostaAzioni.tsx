import Link from 'next/link'

/**
 * Rispondi / Rispondi a tutti / Inoltra in alto a destra di ogni messaggio.
 *
 * Sono link veri, non pulsanti con onClick: portano a una pagina, quindi
 * funzionano anche col tasto centrale o "apri in una nuova scheda". Stanno
 * fuori dal link che apre la mail — un link dentro un altro link non si può.
 */
export function RispostaAzioni({ id }: { id: string }) {
  return (
    <div className="risposta-azioni">
      <Link
        href={`/messaggio/${id}/scrivi?modo=rispondi`}
        className="risposta-btn"
        title="Rispondi al mittente"
      >
        Rispondi
      </Link>
      <Link
        href={`/messaggio/${id}/scrivi?modo=tutti`}
        className="risposta-btn"
        title="Rispondi a tutti i destinatari"
      >
        A tutti
      </Link>
      <Link
        href={`/messaggio/${id}/scrivi?modo=inoltra`}
        className="risposta-btn"
        title="Inoltra a qualcun altro"
      >
        Inoltra
      </Link>
    </div>
  )
}
