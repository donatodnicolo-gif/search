'use client'

import { useCallback, useEffect, useState } from 'react'

// Il riassunto di una conversazione: cosa vuole il cliente e, soprattutto,
// **data, ora, luogo e prodotto** — se li ha detti.
//
// ⚠️ Ogni campo si vede solo con la FRASE del cliente da cui viene. Non è
// pignoleria: su una consegna, un «08/12» letto come l'8 dicembre invece che
// come la fascia 8-12 manda i fiori quattro mesi dopo. Con la frase accanto, chi
// legge verifica in due secondi; senza, si fida — ed è lì che si sbaglia.
//
// Quello che il cliente non ha detto resta **vuoto e scritto come mancante**:
// «non indicato» è un'informazione, un'ipotesi no.

type Riassunto = {
  riassunto: string
  data: string
  dataCitazione: string
  ora: string
  oraCitazione: string
  luogo: string
  luogoCitazione: string
  prodotto: string
  prodottoCitazione: string
  daChiedere: string[]
}

export function RiassuntoChat({ conversazioneId }: { conversazioneId: string }) {
  const [riassunto, setRiassunto] = useState<Riassunto | null>(null)
  const [fattoIl, setFattoIl] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')

  // All'apertura si mostra quello già salvato, senza chiamare l'AI: è
  // istantaneo e gratis. Il modello si scomoda solo se lo si chiede.
  const carica = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversazioni/${conversazioneId}/riassunto`)
      if (!res.ok) return
      const d = (await res.json()) as { riassunto: Riassunto | null; fattoIl: string | null }
      setRiassunto(d.riassunto)
      setFattoIl(d.fattoIl)
    } catch {
      // niente riassunto salvato: si resta con il bottone
    }
  }, [conversazioneId])

  useEffect(() => {
    setRiassunto(null)
    setFattoIl(null)
    setErrore('')
    carica()
  }, [carica])

  async function rifai() {
    if (inCorso) return
    setInCorso(true)
    setErrore('')
    try {
      const res = await fetch(`/api/conversazioni/${conversazioneId}/riassunto`, { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        riassunto?: Riassunto
        fattoIl?: string
        errore?: string
      }
      if (!res.ok || !d.riassunto) {
        setErrore(d.errore || 'Riassunto non riuscito.')
        return
      }
      setRiassunto(d.riassunto)
      setFattoIl(d.fattoIl ?? null)
    } catch {
      setErrore('Riassunto non riuscito: problema di rete.')
    } finally {
      setInCorso(false)
    }
  }

  const campi = riassunto
    ? [
        { nome: 'Data', valore: riassunto.data, citazione: riassunto.dataCitazione },
        { nome: 'Ora', valore: riassunto.ora, citazione: riassunto.oraCitazione },
        { nome: 'Luogo', valore: riassunto.luogo, citazione: riassunto.luogoCitazione },
        { nome: 'Prodotto', valore: riassunto.prodotto, citazione: riassunto.prodottoCitazione },
      ]
    : []

  return (
    <div className="riassunto-chat">
      <div className="testa-riassunto">
        <strong>Riassunto</strong>
        {fattoIl ? (
          <span className="cella-sub">
            fatto il {new Date(fattoIl).toLocaleString('it-IT')}
          </span>
        ) : null}
        <button className="bottone secondario mini" onClick={rifai} disabled={inCorso}>
          {inCorso ? 'Leggo la chat…' : riassunto ? 'Rifai' : 'Riassumi con l’AI'}
        </button>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {riassunto ? (
        <>
          {riassunto.riassunto ? <p className="testo-riassunto">{riassunto.riassunto}</p> : null}
          <ul className="campi-riassunto">
            {campi.map((c) => (
              <li key={c.nome} className={c.valore ? '' : 'mancante'}>
                <span className="nome">{c.nome}</span>
                <span className="valore">{c.valore || 'non indicato'}</span>
                {/* La frase del cliente: è quella che rende il dato verificabile
                    in due secondi invece che da credere sulla parola. */}
                {c.citazione ? <span className="citazione">«{c.citazione}»</span> : null}
              </li>
            ))}
          </ul>
          {riassunto.daChiedere.length ? (
            <div className="da-chiedere">
              <span className="nome">Da chiedere</span>
              <ul>
                {riassunto.daChiedere.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="cella-sub" style={{ margin: 0 }}>
          Legge tutta la conversazione e ne tira fuori data, ora, luogo e prodotto — solo se il
          cliente li ha detti, e con la frase da cui vengono.
        </p>
      )}
    </div>
  )
}
