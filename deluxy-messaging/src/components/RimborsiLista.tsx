'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  STATI_RIMBORSO,
  avvisoPagamento,
  coloreStatoRimborso,
  nomeStatoRimborso,
  soldi,
} from '@/lib/rimborsi'

// Le richieste di rimborso. Questa pagina NON rimborsa: registra chi lo ha
// chiesto, chi lo ha approvato e come è stato reso. I soldi li muove una
// persona, da Shopify o dalla banca.

type Rimborso = {
  id: string
  ordineId: string
  ordineNumero: string
  negozioNome: string
  clienteNome: string
  importoOrdine: number
  importo: number
  valuta: string
  tipo: string
  motivo: string
  stato: string
  richiestoDa: string
  decisoDa: string
  esito: string
  creatoIl: string
}

export type PrefillRimborso = {
  ordineId?: string
  ordineNumero?: string
  negozioNome?: string
  clienteNome?: string
  telefono?: string
  email?: string
  importoOrdine?: string
  statoPagamento?: string
}

const VUOTO = {
  id: '',
  ordineId: '',
  ordineNumero: '',
  negozioNome: '',
  clienteNome: '',
  telefono: '',
  email: '',
  importoOrdine: 0,
  importo: '',
  motivo: '',
  note: '',
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function RimborsiLista({ prefill }: { prefill?: PrefillRimborso }) {
  const [rimborsi, setRimborsi] = useState<Rimborso[]>([])
  const [perStato, setPerStato] = useState<Record<string, { conteggio: number; importo: number }>>({})
  const [importoDaPagare, setImportoDaPagare] = useState(0)
  const [caricato, setCaricato] = useState(false)
  const [bozza, setBozza] = useState<typeof VUOTO>(VUOTO)
  const [formAperto, setFormAperto] = useState(false)
  const [avvisoPag, setAvvisoPag] = useState('')
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('')
  const [filtroStato, setFiltroStato] = useState('aperti')

  // Riga in cui si sta scrivendo l'esito prima di segnare "rimborsato".
  const [esitoDi, setEsitoDi] = useState('')
  const [testoEsito, setTestoEsito] = useState('')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (filtroStato) p.set('stato', filtroStato)
      const res = await fetch('/api/rimborsi?' + p.toString())
      if (!res.ok) return
      const d = (await res.json()) as {
        rimborsi: Rimborso[]
        perStato: Record<string, { conteggio: number; importo: number }>
        importoDaPagare: number
      }
      setRimborsi(d.rimborsi)
      setPerStato(d.perStato)
      setImportoDaPagare(d.importoDaPagare)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [qCercata, filtroStato])

  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    carica()
  }, [carica])

  // Arrivando dal pulsante "Rimborso" di un ordine, il modulo si apre già pieno.
  useEffect(() => {
    if (prefill && (prefill.ordineNumero || prefill.ordineId)) {
      const totale = Number(prefill.importoOrdine) || 0
      setBozza({
        ...VUOTO,
        ordineId: prefill.ordineId ?? '',
        ordineNumero: prefill.ordineNumero ?? '',
        negozioNome: prefill.negozioNome ?? '',
        clienteNome: prefill.clienteNome ?? '',
        telefono: prefill.telefono ?? '',
        email: prefill.email ?? '',
        importoOrdine: totale,
        // Si propone il rimborso TOTALE, che è il caso più frequente, ma resta
        // scritto in un campo modificabile: niente parte da solo.
        importo: totale ? String(totale) : '',
      })
      setAvvisoPag(avvisoPagamento(prefill.statoPagamento ?? ''))
      setFormAperto(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function salva() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/rimborsi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bozza,
          id: bozza.id || undefined,
          importo: Number(bozza.importo),
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Richiesta non salvata.')
        return
      }
      setAvviso('Rimborso richiesto. Ora va approvato da qualcuno.')
      setBozza(VUOTO)
      setFormAperto(false)
      setAvvisoPag('')
      await carica()
    } catch {
      setErrore('Richiesta non salvata: problema di rete.')
    }
  }

  async function cambiaStato(id: string, stato: string, esito?: string) {
    setErrore('')
    try {
      const res = await fetch(`/api/rimborsi/${id}/stato`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato, esito }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Stato non salvato.')
        return
      }
      setEsitoDi('')
      setTestoEsito('')
      await carica()
    } catch {
      setErrore('Stato non salvato: problema di rete.')
    }
  }

  async function elimina(id: string) {
    await fetch('/api/rimborsi?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  const daApprovare = perStato['richiesto']?.conteggio ?? 0
  const approvati = perStato['approvato']?.conteggio ?? 0
  const eseguiti = perStato['eseguito'] ?? { conteggio: 0, importo: 0 }
  const filtriAttivi = !!(qCercata || filtroStato !== 'aperti')

  // Quanto resta rimborsabile sull'ordine in bozza (solo indicativo: il tetto
  // vero lo ricontrolla il server, che vede anche le altre richieste).
  const residuo = bozza.importoOrdine
  const chiesto = Number(bozza.importo) || 0

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Rimborsi</h1>
          <p className="page-sub">
            Le richieste di rimborso sugli ordini. Qui si chiede e si approva;{' '}
            <strong>i soldi non escono da quest’app</strong>: il rimborso lo fa una persona su
            Shopify o in banca, e poi lo si segna come fatto.
          </p>
        </div>
        <button
          className="btn"
          onClick={() => {
            setBozza(VUOTO)
            setAvvisoPag('')
            setFormAperto(true)
          }}
        >
          Nuovo rimborso
        </button>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="kpi-riga" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#c93400' }}>
            {daApprovare}
          </div>
          <div className="kpi-etichetta">Da approvare</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#0071e3' }}>
            {approvati}
          </div>
          <div className="kpi-etichetta">Approvati, da pagare</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{soldi(importoDaPagare)}</div>
          <div className="kpi-etichetta">Promesso e non ancora uscito</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#248a3d' }}>
            {soldi(eseguiti.importo)}
          </div>
          <div className="kpi-etichetta">Rimborsato ({eseguiti.conteggio})</div>
        </div>
      </div>

      {formAperto ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>{bozza.id ? 'Modifica richiesta' : 'Chiedi un rimborso'}</h2>

          {/* Quello che Shopify dice del pagamento: non blocca, avvisa. */}
          {avvisoPag ? <div className="avviso-errore">{avvisoPag}</div> : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Ordine</span>
              <input
                value={bozza.ordineNumero}
                onChange={(e) => setBozza({ ...bozza, ordineNumero: e.target.value })}
                placeholder="#1042"
              />
            </label>
            <label className="campo">
              <span>Cliente</span>
              <input
                value={bozza.clienteNome}
                onChange={(e) => setBozza({ ...bozza, clienteNome: e.target.value })}
                placeholder="Mario Rossi"
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Importo da rimborsare</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bozza.importo}
                onChange={(e) => setBozza({ ...bozza, importo: e.target.value })}
                placeholder="0,00"
              />
            </label>
            <div className="campo">
              <span>Valore dell&apos;ordine</span>
              <div style={{ padding: '9px 0', fontSize: 15 }}>
                {residuo ? soldi(residuo) : '—'}
                {residuo && chiesto > 0 ? (
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {' '}
                    · {chiesto >= residuo ? 'rimborso totale' : 'rimborso parziale'}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {residuo > 0 && chiesto > residuo ? (
            <p className="descrizione" style={{ color: 'var(--red)', marginTop: -4 }}>
              Stai chiedendo più del valore dell&apos;ordine: non si può rendere più di quanto
              incassato.
            </p>
          ) : null}

          <label className="campo">
            <span>Perché si rimborsa</span>
            <textarea
              rows={3}
              value={bozza.motivo}
              onChange={(e) => setBozza({ ...bozza, motivo: e.target.value })}
              placeholder="Consegna mai arrivata, fiori appassiti, ordine doppio…"
            />
          </label>
          {bozza.importoOrdine > 0 && !bozza.motivo.trim() ? (
            <p className="descrizione" style={{ marginTop: -4 }}>
              Serve: un rimborso senza motivo scritto è impossibile da spiegare fra sei mesi.
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={salva}
              disabled={!bozza.motivo.trim() || !(Number(bozza.importo) > 0)}
            >
              Chiedi il rimborso
            </button>
            <button
              className="btn btn-secondario"
              onClick={() => {
                setFormAperto(false)
                setBozza(VUOTO)
                setAvvisoPag('')
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}

      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per ordine, cliente o motivo…"
          aria-label="Cerca rimborsi"
        />
        <select
          value={filtroStato}
          onChange={(e) => setFiltroStato(e.target.value)}
          aria-label="Stato"
        >
          <option value="aperti">Da lavorare</option>
          <option value="">Tutti gli stati</option>
          {STATI_RIMBORSO.map((s) => (
            <option key={s.chiave} value={s.chiave}>
              Solo: {s.nome}
            </option>
          ))}
        </select>
        {filtriAttivi ? (
          <button
            className="bottone secondario"
            onClick={() => {
              setQ('')
              setFiltroStato('aperti')
            }}
          >
            Azzera
          </button>
        ) : null}
      </div>

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : rimborsi.length === 0 ? (
        <div className="vuoto">
          {filtriAttivi
            ? 'Nessun rimborso corrisponde ai filtri.'
            : 'Nessun rimborso da lavorare. Se ne apre uno dal pulsante “Rimborso” su un ordine.'}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Ordine</th>
                <th className="num">Importo</th>
                <th>Motivo</th>
                <th>Stato</th>
                <th>Chiesto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rimborsi.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cella-nome">{r.ordineNumero || '—'}</div>
                    <div className="cella-sub">
                      {r.clienteNome || '—'}
                      {r.negozioNome ? ` · ${r.negozioNome}` : ''}
                    </div>
                  </td>
                  <td className="cella-num">
                    <div style={{ fontWeight: 600 }}>{soldi(r.importo, r.valuta)}</div>
                    <div className="cella-sub">
                      {r.tipo === 'totale' ? 'totale' : `su ${soldi(r.importoOrdine, r.valuta)}`}
                    </div>
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 280 }}>
                    {r.motivo.length > 110 ? r.motivo.slice(0, 110) + '…' : r.motivo}
                    {r.esito ? <div className="cella-sub">Esito: {r.esito}</div> : null}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{ color: coloreStatoRimborso(r.stato), fontWeight: 600 }}
                    >
                      {nomeStatoRimborso(r.stato)}
                    </span>
                    {r.decisoDa ? <div className="cella-sub">da {r.decisoDa}</div> : null}
                  </td>
                  <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                    {dataBreve(r.creatoIl)}
                    {r.richiestoDa ? <div className="cella-sub">da {r.richiestoDa}</div> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {esitoDi === r.id ? (
                      <>
                        <input
                          value={testoEsito}
                          onChange={(e) => setTestoEsito(e.target.value)}
                          placeholder="Come è stato reso"
                          style={{
                            padding: '5px 10px',
                            border: '1px solid var(--hairline)',
                            borderRadius: 8,
                            marginRight: 6,
                            width: 190,
                          }}
                        />
                        <button
                          className="btn small"
                          onClick={() => cambiaStato(r.id, 'eseguito', testoEsito)}
                          disabled={!testoEsito.trim()}
                        >
                          Conferma
                        </button>{' '}
                        <button
                          className="btn btn-secondario small"
                          onClick={() => setEsitoDi('')}
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <>
                        {r.stato === 'richiesto' ? (
                          <>
                            <button
                              className="btn small"
                              onClick={() => cambiaStato(r.id, 'approvato')}
                            >
                              Approva
                            </button>{' '}
                            <button
                              className="btn btn-secondario small"
                              onClick={() => cambiaStato(r.id, 'rifiutato')}
                            >
                              Rifiuta
                            </button>{' '}
                          </>
                        ) : null}
                        {r.stato === 'approvato' ? (
                          <button
                            className="btn small"
                            onClick={() => {
                              setEsitoDi(r.id)
                              setTestoEsito(r.esito)
                            }}
                            title="Segna che il rimborso è stato fatto davvero"
                          >
                            Segna rimborsato
                          </button>
                        ) : null}{' '}
                        <button
                          className="btn btn-secondario small"
                          style={{ color: 'var(--red)' }}
                          onClick={() => elimina(r.id)}
                        >
                          Elimina
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
