'use client'

import { useMemo, useState } from 'react'

// Scelta dell'aspetto del widget + il codice da incollare sul sito.
//
// L'anteprima è il widget VERO dentro un iframe (`/widget?anteprima=1`), non un
// disegno che gli somiglia: un finto anteprima è la cosa che invecchia peggio —
// si cambia il CSS del widget e l'anteprima continua a mostrare com'era prima.

const TEMI = [
  { id: 'chiaro', nome: 'Chiaro', quando: 'Il difetto. Sta bene sui siti a fondo bianco o grigio.' },
  { id: 'scuro', nome: 'Scuro', quando: 'Per i siti a fondo nero, dove il chiaro sembra una toppa.' },
  { id: 'deluxy', nome: 'Deluxy', quando: 'Nero e oro: i nostri siti.' },
  { id: 'caldo', nome: 'Caldo', quando: 'Avorio e terracotta: fiori e pasticceria, dove il grigio stona con le foto.' },
  { id: 'minimale', nome: 'Minimale', quando: 'Nessun colore, spigoli morbidi. Nel dubbio, questo.' },
  { id: 'automatico', nome: 'Automatico', quando: 'Chiaro o scuro come lo ha impostato chi guarda.' },
]

export function AspettoWidget({ origine, titolo }: { origine: string; titolo: string }) {
  const [tema, setTema] = useState('chiaro')
  const [accento, setAccento] = useState('')
  const [posizione, setPosizione] = useState('destra')
  const [etichetta, setEtichetta] = useState('')
  const [copiato, setCopiato] = useState(false)

  const accentoValido = /^#[0-9a-f]{6}$/i.test(accento)

  const codice = useMemo(() => {
    const righe = [`<script src="${origine}/widget.js" defer`]
    const attributi: string[] = []
    if (tema !== 'chiaro') attributi.push(`data-tema="${tema}"`)
    if (accentoValido) attributi.push(`data-accento="${accento.toLowerCase()}"`)
    if (posizione !== 'destra') attributi.push(`data-posizione="${posizione}"`)
    if (etichetta.trim()) attributi.push(`data-etichetta="${etichetta.trim().replace(/"/g, '')}"`)
    if (attributi.length) righe.push('        ' + attributi.join(' '))
    return righe.join('\n') + '></script>'
  }, [origine, tema, accento, accentoValido, posizione, etichetta])

  const urlAnteprima = useMemo(() => {
    const p = new URLSearchParams({ anteprima: '1', tema, titolo })
    if (accentoValido) p.set('accento', accento.toLowerCase())
    return `/widget?${p.toString()}`
  }, [tema, accento, accentoValido, titolo])

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Tema</h2>
        <div className="temi-griglia">
          {TEMI.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tema-scelta${tema === t.id ? ' scelto' : ''}`}
              onClick={() => setTema(t.id)}
            >
              <iframe
                className="tema-mini"
                src={`/widget?anteprima=1&tema=${t.id}&titolo=${encodeURIComponent(titolo)}`}
                title={`Anteprima tema ${t.nome}`}
                tabIndex={-1}
              />
              <div className="tema-nome">{t.nome}</div>
              <div className="cella-sub">{t.quando}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Ritocchi</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="campo">
            <span>Colore del sito (facoltativo)</span>
            <input
              value={accento}
              onChange={(e) => setAccento(e.target.value)}
              placeholder="#9c5b3f"
              spellCheck={false}
            />
          </label>
          <label className="campo">
            <span>Posizione</span>
            <select value={posizione} onChange={(e) => setPosizione(e.target.value)}>
              <option value="destra">In basso a destra</option>
              <option value="sinistra">In basso a sinistra</option>
            </select>
          </label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            <span>Scritta accanto al bottone (facoltativa)</span>
            <input
              value={etichetta}
              onChange={(e) => setEtichetta(e.target.value)}
              placeholder="Scrivici"
              maxLength={24}
            />
          </label>
        </div>
        <p className="cella-sub" style={{ marginBottom: 0 }}>
          Il colore va scritto come <code>#rrggbb</code>; se è sbagliato viene ignorato e resta
          quello del tema — meglio un widget col tema giusto che uno senza colori.
          {accento && !accentoValido ? (
            <strong> Adesso non è valido: serve un # e sei cifre.</strong>
          ) : null}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Come viene</h2>
        <p className="descrizione">
          È il widget vero, con messaggi finti: nessuna conversazione finisce in Inbox.
        </p>
        <div className="anteprima-cornice">
          <iframe className="anteprima-widget" src={urlAnteprima} title="Anteprima del widget" />
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Codice da incollare sul sito</h2>
        <p className="descrizione">
          Va prima di <code>&lt;/body&gt;</code>. Su Shopify: Negozio online → Temi → Modifica
          codice → <code>theme.liquid</code>.
        </p>
        <pre className="codice-incolla">{codice}</pre>
        <button
          className="bottone"
          onClick={() => {
            navigator.clipboard.writeText(codice).then(
              () => {
                setCopiato(true)
                setTimeout(() => setCopiato(false), 2000)
              },
              () => setCopiato(false)
            )
          }}
        >
          {copiato ? 'Copiato' : 'Copia il codice'}
        </button>
      </div>
    </>
  )
}
