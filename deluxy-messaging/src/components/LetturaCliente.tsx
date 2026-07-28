'use client'

import { useState } from 'react'

// La lettura AI della scheda: due righe su chi è questo cliente, per chi sta
// per rispondergli.
//
// ⚠️ NON SI GENERA DA SOLA all'apertura della pagina. Sono due i motivi, e il
// secondo conta più del primo: costa una chiamata a ogni scheda aperta, e
// soprattutto un riassunto che compare da solo si legge come un fatto, mentre
// uno che si chiede si legge come un'opinione — che è quello che è. Sotto
// restano sempre i dati veri: se le due cose non combaciano, vincono quelli.

export function LetturaCliente({ email, telefono }: { email: string; telefono: string }) {
  const [lettura, setLettura] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')

  async function chiedi() {
    setInCorso(true)
    setErrore('')
    setLettura('')
    try {
      const res = await fetch('/api/clienti/lettura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, telefono }),
      })
      const d = (await res.json().catch(() => ({}))) as { lettura?: string; errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Lettura non riuscita.')
        return
      }
      setLettura(d.lettura ?? '')
    } catch {
      setErrore('Lettura non riuscita: problema di rete.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>In due righe</h2>
        <button type="button" className="btn btn-secondario small" onClick={chiedi} disabled={inCorso}>
          {inCorso ? 'Leggo…' : lettura ? 'Rileggi' : 'Chiedi all’AI'}
        </button>
      </div>

      {lettura ? (
        <>
          <p style={{ marginTop: 10, marginBottom: 6, lineHeight: 1.6 }}>{lettura}</p>
          <p className="cella-sub" style={{ margin: 0 }}>
            Riassunto dei dati qui sotto, scritto dall’AI. Se qualcosa non torna, valgono i dati.
          </p>
        </>
      ) : errore ? (
        <div className="avviso-errore" style={{ marginTop: 10 }}>
          {errore}
        </div>
      ) : (
        <p className="descrizione" style={{ marginTop: 8, marginBottom: 0 }}>
          Un appunto come lo passeresti a un collega: quante volte ha comprato, se aspetta una
          risposta, a chi manda di solito. Usa solo i dati di questa pagina.
        </p>
      )}
    </div>
  )
}
