'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CATEGORIE,
  marchiScritti,
  valePer,
  valePerTutti,
  type PropostaDto,
  type VoceDto,
} from '@/lib/glossario'

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

/**
 * A quali marchi vale una voce. **Nessuna spuntata = tutti i marchi.**
 *
 * ⚠️⚠️ Caselle e non un menu a tendina, ed è la ragione per cui esiste questo
 * componente: con un menu si vede solo la voce scelta, e per sapere se una
 * regola vale anche per Cake bisogna aprirlo. Qui i tre marchi si vedono tutti
 * e tre insieme — che è la domanda vera davanti a una frase da dire ai clienti.
 *
 * ⚠️ «Tutti i marchi» è una casella a parte e non l'assenza di spunte: lasciare
 * che si deduca dal vuoto vuol dire non distinguere «vale per tutti» da «non ho
 * ancora scelto», e sono due cose diverse quando la frase è una promessa.
 */
function ScegliMarchi({
  negozi,
  scelti,
  onCambia,
}: {
  negozi: { id: string; nome: string }[]
  scelti: string[]
  onCambia: (ids: string[]) => void
}) {
  const tutti = valePerTutti(scelti)
  return (
    <div className="scegli-marchi">
      <label className={`marchio-scelta${tutti ? ' presa' : ''}`}>
        <input type="checkbox" checked={tutti} onChange={() => onCambia([])} />
        <span>tutti i marchi</span>
      </label>
      {negozi.map((n) => {
        const preso = scelti.includes(n.id)
        return (
          <label key={n.id} className={`marchio-scelta${preso ? ' presa' : ''}`}>
            <input
              type="checkbox"
              checked={preso}
              onChange={() =>
                onCambia(
                  preso ? scelti.filter((x) => x !== n.id) : [...scelti, n.id]
                )
              }
            />
            <span>{n.nome}</span>
          </label>
        )
      })}
    </div>
  )
}

export function Glossario() {
  const [dati, setDati] = useState<Dati>(VUOTO)
  const [sistema, setSistema] = useState<Sistema | null>(null)
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [giroDetto, setGiroDetto] = useState('')
  /**
   * La proposta che si sta correggendo prima di accettarla.
   *
   * ⚠️⚠️ Prima si poteva solo prendere o lasciare. Con una proposta giusta
   * all'80% — il fatto è quello, la frase no — l'unica strada era **scartarla**
   * e riscrivere la voce da capo: si buttava via anche la parte buona e la
   * prova, cioè la conversazione da cui nasce. E nella pratica vuol dire che
   * quelle proposte restavano lì.
   */
  const [correggo, setCorreggo] = useState<{
    id: string
    termine: string
    definizione: string
    categoria: string
    /** Il brand a cui la voce vale. Vuoto = tutti. */
    negoziIds: string[]
  } | null>(null)

  const [q, setQ] = useState('')
  const [filtroBrand, setFiltroBrand] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  // Il modulo: vuoto = nuova voce, con id = sto correggendo quella.
  const [id, setId] = useState('')
  const [termine, setTermine] = useState('')
  const [definizione, setDefinizione] = useState('')
  const [categoria, setCategoria] = useState('cliente')
  const [brands, setBrands] = useState<string[]>([])

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
    setBrands([])
  }

  const nomeBrand = (bid: string) => dati.negozi.find((n) => n.id === bid)?.nome ?? ''
  // I nomi per id, una volta sola: la lista si ridisegna a ogni tasto della
  // ricerca, e cercarli dentro il ciclo li rifarebbe cercare per ogni riga.
  const nomiPerId = useMemo(
    () => new Map(dati.negozi.map((n) => [n.id, n.nome])),
    [dati.negozi]
  )

  const visibili = useMemo(() => {
    const cerca = q.trim().toLowerCase()
    return dati.voci.filter((v) => {
      // ⚠️ Una voce di TUTTI i marchi compare anche filtrando su uno solo:
      // vale anche per lui, ed è proprio quello che chi filtra deve sapere
      // prima di rispondere a un suo cliente.
      if (filtroBrand === '__globali' ? !valePerTutti(v.negoziIds) : !valePer(v.negoziIds, filtroBrand))
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
                    {/* ⚠️ Solo su quello che si SCRIVE in glossario. Un
                        «avviso» è una cosa da sapere, non una voce: non c'è un
                        testo da correggere, e un bottone che lo promette
                        manderebbe a cercare un modulo che non serve. */}
                    {p.tipo !== 'avviso' ? (
                      <button
                        className="bottone secondario mini"
                        disabled={salvando}
                        onClick={() =>
                          setCorreggo(
                            correggo?.id === p.id
                              ? null
                              : {
                                  id: p.id,
                                  termine: p.termine,
                                  definizione: p.definizione,
                                  categoria: p.categoria,
                                  // ⚠️ Si parte da quello che l'AI ha proposto,
                                  // non da «tutti»: aprire la modifica non deve
                                  // allargare a tutti i marchi una voce nata per
                                  // uno solo, per il solo fatto di averla aperta.
                                  negoziIds: p.negozioId ? [p.negozioId] : [],
                                }
                          )
                        }
                        title="Correggi il testo prima di accettarlo: la proposta e la sua chat restano"
                      >
                        {correggo?.id === p.id ? 'Lascia stare' : 'Modifica'}
                      </button>
                    ) : null}
                    <button
                      className="bottone secondario mini"
                      disabled={salvando}
                      onClick={() => void manda({ azione: 'scarta', id: p.id })}
                    >
                      Scarta
                    </button>
                  </span>
                </div>
                {correggo?.id === p.id ? (
                  <div className="correggo-proposta">
                    <label className="campo">
                      <span>Termine</span>
                      <input
                        value={correggo.termine}
                        onChange={(e) => setCorreggo({ ...correggo, termine: e.target.value })}
                      />
                    </label>
                    <label className="campo">
                      <span>Che cosa si sa</span>
                      <textarea
                        rows={3}
                        value={correggo.definizione}
                        onChange={(e) => setCorreggo({ ...correggo, definizione: e.target.value })}
                        autoFocus
                      />
                    </label>
                    <label className="campo">
                      <span>A chi si può dire</span>
                      <select
                        value={correggo.categoria}
                        onChange={(e) => setCorreggo({ ...correggo, categoria: e.target.value })}
                      >
                        <option value="cliente">si può dire al cliente</option>
                        <option value="tecnico">interno</option>
                      </select>
                    </label>
                    {/* ── PER QUALE MARCHIO VALE ──
                        ⚠️⚠️ Il brand cambia il SENSO della voce, non la sua
                        forma: «la consegna è gratuita» è vera per un negozio e
                        falsa per un altro. Accettandola per tutti quando vale
                        per uno solo si mette in bocca agli operatori una
                        promessa sbagliata — e il glossario è fatto apposta
                        perché la ripetano.
                        ⚠️ Compare solo sulle AGGIUNTE: su una correzione la
                        voce esiste già col suo marchio, e cambiarlo qui la
                        sposterebbe di nascosto su un'altra. */}
                    {p.tipo === 'aggiunta' ? (
                      <label className="campo">
                        <span>Per quale marchio vale</span>
                        <ScegliMarchi
                          negozi={dati.negozi}
                          scelti={correggo.negoziIds}
                          onCambia={(ids) => setCorreggo({ ...correggo, negoziIds: ids })}
                        />
                      </label>
                    ) : p.negozioId ? (
                      // ⚠️ Qui il marchio si MOSTRA e basta. Su una CORREZIONE
                      // cambiarlo sposterebbe di nascosto la voce su un altro
                      // marchio (la chiave è termine+marchio); su un AVVISO non
                      // si scrive niente in glossario, quindi non c'è un marchio
                      // da scegliere. Il testo dice quale dei due è, invece di
                      // una frase che va bene per nessuno dei due.
                      <p className="cella-sub">
                        {p.tipo === 'correzione'
                          ? 'Corregge una voce di '
                          : 'Riguarda '}
                        <strong>{p.negozioNome || p.negozioId}</strong>
                        {p.tipo === 'correzione' ? ': il marchio resta il suo.' : '.'}
                      </p>
                    ) : null}
                    {/* ⚠️ Si dice che la proposta originale RESTA scritta: senza,
                        correggere sembra cancellare la prova, e chi ci tiene
                        preferisce scartare e riscrivere — cioè quello che
                        succedeva prima. */}
                    <p className="cella-sub">
                      Quello che aveva proposto l&apos;AI resta archiviato, e la voce risulterà
                      «proposta dall&apos;AI e corretta a mano»: è così che si vede se l&apos;AI
                      sta migliorando.
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="bottone mini"
                        disabled={salvando || !correggo.termine.trim() || !correggo.definizione.trim()}
                        onClick={() =>
                          void manda({
                            azione: 'accetta',
                            id: p.id,
                            termine: correggo.termine,
                            definizione: correggo.definizione,
                            categoria: correggo.categoria,
                            negoziIds: correggo.negoziIds,
                          }).then(() => setCorreggo(null))
                        }
                      >
                        Accetta così
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: '6px 0 0', fontSize: 14 }}>{p.definizione}</p>
                )}
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
              <ScegliMarchi negozi={dati.negozi} scelti={brands} onCambia={setBrands} />
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
              const ok = await manda({ id, termine, definizione, categoria, negoziIds: brands })
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
                <span className="badge">{marchiScritti(v.negoziIds, nomiPerId)}</span>
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
                      setBrands(v.negoziIds)
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
                {v.fonte === 'ai'
                  ? 'proposta dall’AI e accettata'
                  : v.fonte === 'ai-corretta'
                    ? 'proposta dall’AI e corretta a mano'
                    : 'scritta a mano'}
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
