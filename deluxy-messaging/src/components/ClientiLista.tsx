'use client'

import { useCallback, useEffect, useState } from 'react'

// Stessa grafica della pagina Clienti di Deluxy Orders (page-head, KPI, ricerca
// a pillola, pillole di ordinamento, tabella): le due app sono gemelle e
// devono somigliarsi.

type ClienteDto = {
  chiave: string
  nome: string
  telefono: string
  email: string
  citta: string
  negozi: string[]
  ordini: number
  speso: number
  ultimoNumero: string
  ultimaData: string
  inRubrica: boolean
}

const ORDINAMENTI = [
  { chiave: 'speso', nome: 'Più spesa' },
  { chiave: 'ordini', nome: 'Più ordini' },
  { chiave: 'recenti', nome: 'Più recenti' },
  { chiave: 'nome', nome: 'Nome' },
]

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' })
}

function euro(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

export function ClientiLista() {
  const [clienti, setClienti] = useState<ClienteDto[]>([])
  const [totale, setTotale] = useState(0)
  const [inRubrica, setInRubrica] = useState(0)
  const [spesoTotale, setSpesoTotale] = useState(0)
  const [googleCollegato, setGoogleCollegato] = useState(false)
  const [caricato, setCaricato] = useState(false)
  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('')
  const [ordina, setOrdina] = useState('recenti')
  const [soloDaSalvare, setSoloDaSalvare] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (soloDaSalvare) p.set('rubrica', 'no')
      p.set('ordina', ordina)
      const res = await fetch('/api/clienti?' + p.toString())
      if (!res.ok) return
      const d = (await res.json()) as {
        clienti: ClienteDto[]
        totale: number
        inRubrica: number
        spesoTotale: number
        googleCollegato: boolean
      }
      setClienti(d.clienti)
      setTotale(d.totale)
      setInRubrica(d.inRubrica)
      setSpesoTotale(d.spesoTotale)
      setGoogleCollegato(d.googleCollegato)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [qCercata, soloDaSalvare, ordina])

  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    carica()
  }, [carica])

  async function salvaTuttiInRubrica() {
    setOccupato(true)
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/ordini/contatti-tutti', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        aggiunti?: number
        aggiornati?: number
        presenti?: number
        rimasti?: number
        errore?: string
      }
      if (!res.ok) setErrore(d.errore || 'Operazione non riuscita.')
      else
        setAvviso(
          `Rubrica: ${d.aggiunti ?? 0} aggiunti, ${d.aggiornati ?? 0} aggiornati, ${d.presenti ?? 0} già presenti` +
            (d.rimasti ? ` — ne restano ${d.rimasti}, ripremi per continuare.` : '.')
        )
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato(false)
    }
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Clienti</h1>
          <p className="page-sub">
            Chi ha ordinato, ricavato dagli ordini: un cliente per telefono (o email), con tutti i
            suoi ordini in un posto solo.
          </p>
        </div>
        <button
          className="btn"
          onClick={salvaTuttiInRubrica}
          disabled={occupato || !googleCollegato}
          title={googleCollegato ? '' : 'Collega Google Contacts nelle Impostazioni'}
        >
          {occupato ? 'Salvo…' : 'Porta tutti in rubrica Google'}
        </button>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.toLocaleString('it-IT')}</div>
          <div className="kpi-etichetta">{qCercata ? 'Clienti trovati' : 'Clienti totali'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(spesoTotale)}</div>
          <div className="kpi-etichetta">Valore totale</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{inRubrica.toLocaleString('it-IT')}</div>
          <div className="kpi-etichetta">In rubrica Google</div>
        </div>
      </div>

      <div className="ricerca">
        <span className="ricerca-icona" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un cliente: nome, email, telefono, città…"
          aria-label="Cerca clienti"
        />
        {q ? (
          <button className="btn btn-secondario" onClick={() => setQ('')}>
            Annulla
          </button>
        ) : null}
      </div>

      <div className="filtri">
        <span className="etichetta-ordina">Ordina per</span>
        {ORDINAMENTI.map((o) => (
          <button
            key={o.chiave}
            className={`stato-pill${ordina === o.chiave ? ' attuale' : ''}`}
            onClick={() => setOrdina(o.chiave)}
          >
            {o.nome}
          </button>
        ))}
        <span className="etichetta-ordina" style={{ marginLeft: 8 }}>
          Rubrica
        </span>
        <button
          className={`stato-pill${!soloDaSalvare ? ' attuale' : ''}`}
          onClick={() => setSoloDaSalvare(false)}
        >
          Tutti
        </button>
        <button
          className={`stato-pill${soloDaSalvare ? ' attuale' : ''}`}
          onClick={() => setSoloDaSalvare(true)}
        >
          Da salvare
        </button>
      </div>

      {!googleCollegato && caricato ? (
        <div className="avviso-errore">
          Google Contacts non è collegato: vai in Impostazioni → Google Contacts per collegarlo.
        </div>
      ) : null}
      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : clienti.length === 0 ? (
        <div className="vuoto">
          {qCercata
            ? `Nessun cliente per «${qCercata}».`
            : 'Nessun cliente: scarica prima gli ordini da Shopify.'}
        </div>
      ) : (
        <>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contatti</th>
                  <th>Negozi</th>
                  <th className="num">Ordini</th>
                  <th className="num">Speso</th>
                  <th>Ultimo</th>
                  <th>Rubrica</th>
                </tr>
              </thead>
              <tbody>
                {clienti.map((c) => (
                  <tr key={c.chiave}>
                    <td>
                      <div className="cella-nome">{c.nome || c.telefono || c.email || '—'}</div>
                      {c.citta ? <div className="cella-sub">{c.citta}</div> : null}
                    </td>
                    <td className="cella-muta">
                      {c.email ? <div>{c.email}</div> : null}
                      {c.telefono ? <div className="cella-sub">{c.telefono}</div> : null}
                      {!c.email && !c.telefono ? '—' : null}
                    </td>
                    <td>
                      <span className="etichette">
                        {c.negozi.map((n) => (
                          <span key={n} className="tag">
                            <span className="dot" style={{ color: 'var(--gold)' }} />
                            <span className="tag-label">{n}</span>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="cella-num">{c.ordini.toLocaleString('it-IT')}</td>
                    <td className="cella-num">{euro(c.speso)}</td>
                    <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                      {c.ultimoNumero} · {dataBreve(c.ultimaData)}
                    </td>
                    <td>
                      {c.inRubrica ? (
                        <span className="badge verde">salvato</span>
                      ) : (
                        <span className="badge">da salvare</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="paginazione">
            <span>
              {totale.toLocaleString('it-IT')} clienti
              {totale > clienti.length ? ` · mostrati i primi ${clienti.length}` : ''}
            </span>
          </div>
        </>
      )}
    </main>
  )
}
