'use client'

import { useState } from 'react'

// «Perché non arrivano i messaggi?» — la domanda a cui, senza questo, si
// rispondeva solo cliccando a caso nella dashboard di Meta.
//
// L'app usa le credenziali che ha già in cassaforte e chiede a Meta com'è
// messa: token valido? numero visibile? e soprattutto **la nostra app è
// iscritta al WhatsApp Business?** — perché se non lo è, Meta non manda niente
// e da questa parte non si vede nulla di anomalo: webhook verificato, chiavi a
// posto, inbox vuota.

type Esito = { passo: string; ok: boolean | null; dettaglio: string }

export function DiagnosiWhatsApp() {
  const [esiti, setEsiti] = useState<Esito[] | null>(null)
  const [conclusione, setConclusione] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')

  async function controlla() {
    setInCorso(true)
    setErrore('')
    setEsiti(null)
    try {
      const res = await fetch('/api/whatsapp/diagnosi')
      const d = (await res.json().catch(() => ({}))) as {
        esiti?: Esito[]
        conclusione?: string
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Diagnosi non riuscita.')
        return
      }
      setEsiti(d.esiti ?? [])
      setConclusione(d.conclusione ?? '')
    } catch {
      setErrore('Diagnosi non riuscita: problema di rete.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      {/* type="button": sta dentro il form delle impostazioni e senza questo
          lo invierebbe, salvando mezza pagina invece di fare la diagnosi. */}
      <button type="button" className="btn btn-secondario small" onClick={controlla} disabled={inCorso}>
        {inCorso ? 'Controllo…' : 'Perché non arrivano i messaggi?'}
      </button>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {esiti ? (
        <div style={{ marginTop: 10 }}>
          {esiti.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  marginTop: 2,
                  color: e.ok === true ? 'var(--green)' : e.ok === false ? 'var(--red)' : 'var(--text-tertiary)',
                }}
              >
                {e.ok === true ? '✓' : e.ok === false ? '✕' : '—'}
              </span>
              <span>
                <strong style={{ fontSize: 13 }}>{e.passo}</strong>
                <div className="cella-sub">{e.dettaglio}</div>
              </span>
            </div>
          ))}
          {conclusione ? (
            <p className="descrizione" style={{ marginBottom: 0 }}>
              <strong>{conclusione}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
