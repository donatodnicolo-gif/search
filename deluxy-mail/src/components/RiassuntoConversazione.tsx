'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { riassumiConversazione } from '@/lib/actions'
import { ChiediConversazione } from './ChiediConversazione'

/** Le domande che si fanno DOPO aver letto un riassunto. Sono generiche
 *  apposta: valgono su qualunque scambio, e servono a far partire il gesto —
 *  la domanda vera la si scrive dopo, quando si è visto che risponde. */
const SUGGERIMENTI = ['Sai per quando?', 'Che prezzo hanno fatto?', 'Cosa aspettano da me?']

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
  messaggiOra,
  autoAggiorna = false,
}: {
  messaggioId: string
  iniziale: Salvato | null
  /** Quanti messaggi ha ORA la conversazione: se sono più di quelli su cui il
   *  riassunto è stato fatto, quel riassunto è vecchio e va detto. */
  messaggiOra?: number
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
          {LIVELLI.map((l) => {
            // ⚠️ Il tasto del livello ATTIVO deve dire che si può ripremere:
            // acceso e basta sembra uno stato, non un comando — e infatti è
            // stato chiesto «come posso rilanciare il riassunto?» (9/08/2026).
            const corrente = Boolean(dati) && dati?.analisi.livello === l.codice
            return (
              <button
                key={l.codice}
                type="button"
                className={`btn ${corrente ? 'primary' : 'secondary'} small`}
                disabled={lavora}
                title={corrente ? `Rifai la lettura ${l.etichetta.toLowerCase()} da capo` : l.titolo}
                onClick={() => genera(l.codice)}
              >
                {lavora && ultimo === l.codice ? 'Leggo…' : corrente ? `↻ ${l.etichetta}` : l.etichetta}
              </button>
            )
          })}
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

          {/* ⚠️ VECCHIO si dice, non si lascia indovinare: un riassunto fatto
              su 10 messaggi quando ora sono 17 non è sbagliato, è indietro — e
              chi lo legge deve saperlo prima di fidarsene. */}
          {typeof messaggiOra === 'number' && messaggiOra > dati.messaggiVisti && (
            <div style={{ marginTop: 12, fontSize: 12.5 }}>
              <span className="badge neutral">
                <span className="dot" />
                Da aggiornare
              </span>{' '}
              Questa lettura è stata fatta su {dati.messaggiVisti} messaggi, adesso la
              conversazione ne ha {messaggiOra}. Ripremi un livello qui sopra per rifarla.
            </div>
          )}

          {/* ⚠️ La domanda nasce QUI, non in fondo alla pagina.
              Un riassunto risponde a «di cosa si parla» e apre subito la
              domanda dopo — «sai per quando?», «che prezzo hanno fatto?» — e
              finché per farla bisognava scorrere fino in fondo alla mail (dove
              «Chiedi a questa conversazione» c'era già), quella domanda
              finiva rileggendosi le nove mail a mano.
              ⚠️ Non è un doppione da togliere di là: là si arriva dopo aver
              letto la mail, qui dopo aver letto il quadro — sono due momenti
              diversi ([[feedback-non-togliere-azioni]]). */}
          <div style={{ marginTop: 14, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
            <ChiediConversazione
              messaggioId={messaggioId}
              quante={messaggiOra ?? dati.messaggiVisti}
              invito="Chiedi qualcosa su questo scambio — es. «Sai per quando?»"
              suggerimenti={SUGGERIMENTI}
            />
          </div>

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
