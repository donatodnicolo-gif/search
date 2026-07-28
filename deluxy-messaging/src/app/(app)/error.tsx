'use client'

import { useEffect } from 'react'

// La rete di sicurezza delle schermate dell'app.
//
// ⚠️ PERCHÉ ESISTE. Senza, un errore in un componente fa smontare a React tutto
// l'albero: resta una pagina bianca. Chi la vede la chiama «va in crash», ed è
// la descrizione giusta — ma non contiene nessuna informazione, e da lì si può
// solo tirare a indovinare. Qui l'errore si vede, si può copiare, e la schermata
// si può riprovare senza perdere la sessione.
//
// Il `digest` è la chiave con cui Vercel indicizza l'errore lato server: senza
// quello, cercarlo nei log è impossibile. Va mostrato anche se non dice niente
// a chi legge: serve a chi poi lo cerca.

export default function ErroreApp({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // In console per intero: nella pagina si mostra il messaggio, qui resta lo
    // stack, che è quello che serve davvero per capire dove è successo.
    console.error('Errore nella schermata:', error)
  }, [error])

  return (
    <main>
      <div className="card" style={{ maxWidth: 640 }}>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Questa schermata si è fermata</h1>
        <p className="descrizione">
          Il resto dell&apos;app funziona e la tua sessione è aperta: puoi riprovare, oppure
          spostarti su un&apos;altra pagina dal menu.
        </p>

        <div className="avviso-errore" style={{ wordBreak: 'break-word' }}>
          {error.message || 'Errore senza messaggio.'}
        </div>

        {error.digest ? (
          <p className="cella-sub">
            Codice per ritrovarlo nei log: <code>{error.digest}</code>
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={reset}>
            Riprova
          </button>
          <a className="btn btn-secondario" href="/">
            Torna agli ordini
          </a>
        </div>

        <p className="descrizione" style={{ marginTop: 12, marginBottom: 0 }}>
          Se si ripete, copia il messaggio qui sopra (e il codice, se c&apos;è): dice esattamente
          dove si è fermata, e senza quello si può solo tirare a indovinare.
        </p>
      </div>
    </main>
  )
}
