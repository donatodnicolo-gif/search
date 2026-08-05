'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { chiediAllaConversazione } from '@/lib/actions'

type Esito = {
  trovato: boolean
  risposta: string
  citazione: string
  fonte: { id: string; chi: string; quando: string; oggetto: string } | null
  lette: number
}

/**
 * «CHIEDI A QUESTA CONVERSAZIONE»: una domanda a parole — «ci hanno mandato
 * l'IBAN?», «hanno confermato per giovedì?» — e la risposta qui, subito.
 *
 * ⚠️ Non è «Delega Renè», ed è il punto: quella prepara sempre una MAIL (o un
 * appuntamento), quindi a «c'è l'IBAN?» rispondeva scrivendo al fornitore per
 * chiederglielo. Domandare e far scrivere sono due gesti diversi.
 *
 * ⚠️ La risposta arriva sempre con **da dove viene**: la mail (che si apre) e
 * le parole esatte. Un «sì» su una fattura che non si può verificare non serve
 * a niente — e «non l'ho trovato» è una risposta buona, non un fallimento.
 *
 * Non si salva: è una domanda, non un documento. Ricaricando sparisce.
 */
export function ChiediConversazione({
  messaggioId,
  quante,
}: {
  messaggioId: string
  /** Quante mail ha la conversazione: cambia solo le parole. */
  quante: number
}) {
  const [aperto, setAperto] = useState(false)
  const [domanda, setDomanda] = useState('')
  const [esito, setEsito] = useState<Esito | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, start] = useTransition()

  const chiedi = () => {
    if (!domanda.trim() || inCorso) return
    setErrore(null)
    setEsito(null)
    start(async () => {
      const r = await chiediAllaConversazione(messaggioId, domanda)
      if (!r.ok) {
        setErrore(r.messaggio || 'Non sono riuscito a leggere la conversazione.')
        return
      }
      setEsito({
        trovato: Boolean(r.trovato),
        risposta: r.risposta ?? '',
        citazione: r.citazione ?? '',
        fonte: r.fonte
          ? {
              id: r.fonte.id,
              chi: r.fonte.chi,
              oggetto: r.fonte.oggetto,
              quando: new Date(r.fonte.data).toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
            }
          : null,
        lette: r.lette ?? 0,
      })
    })
  }

  const dove = quante > 1 ? 'questa conversazione' : 'questa mail'

  if (!aperto) {
    return (
      <button type="button" className="azione-riga" onClick={() => setAperto(true)}>
        <span className="ai-toggle-mark">AI</span> Chiedi a {dove}
      </button>
    )
  }

  return (
    <div className="ai-box">
      <div className="ai-box-title">Chiedi a {dove}</div>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        Cerco la risposta <strong>solo qui dentro</strong> e ti dico da quale mail viene. Se non
        c’è scritto, te lo dico: non lo invento.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              chiedi()
            }
          }}
          placeholder="Es. ci hanno mandato l’IBAN? hanno confermato per giovedì?"
          style={{ flex: 1, minWidth: 260 }}
          autoFocus
          maxLength={500}
        />
        <button
          type="button"
          className="btn primary small"
          onClick={chiedi}
          disabled={inCorso || !domanda.trim()}
        >
          {inCorso ? 'Leggo…' : 'Chiedi'}
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => setAperto(false)}
          disabled={inCorso}
        >
          Chiudi
        </button>
      </div>

      {errore && (
        <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 10 }}>{errore}</div>
      )}

      {esito && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className={`badge ${esito.trovato ? 'green' : 'neutral'}`}>
              <span className="dot" />
              {esito.trovato ? 'Trovato' : 'Non l’ho trovato'}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              lette {esito.lette} {esito.lette === 1 ? 'mail' : 'mail'}
            </span>
          </div>

          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{esito.risposta}</div>

          {/* La FONTE è la parte che rende usabile la risposta: le parole
              esatte, e la mail che si apre per controllare. */}
          {esito.trovato && esito.citazione && (
            <div
              style={{
                fontSize: 13,
                fontStyle: 'italic',
                borderLeft: '2px solid var(--hairline-strong)',
                paddingLeft: 10,
                margin: '10px 0 6px',
                color: 'var(--text-secondary)',
              }}
            >
              «{esito.citazione}»
            </div>
          )}
          {esito.trovato && esito.fonte && (
            <div style={{ fontSize: 12.5 }}>
              <Link href={`/messaggio/${esito.fonte.id}`} className="azione-riga">
                Apri la mail di {esito.fonte.chi} del {esito.fonte.quando} →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
