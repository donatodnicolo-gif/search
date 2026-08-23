'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CATEGORIE, type PropostaDto, type VoceDto } from '@/lib/glossario'

// Il glossario: i fatti che servono a chi risponde a un cliente.
//
// ⚠️ Tre parti, e sono tre cose diverse:
//  1. **Da controllare** — quello che l'AI ha proposto stanotte leggendo le
//     chat. Sta in cima perché è l'unica parte che *scade*: finché nessuno
//     decide, quel fatto non è nel glossario di nessuno.
//  2. **Il glossario** — le voci scritte, per marchio o valide per tutti.
//  3. **Come siamo fatti** — la parte che NON si scrive: numeri, caselle, siti,
//     quota fornitore. Letti dalla configurazione a ogni apertura, apposta.
//
// ⚠️ La distinzione da non perdere: qui stanno i **fatti**, non i testi da
// mandare (quelli sono le Risposte pronte) né le regole di tono per l'AI
// (quelle sono CS AI). Se le tre cose si mescolano, in sei mesi ci sono quattro
// posti dove cercare la stessa cosa e nessuno è aggiornato.

type FattoDiSistema = { voce: string; valore: string }
type Sistema = { brand: { nome: string; fatti: FattoDiSistema[] }[]; globali: FattoDiSistema[] }
type Dati = {
  voci: VoceDto[]
  proposte: PropostaDto[]
  negozi: { id: string; nome: string }[]
  sistema?: Sistema
  esitoGiro?: { conversazioniLette: number; proposteNuove: number; scartate: number; errore: string }
}

const VUOTO: Dati = { voci: [], proposte: [], negozi: [] }

const NOMI_TIPO: Record<string, string> = {
  aggiunta: 'Manca',
  correzione: 'Da correggere',
  avviso: 'Da sapere',
}

export function Glossario() {
  const [dati, setDati] = useState<Dati>(VUOTO)
  const [sistema, setSistema] = useState<Sistema | null>(null)
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [giroDetto, setGiroDetto] = useState('')

  const [q, setQ] = useState('')
  const [filtroBrand, setFiltroBrand] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  // Il modulo: vuoto = nuova voce, con id = sto correggendo quella.
  const [id, setId] = useState('')
  const [termine, setTermine] = useState('')
  const [definizione, setDefinizione] = useState('')
  const [categoria, setCategoria] = useState('cliente')
  const [brand, setBrand] = useState('')

  const carica = useCallback(async () => {
    const res = await fetch('/api/glossario')
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      setErrore(d.errore ?? 'Non sono riuscito a leggere il glossario.')
      setCaricato(true)
      return
    }
    const d = (await res.json()) as Dati
    setDati(d)
    if (d.sistema) setSistema(d.sistema)
    setCaricato(true)
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  async function manda(corpo: Record<string, unknown>) {
    setSalvando(true)
    setErrore('')
    try {
      const res = await fetch('/api/glossario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const d = (await res.json()) as Dati & { errore?: string }
      if (!res.ok) {
        setErrore(d.errore ?? 'Non sono riuscito a salvare.')
        return false
      }
      setDati((v) => ({ ...d, sistema: v.sistema }))
      if (d.esitoGiro) {
        setGiroDetto(
          d.esitoGiro.errore
            ? `Il giro non è riuscito: ${d.esitoGiro.errore}`
            : `Lette ${d.esitoGiro.conversazioniLette} conversazioni · ${d.esitoGiro.proposteNuove} proposte nuove${d.esitoGiro.scartate ? ` · ${d.esitoGiro.scartate} scartate perché non reggevano` : ''}.`
        )
      }
      return true
    } catch {
      setErrore('Non sono riuscito a salvare: problema di rete.')
      return false
    } finally {
      setSalvando(false)
    }
  }

  function svuota() {
    setId('')
    setTermine('')
    setDefinizione('')
    setCategoria('cliente')
    setBrand('')
  }

  const nomeBrand = (bid: string) => dati.negozi.find((n) => n.id === bid)?.nome ?? ''

  const visibili = useMemo(() => {
    const cerca = q.trim().toLowerCase()
    return dati.voci.filter((v) => {
      if (filtroBrand === '__globali' ? v.negozioId : filtroBrand && v.negozioId !== filtroBrand)
        return false
      if (filtroCategoria && v.categoria !== filtroCategoria) return false
      if (!cerca) return true
      return (
        v.termine.toLowerCase().includes(cerca) || v.definizione.toLowerCase().includes(cerca)
      )
    })
  }, [dati.voci, q, filtroBrand, filtroCategoria])

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Glossario</h1>
          <p className="page-sub">
            Quello che si sa e che serve per rispondere: come funzionano i marchi, cosa si può
            dire a un cliente, cosa è roba interna. Ogni notte l’AI rilegge le chat del giorno e
            propone cosa manca — <strong>propone</strong>: decidi tu.
          </p>
        </div>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}
      {giroDetto ? <div className="avviso-ok">{giroDetto}</div> : null}

      {/* ── 1. DA CONTROLLARE ──
          ⚠️ In cima perché è l'unica parte che scade: finché nessuno decide,
          quel fatto non è nel glossario di nessuno. Se non ce ne sono, il
          riquadro sparisce: uno vuoto tutti i giorni si impara a saltare. */}
      {dati.proposte.length ? (
        <>
          <h2 style={{ fontSize: 17, marginTop: 4, marginBottom: 4 }}>
            Da controllare · {dati.proposte.length}
          </h2>
          <p className="descrizione" style={{ marginTop: 0 }}>
            L’AI ha letto le chat e propone questo. Ogni riga porta{' '}
            <strong>la conversazione da cui nasce</strong>: aprila prima di accettare.
          </p>
          <div className="card" style={{ padding: 0, marginBottom: 22 }}>
            {dati.proposte.map((p, i) => (
              <div
                key={p.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: i === dati.proposte.length - 1 ? 'none' : '1px solid var(--hairline)',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge${p.tipo === 'correzione' ? ' rosso' : ''}`}>
                    {NOMI_TIPO[p.tipo] ?? p.tipo}
                  </span>
                  <span className="cella-nome">{p.termine}</span>
                  {p.negozioNome ? <span className="badge">{p.negozioNome}</span> : null}
                  <span className="cella-sub">
                    {p.categoria === 'tecnico' ? 'interno' : 'si può dire al cliente'}
                  </span>
                  <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    {p.conversazioneId ? (
                      <a
                        className="bottone secondario mini"
                        // ⚠️ Il parametro è `c`: è quello che l'inbox legge
                        // davvero. Con `conversazione` il link apriva l'inbox
                        // senza aprire niente — e la «prova» della proposta
                        // restava a un clic che non funzionava.
                        href={`/inbox?c=${encodeURIComponent(p.conversazioneId)}`}
                        target="_blank"
                        rel="noreferrer"
                        title="La conversazione da cui viene: è la prova"
                      >
                        Vedi la chat ↗
                      </a>
                    ) : null}
                    <button
                      className="bottone mini"
                      disabled={salvando}
                      onClick={() => void manda({ azione: 'accetta', id: p.id })}
                    >
                      {p.tipo === 'avviso' ? 'Letto' : 'Accetta'}
                    </button>
                    <button
                      className="bottone secondario mini"
                      disabled={salvando}
                      onClick={() => void manda({ azione: 'scarta', id: p.id })}
                    >
                      Scarta
                    </button>
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 14 }}>{p.definizione}</p>
                {p.perche ? (
                  <p className="cella-sub" style={{ marginTop: 4 }}>
                    Perché: {p.perche}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : caricato ? (
        <p className="descrizione">
          Niente da controllare: l’ultimo giro dell’AI non ha trovato fatti nuovi nelle chat.
        </p>
      ) : null}

      {/* ── 2. IL GLOSSARIO ── */}
      <h2 style={{ fontSize: 17, marginTop: 8, marginBottom: 8 }}>Le voci</h2>

      <div className="filtri">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca…"
          aria-label="Cerca nel glossario"
          style={{ minWidth: 180 }}
        />
        <select value={filtroBrand} onChange={(e) => setFiltroBrand(e.target.value)} aria-label="Marchio">
          <option value="">Tutti i marchi</option>
          <option value="__globali">Solo quelle valide per tutti</option>
          {dati.negozi.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nome}
            </option>
          ))}
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          aria-label="Categoria"
        >
          <option value="">Tutto</option>
          {CATEGORIE.map((c) => (
            <option key={c.chiave} value={c.chiave}>
              {c.nome}
            </option>
          ))}
        </select>
        <button
          className="bottone secondario mini"
          disabled={salvando}
          title="Rilegge subito le chat delle ultime 24 ore, senza aspettare il giro di stanotte"
          onClick={() => void manda({ azione: 'giro' })}
          style={{ marginLeft: 'auto' }}
        >
          {salvando ? 'Rileggo le chat…' : 'Rileggi le chat adesso'}
        </button>
      </div>

      {/* Il modulo: scrivere una voce a mano. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="campo">
            <span>Termine — come lo cercherebbe una persona</span>
            <input
              value={termine}
              onChange={(e) => setTermine(e.target.value)}
              placeholder="Consegna in giornata"
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Vale per</span>
              <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">Tutti i marchi</option>
                {dati.negozi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Chi lo può leggere</span>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {CATEGORIE.map((c) => (
                  <option key={c.chiave} value={c.chiave}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <label className="campo">
          <span>Il fatto, scritto come lo diresti a un collega nuovo</span>
          <textarea
            rows={2}
            value={definizione}
            onChange={(e) => setDefinizione(e.target.value)}
            placeholder="A Milano si consegna anche la domenica, con ordine entro le 18 del giorno prima."
          />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="bottone"
            disabled={salvando || !termine.trim() || !definizione.trim()}
            onClick={async () => {
              const ok = await manda({ id, termine, definizione, categoria, negozioId: brand })
              if (ok) svuota()
            }}
          >
            {id ? 'Salva la correzione' : 'Aggiungi al glossario'}
          </button>
          {id ? (
            <button className="bottone secondario" onClick={svuota}>
              Lascia com’era
            </button>
          ) : null}
        </div>
      </div>

      {!caricato ? (
        <p className="descrizione">Carico…</p>
      ) : visibili.length === 0 ? (
        <p className="descrizione">
          {dati.voci.length === 0
            ? 'Il glossario è vuoto. Scrivi la prima cosa che spieghi sempre a un collega nuovo.'
            : 'Nessuna voce con questi filtri.'}
        </p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {visibili.map((v, i) => (
            <div
              key={v.id}
              style={{
                padding: '12px 16px',
                borderBottom: i === visibili.length - 1 ? 'none' : '1px solid var(--hairline)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="cella-nome">{v.termine}</span>
                <span className="badge">{v.negozioNome || 'tutti i marchi'}</span>
                {/* ⚠️ «Interno» va marcato in rosso: è l'unica etichetta che
                    dice «non leggerlo a un cliente». */}
                {v.categoria === 'tecnico' ? <span className="badge rosso">interno</span> : null}
                <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  <button
                    className="bottone secondario mini"
                    disabled={salvando}
                    onClick={() => {
                      setId(v.id)
                      setTermine(v.termine)
                      setDefinizione(v.definizione)
                      setCategoria(v.categoria)
                      setBrand(v.negozioId)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    Correggi
                  </button>
                  <button
                    className="bottone secondario mini"
                    disabled={salvando}
                    onClick={async () => {
                      setSalvando(true)
                      try {
                        const res = await fetch(`/api/glossario?id=${encodeURIComponent(v.id)}`, {
                          method: 'DELETE',
                        })
                        // ⚠️ La risposta si legge PRIMA di entrare nel setState:
                        // dentro l'aggiornatore non si può aspettare niente, e
                        // un `await` là dentro non compila nemmeno.
                        const d = (await res.json()) as Dati & { errore?: string }
                        if (!res.ok) setErrore(d.errore ?? 'Non sono riuscito a togliere la voce.')
                        else setDati((v0) => ({ ...d, sistema: v0.sistema }))
                      } finally {
                        setSalvando(false)
                      }
                    }}
                  >
                    Togli
                  </button>
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 14 }}>{v.definizione}</p>
              <p className="cella-sub" style={{ marginTop: 4 }}>
                {v.fonte === 'ai' ? 'proposta dall’AI e accettata' : 'scritta a mano'}
                {v.autoreNome ? ` · ${v.autoreNome}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. COME SIAMO FATTI ──
          ⚠️ Questa parte NON si scrive, e il motivo sta a schermo: sono dati
          che cambiano da soli quando qualcuno collega un numero o una casella.
          Copiati in una voce invecchierebbero in silenzio, e un glossario che
          invecchia è peggio di uno che manca — perché a quello ci si crede. */}
      {sistema ? (
        <>
          <h2 style={{ fontSize: 17, marginTop: 30, marginBottom: 4 }}>Come siamo fatti</h2>
          <p className="descrizione" style={{ marginTop: 0 }}>
            Questa parte <strong>non si scrive a mano</strong>: è letta dalla configurazione ogni
            volta che apri la pagina, quindi è vera per definizione. Se qualcosa qui è sbagliato,
            si corregge dove sta davvero — non qui.
          </p>
          <div className="tabella-wrap">
            <table>
              <tbody>
                {sistema.brand.map((b) =>
                  b.fatti.map((f, j) => (
                    <tr key={`${b.nome}-${j}`}>
                      <td className="cella-nome" style={{ width: 170 }}>
                        {j === 0 ? b.nome : ''}
                      </td>
                      <td className="cella-muta" style={{ width: 170 }}>
                        {f.voce}
                      </td>
                      <td>{f.valore}</td>
                    </tr>
                  ))
                )}
                {sistema.globali.map((f, j) => (
                  <tr key={`globale-${j}`}>
                    <td className="cella-nome" style={{ width: 170 }}>
                      {j === 0 ? 'Tutti i marchi' : ''}
                    </td>
                    <td className="cella-muta" style={{ width: 170 }}>
                      {f.voce}
                    </td>
                    <td>{f.valore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="card" style={{ marginTop: 22, maxWidth: 900 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Che cosa va qui, e che cosa no</h2>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          Qui vanno i <strong>fatti</strong>: quello che devi sapere per scrivere la risposta
          giusta. Un <strong>testo da mandare</strong> è una{' '}
          <a href="/script">Risposta pronta</a>; una <strong>regola di tono</strong> per l’AI è
          un’istruzione di <a href="/cs-ai">CS AI</a>; un <strong>documento</strong> da cui
          l’AI impara si carica sempre in CS AI. Se le quattro cose si mescolano, in sei mesi ci
          sono quattro posti dove cercare la stessa cosa e nessuno è aggiornato.
        </p>
      </div>
    </main>
  )
}
