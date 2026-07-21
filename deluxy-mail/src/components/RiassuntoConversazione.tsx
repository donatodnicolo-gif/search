'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { riassumiConversazione } from '@/lib/actions'

// I riassunti nuovi hanno msgId (per il link "apri") e, in sospeso, "chi".
// I vecchi possono avere inSospeso come semplici stringhe: si gestiscono entrambi.
type Parte = { chi: string; punto: string; msgId?: string | null }
type Sospeso = string | { cosa: string; chi?: string; msgId?: string | null }
type Analisi = {
  sintesi: string
  parti: Parte[]
  inSospeso: Sospeso[]
}

/** Il link "→ apri" al messaggio dove sta il passaggio (se lo conosciamo). */
function ApriMsg({ msgId }: { msgId?: string | null }) {
  if (!msgId) return null
  return (
    <Link
      href={`/messaggio/${msgId}`}
      style={{ marginLeft: 6, fontSize: 12.5, textDecoration: 'underline', whiteSpace: 'nowrap' }}
      title="Apri la mail dove c’è questo passaggio"
    >
      → apri
    </Link>
  )
}
type Salvato = {
  analisi: Analisi
  partecipanti: number
  messaggiVisti: number
  generatoIl: string | Date
}

/**
 * Il quadro "per punti di vista" di una conversazione. L'AI legge tutti i
 * messaggi del thread e dice cosa vuole/dice ogni parte. Generato a richiesta,
 * poi salvato: riaprendo si rivede senza rispendere.
 */
export function RiassuntoConversazione({
  messaggioId,
  iniziale,
}: {
  messaggioId: string
  iniziale: Salvato | null
}) {
  const [dati, setDati] = useState<Salvato | null>(iniziale)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, start] = useTransition()

  const genera = () =>
    start(async () => {
      setErrore(null)
      const esito = await riassumiConversazione(messaggioId)
      if (esito.ok && esito.riassunto) setDati(esito.riassunto)
      else setErrore(esito.messaggio)
    })

  return (
    <div className="ai-box">
      <div className="ai-box-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>Punti di vista della conversazione</span>
        <button className="btn secondary small" disabled={inCorso} onClick={genera}>
          {inCorso ? 'Leggo…' : dati ? 'Rigenera' : 'Riassumi la conversazione'}
        </button>
      </div>

      {errore && <div className="ai-box-text" style={{ color: 'var(--red)' }}>{errore}</div>}

      {!dati && !errore && (
        <div className="ai-box-text" style={{ color: 'var(--text-secondary)' }}>
          Più persone in questo scambio. Fai leggere all’AI tutta la conversazione: ti dice
          cosa chiede ogni parte e cosa resta in sospeso.
        </div>
      )}

      {dati && (
        <div className="ai-box-text">
          <p style={{ margin: 0 }}>{dati.analisi.sintesi}</p>

          {dati.analisi.parti.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dati.analisi.parti.map((p, i) => (
                <div key={i}>
                  <strong>{p.chi}</strong>: {p.punto}
                  <ApriMsg msgId={p.msgId} />
                </div>
              ))}
            </div>
          )}

          {dati.analisi.inSospeso.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600 }}>In sospeso</div>
              <ul style={{ margin: '4px 0 0 18px' }}>
                {dati.analisi.inSospeso.map((s, i) => {
                  // Vecchi riassunti: stringa. Nuovi: { cosa, chi, msgId }.
                  if (typeof s === 'string') {
                    return <li key={i} style={{ marginTop: 2 }}>{s}</li>
                  }
                  return (
                    <li key={i} style={{ marginTop: 2 }}>
                      {s.cosa}
                      {s.chi && (
                        <span className="muted">
                          {' '}— si aspetta da <strong>{s.chi}</strong>
                        </span>
                      )}
                      <ApriMsg msgId={s.msgId} />
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            Su {dati.messaggiVisti} messaggi · {dati.partecipanti}{' '}
            {dati.partecipanti === 1 ? 'parte' : 'parti'}
          </div>
        </div>
      )}
    </div>
  )
}
