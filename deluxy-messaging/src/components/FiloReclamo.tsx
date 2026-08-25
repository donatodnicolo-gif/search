'use client'

import { useCallback, useEffect, useState } from 'react'

// IL FILO DI DOMANDE E RISPOSTE DI UN RECLAMO.
//
// ⚠️⚠️ Un reclamo non si risolve con «descrizione» + «esito»: in mezzo c'è una
// conversazione. «Il valet dice che ha citofonato, il cliente dice di no» ·
// «chiedo al fioraio se ha la prova di consegna» · «risposto: ce l'ha».
// Finora quella conversazione viveva nelle chat fra colleghi o nella testa di
// chi ci aveva lavorato: chi riapriva il reclamo tre giorni dopo ricominciava da
// capo, e chi decideva un rimborso lo decideva senza sapere che cosa era già
// stato chiesto.
//
// ⚠️ Le DOMANDE si segnano come tali, e una domanda senza risposta resta
// visibile come tale: è la parte che aspetta qualcuno. Un filo di righe tutte
// uguali nasconderebbe proprio quella — ed è il motivo per cui questo non è
// «le note del reclamo».

type Messaggio = {
  id: string
  autoreNome: string
  testo: string
  domanda: boolean
  rispostaA: string
  creatoIl: string
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FiloReclamo({ reclamoId }: { reclamoId: string }) {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [senzaRisposta, setSenzaRisposta] = useState(0)
  const [testo, setTesto] = useState('')
  const [domanda, setDomanda] = useState(false)
  /** La domanda a cui si sta rispondendo ('' = si scrive nel filo). */
  const [rispondoA, setRispondoA] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [mando, setMando] = useState(false)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch(`/api/reclami/${reclamoId}/messaggi`)
      if (!res.ok) return
      const d = (await res.json()) as { messaggi: Messaggio[]; senzaRisposta: number }
      setMessaggi(d.messaggi)
      setSenzaRisposta(d.senzaRisposta)
    } catch {
      // rete assente: il filo resta com'è
    } finally {
      setCaricato(true)
    }
  }, [reclamoId])

  useEffect(() => {
    setCaricato(false)
    void carica()
  }, [carica])

  async function manda() {
    const t = testo.trim()
    if (!t || mando) return
    setMando(true)
    setErrore('')
    try {
      const res = await fetch(`/api/reclami/${reclamoId}/messaggi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testo: t, domanda: domanda && !rispondoA, rispostaA: rispondoA }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Non sono riuscito a scrivere sul filo.')
        return
      }
      // ⚠️ Si svuota SOLO dopo che il server ha detto sì. Svuotare prima vuol
      // dire far sparire quello che uno ha scritto proprio quando la rete non
      // c'era — e nessuno riscrive due volte la stessa cosa.
      setTesto('')
      setDomanda(false)
      setRispondoA('')
      await carica()
    } catch {
      setErrore('Non sono riuscito a scrivere sul filo: problema di rete.')
    } finally {
      setMando(false)
    }
  }

  const risposte = new Set(messaggi.map((m) => m.rispostaA).filter(Boolean))
  const aperte = messaggi.filter((m) => m.domanda && !risposte.has(m.id))
  const perDomanda = (id: string) => messaggi.filter((m) => m.rispostaA === id)
  /** Chi ha risposto per primo a quella domanda: è l'esito, in una parola. */
  const chiHaRisposto = (id: string) => perDomanda(id)[0]?.autoreNome ?? ''

  return (
    <div className="card" style={{ padding: 12, marginTop: 16 }}>
      <div className="cella-nome" style={{ marginBottom: 6 }}>
        Domande e risposte
        {senzaRisposta > 0 ? (
          <span className="badge" style={{ marginLeft: 8, color: 'var(--red)' }}>
            {senzaRisposta} senza risposta
          </span>
        ) : null}
      </div>

      {!caricato ? <p className="cella-sub">Leggo il filo…</p> : null}
      {caricato && messaggi.length === 0 ? (
        <p className="cella-sub">
          Ancora niente. Qui si scrive quello che si chiede e quello che si scopre lavorando il
          reclamo: chi lo riapre fra tre giorni deve poter leggere com&apos;è andata, senza cercare
          in chat.
        </p>
      ) : null}

      {messaggi.length > 0 ? (
        <ul className="filo-reclamo">
          {/* ⚠️ Le risposte NON compaiono da sole: stanno sotto la loro domanda.
              Un filo piatto, con la risposta quaranta righe sotto la domanda, è
              di nuovo una chat da ricostruire a mente. */}
          {messaggi
            .filter((m) => !m.rispostaA)
            .map((m) => (
              <li key={m.id} style={{ marginBottom: 10 }}>
                <div className="cella-sub">
                  {m.autoreNome || 'qualcuno'} · {quando(m.creatoIl)}
                  {m.domanda ? (
                    <span
                      className="badge"
                      style={{
                        marginLeft: 6,
                        color: risposte.has(m.id) ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {/* ⚠️ Non basta dire «risposta»: chi legge vuole sapere
                          CHE ESITO ha avuto la domanda — chi ha risposto e
                          quando. «Risposta» da solo lascia da aprire il filo per
                          scoprire una cosa che sta due righe sotto. */}
                      {risposte.has(m.id)
                        ? `risposta${chiHaRisposto(m.id) ? ' da ' + chiHaRisposto(m.id) : ''}`
                        : 'domanda aperta'}
                    </span>
                  ) : null}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.testo}</div>
                {perDomanda(m.id).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      marginTop: 6,
                      marginLeft: 16,
                      borderLeft: '2px solid var(--fill)',
                      paddingLeft: 10,
                    }}
                  >
                    <div className="cella-sub">
                      {r.autoreNome || 'qualcuno'} · {quando(r.creatoIl)}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{r.testo}</div>
                  </div>
                ))}
                {m.domanda && !risposte.has(m.id) ? (
                  <button
                    type="button"
                    className="btn btn-secondario small"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      setRispondoA(m.id)
                      setDomanda(false)
                    }}
                  >
                    Rispondi
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      ) : null}

      {/* ⚠️ Chi risponde deve vedere A COSA: senza, si scrive nel filo credendo
          di aver risposto, e la domanda resta aperta per sempre. */}
      {rispondoA ? (
        <p className="cella-sub">
          Stai rispondendo a: «{(messaggi.find((m) => m.id === rispondoA)?.testo ?? '').slice(0, 70)}…»{' '}
          <button type="button" className="btn btn-secondario small" onClick={() => setRispondoA('')}>
            Annulla
          </button>
        </p>
      ) : null}

      <textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        rows={2}
        placeholder={rispondoA ? 'La risposta…' : 'Che cosa hai chiesto, o che cosa hai scoperto'}
        aria-label="Scrivi sul filo del reclamo"
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        {!rispondoA ? (
          <label className="cella-sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={domanda} onChange={(e) => setDomanda(e.target.checked)} />
            È una domanda (resta segnata finché qualcuno non risponde)
          </label>
        ) : null}
        <button className="btn" onClick={manda} disabled={!testo.trim() || mando}>
          {mando ? 'Mando…' : rispondoA ? 'Rispondi' : domanda ? 'Chiedi' : 'Scrivi'}
        </button>
      </div>
      {errore ? (
        <p className="cella-sub" style={{ color: 'var(--red)' }}>
          {errore}
        </p>
      ) : null}
      {aperte.length > 0 ? (
        <p className="cella-sub" style={{ marginTop: 6 }}>
          ⚠️ {aperte.length === 1 ? 'Una domanda aspetta' : `${aperte.length} domande aspettano`} una
          risposta: finché sta lì, questo reclamo dipende da qualcun altro.
        </p>
      ) : null}
    </div>
  )
}
