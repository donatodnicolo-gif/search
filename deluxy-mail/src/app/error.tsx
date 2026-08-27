'use client'

import { useEffect } from 'react'

/**
 * Cosa si vede quando una schermata NON arriva.
 *
 * ⚠️ Prima non c'era: un'eccezione in un server component — il database che non
 * risponde, l'AI che va in timeout, il server IMAP che cade — portava alla
 * pagina d'errore incorporata di Next, senza sidebar, senza il nome dell'app e
 * senza una via d'uscita che non fosse il tasto «indietro» del browser.
 *
 * ⚠️ Due uscite, non una: «Riprova» (che rifà solo questa schermata, senza
 * ricaricare tutto) e «Torna in posta», perché se è la schermata stessa a essere
 * rotta riprovare non serve e si resta in trappola.
 */
export default function Errore({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Nel registro del server resta la traccia: un guasto che nessuno vede è un
    // guasto che nessuno aggiusta.
    console.error('[schermata]', error.message, error.digest ?? '')
  }, [error])

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="empty">
        <div className="empty-icon" aria-hidden>
          ⚠
        </div>
        <div className="empty-title">Questa schermata non si è aperta</div>
        <p className="empty-text">
          Non è colpa di quello che hai premuto: qualcosa qui sotto non ha risposto. I tuoi dati
          non sono stati toccati.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" className="btn primary small" onClick={reset}>
            Riprova
          </button>
          <a href="/" className="btn secondary small">
            Torna in posta
          </a>
        </div>
        {error.digest && (
          <p className="empty-text" style={{ marginTop: 12, fontSize: 12 }}>
            Codice del guasto: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  )
}
