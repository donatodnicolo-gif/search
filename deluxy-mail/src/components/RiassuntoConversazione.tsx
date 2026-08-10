'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
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
  livello?: Livello
}

/** Quanto a fondo leggere la conversazione. */
type Livello = 'veloce' | 'medio' | 'profondo'

/** ⚠️ Le etichette dicono cosa ottieni, non «quanto è potente»: chi sceglie sta
 *  decidendo quanto tempo dare a una lettura, non che modello usare. */
const LIVELLI: { codice: Livello; etichetta: string; titolo: string }[] = [
  { codice: 'veloce', etichetta: 'Veloce', titolo: 'Due righe: a che punto siamo e chi aspetta cosa' },
  { codice: 'medio', etichetta: 'Medio', titolo: 'Il quadro per punti di vista, con le questioni aperte' },
  {
    codice: 'profondo',
    etichetta: 'Profondo',
    titolo:
      'Tutta la vicenda: come è nata, cosa è stato deciso, cifre e date, e ogni cosa rimasta in sospeso. Ci mette di più',
  },
]

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
  autoAggiorna = false,
}: {
  messaggioId: string
  iniziale: Salvato | null
  /** True se il thread è AI+ e il riassunto è vecchio: lo rigenera da solo
   *  all'apertura, SOLO per questa conversazione (niente conteggi globali). */
  autoAggiorna?: boolean
}) {
  const [dati, setDati] = useState<Salvato | null>(iniziale)
  // Quale livello si sta generando adesso: serve a far capire QUALE dei tre
  // tasti sta lavorando — su «profondo» l'attesa è reale.
  const [ultimo, setUltimo] = useState<Livello | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [autoInCorso, setAutoInCorso] = useState(false)
  const [inCorso, start] = useTransition()

  const genera = (livello: Livello) =>
    start(async () => {
      setErrore(null)
      setUltimo(livello)
      const esito = await riassumiConversazione(messaggioId, livello)
      if (esito.ok && esito.riassunto) setDati(esito.riassunto)
      else setErrore(esito.messaggio)
    })

  // Aggiornamento automatico all'apertura, una volta sola: il thread è AI+ e il
  // riassunto è vecchio (o manca). Riguarda SOLO questa conversazione.
  const fatto = useRef(false)
  useEffect(() => {
    if (!autoAggiorna || fatto.current) return
    fatto.current = true
    let vivo = true
    setAutoInCorso(true)
    riassumiConversazione(messaggioId)
      .then((esito) => {
        if (vivo && esito.ok && esito.riassunto) setDati(esito.riassunto)
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setAutoInCorso(false)
      })
    return () => {
      vivo = false
    }
  }, [autoAggiorna, messaggioId])

  const lavora = inCorso || autoInCorso

  return (
    <div className="ai-box">
      <div className="ai-box-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>Punti di vista della conversazione</span>
        {/* TRE livelli invece di un tasto solo: una conversazione di tre mail
            si legge in dieci secondi e un riassunto lungo è tempo perso; una
            da trenta, prima di una riunione, va sviscerata. */}
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {LIVELLI.map((l) => (
            <button
              key={l.codice}
              type="button"
              className={`btn ${dati?.analisi.livello === l.codice ? 'primary' : 'secondary'} small`}
              disabled={lavora}
              title={l.titolo}
              onClick={() => genera(l.codice)}
            >
              {lavora && ultimo === l.codice ? 'Leggo…' : l.etichetta}
            </button>
          ))}
        </span>
      </div>

      {autoInCorso && (
        <div className="ai-box-text" style={{ color: 'var(--text-tertiary)' }}>
          L’AI sta aggiornando il riassunto di questa conversazione…
        </div>
      )}

      {errore && <div className="ai-box-text" style={{ color: 'var(--red)' }}>{errore}</div>}

      {!dati && !errore && (
        <div className="ai-box-text" style={{ color: 'var(--text-secondary)' }}>
          Più persone in questo scambio. Fai leggere all’AI tutta la conversazione: ti dice
          cosa chiede ogni parte e cosa resta in sospeso. <strong>Veloce</strong> sono due
          righe, <strong>Medio</strong> il quadro completo, <strong>Profondo</strong> tutta
          la vicenda con cifre e date — ci mette di più.
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
            {/* Quale livello si sta guardando: se no, riaprendo la pagina, due
                righe possono sembrare un riassunto povero invece che veloce. */}
            {dati.analisi.livello && ` · lettura ${dati.analisi.livello}`}
          </div>
        </div>
      )}
    </div>
  )
}
