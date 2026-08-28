'use client'

import { useCallback, useEffect, useState } from 'react'
import { nomeStato } from '@/lib/preventivi-stati'
import { ChipsPeriodo } from './ChipsPeriodo'
import { nelPeriodo, type Periodo } from '@/lib/periodo'

// I PREVENTIVI, a colonne per marchio come la bacheca degli ordini.
//
// ⚠️⚠️ Un preventivo non ha una data di consegna che lo renda urgente: la sua
// urgenza è **da quanto aspetta**. Per questo i più vecchi stanno in cima e ogni
// scheda dice da quanti giorni è fermo — ordinandoli per «ultimo arrivato», come
// si fa con la posta, si seppelliscono proprio quelli che stanno marcendo.

type Preventivo = {
  id: string
  negozioId: string
  negozioNome: string
  clienteNome: string
  email: string
  telefono: string
  richiesta: string
  occasione: string
  citta: string
  dataConsegna: string | null
  fasciaConsegna: string
  origine: string
  conversazioneId: string
  stato: string
  importo: number
  valuta: string
  bozzaNome: string
  linkPagamento: string
  ordineNumero: string
  validoFinoAl: string | null
  seguitoDaNome: string
  note: string
  creatoIl: string
  inviatoIl: string | null
  chiusoIl: string | null
  chiusoDaNome: string
  giorniFermo: number
}

type Colonna = {
  negozioId: string
  nome: string
  aperti: number
  daFare: number
  valoreInAttesa: number
}

type Negozio = { id: string; nome: string }

const VUOTO = {
  negozioId: '',
  clienteNome: '',
  email: '',
  telefono: '',
  richiesta: '',
  occasione: '',
  citta: '',
  dataConsegna: '',
  fasciaConsegna: '',
}

function soldi(v: number, valuta = 'EUR'): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/**
 * Da quanto aspetta.
 *
 * ⚠️ Oltre i 3 giorni si colora: un preventivo fermo non fa rumore da solo —
 * nessuno scrive «mi avevate detto che mi mandavate un prezzo», semplicemente
 * compra altrove.
 */
function Attesa({ giorni }: { giorni: number }) {
  if (giorni <= 0) return <span className="cella-sub">oggi</span>
  return (
    <span className="cella-sub" style={{ color: giorni >= 3 ? 'var(--red)' : undefined }}>
      da {giorni} giorn{giorni === 1 ? 'o' : 'i'}
    </span>
  )
}

export function PreventiviLista() {
  const [preventivi, setPreventivi] = useState<Preventivo[]>([])
  const [colonne, setColonne] = useState<Colonna[]>([])
  const [negozi, setNegozi] = useState<Negozio[]>([])
  const [aperti, setAperti] = useState(0)
  const [daFare, setDaFare] = useState(0)
  const [valore, setValore] = useState(0)
  const [caricato, setCaricato] = useState(false)
  const [stato, setStato] = useState('aperti')
  const [marchio, setMarchio] = useState('')
  // La ricerca (Libro v1.9 §8-bis): la fa il SERVER (`/api/preventivi?q=`, che
  // esisteva già senza casella), con la solita attesa per non chiamare a ogni
  // tasto. Il periodo invece si filtra in memoria, sulla DATA DI APERTURA del
  // preventivo (`creatoIl`): le righe arrivano già tutte (tetto 300).
  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('')
  const [formAperto, setFormAperto] = useState(false)
  const [bozza, setBozza] = useState(VUOTO)
  const [prezzoDi, setPrezzoDi] = useState('')
  const [prezzo, setPrezzo] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [validita, setValidita] = useState('7')
  const [errore, setErrore] = useState('')
  const [avviso, setAvviso] = useState('')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams({ stato })
      if (marchio) p.set('negozio', marchio)
      if (qCercata) p.set('q', qCercata)
      const res = await fetch(`/api/preventivi?${p}`, { cache: 'no-store' })
      const d = (await res.json().catch(() => ({}))) as {
        preventivi?: Preventivo[]
        perMarchio?: Colonna[]
        aperti?: number
        daFare?: number
        valoreInAttesa?: number
      }
      setPreventivi(d.preventivi ?? [])
      setColonne(d.perMarchio ?? [])
      setAperti(d.aperti ?? 0)
      setDaFare(d.daFare ?? 0)
      setValore(d.valoreInAttesa ?? 0)
      setNegozi((d.perMarchio ?? []).filter((c) => c.negozioId).map((c) => ({ id: c.negozioId, nome: c.nome })))
    } catch {
      setErrore('Elenco non caricato: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [stato, marchio, qCercata])

  useEffect(() => {
    void carica()
  }, [carica])

  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  async function salvaNuovo() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/preventivi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bozza),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Preventivo non salvato.')
        return
      }
      setBozza(VUOTO)
      setFormAperto(false)
      setAvviso('Preventivo aperto: ora va preparato il prezzo.')
      await carica()
    } catch {
      setErrore('Preventivo non salvato: problema di rete.')
    }
  }

  async function invia(id: string) {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch(`/api/preventivi/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          azione: 'invia',
          importo: Number(prezzo.replace(',', '.')),
          descrizione,
          giorniValidita: Number(validita),
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string; nota?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Bozza non creata.')
        return
      }
      setPrezzoDi('')
      setPrezzo('')
      setDescrizione('')
      setAvviso(d.nota || 'Bozza creata.')
      await carica()
    } catch {
      setErrore('Bozza non creata: problema di rete.')
    }
  }

  async function chiudi(id: string, nuovoStato: string) {
    setErrore('')
    try {
      const res = await fetch(`/api/preventivi/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione: 'chiudi', stato: nuovoStato }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Non salvato.')
        return
      }
      await carica()
    } catch {
      setErrore('Non salvato: problema di rete.')
    }
  }

  async function cambiaMarchio(id: string, negozioId: string) {
    await fetch(`/api/preventivi/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'aggiorna', negozioId }),
    })
    await carica()
  }

  const daMostrare = colonne.filter((c) => !marchio || c.negozioId === marchio)
  // Il periodo, in memoria: sulla data di apertura del preventivo.
  // ⚠️ I contatori delle testate di colonna arrivano dal server e raccontano
  // l'archivio, non il periodo scelto: contano gli aperti, come sempre.
  const visibili = periodo ? preventivi.filter((p) => nelPeriodo(p.creatoIl, periodo)) : preventivi

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Preventivi</h1>
          <p className="page-sub">
            Le richieste di prezzo che <strong>non sono ancora ordini</strong>, per marchio. Il
            preventivo si manda come <strong>bozza con link di pagamento</strong>: diventa un
            ordine solo quando il cliente paga, e allora arriva in bacheca dal giro normale.
          </p>
        </div>
        <button className="btn" onClick={() => setFormAperto(true)}>
          Nuovo preventivo
        </button>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore" style={{ color: daFare ? '#c93400' : undefined }}>
            {daFare}
          </div>
          <div className="kpi-etichetta">Da preparare</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{aperti}</div>
          <div className="kpi-etichetta">Aperti in tutto</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{soldi(valore)}</div>
          {/* ⚠️ È il valore dei preventivi MANDATI e non ancora chiusi: quello che
              stiamo aspettando. Sommarci anche quelli da preparare — che non
              hanno un prezzo — vorrebbe dire contare zero come se fosse un dato. */}
          <div className="kpi-etichetta">In attesa di risposta</div>
        </div>
      </div>

      {/* La ricerca (Libro v1.9 §8-bis): come si riconosce un preventivo —
          il cliente, il contatto, la richiesta o la città. */}
      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per cliente, email, telefono, richiesta o città…"
          aria-label="Cerca preventivi"
        />
      </div>

      {/* Le scorciatoie di periodo (Libro v1.9 §8-bis): sulla data di apertura
          del preventivo. */}
      <ChipsPeriodo valore={periodo} cambia={setPeriodo} campo="la data di apertura del preventivo" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { v: 'aperti', n: 'Aperti' },
          { v: 'da_fare', n: 'Da preparare' },
          { v: 'inviato', n: 'Inviati' },
          { v: 'accettato', n: 'Accettati' },
          { v: 'tutti', n: 'Tutti' },
        ].map((s) => (
          <button
            key={s.v}
            className={`btn ${stato === s.v ? '' : 'btn-secondario'} small`}
            onClick={() => setStato(s.v)}
          >
            {s.n}
          </button>
        ))}
        {marchio ? (
          <button className="btn btn-secondario small" onClick={() => setMarchio('')}>
            Tutti i marchi
          </button>
        ) : null}
      </div>

      {formAperto ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Nuovo preventivo</h2>
          <label className="campo">
            <span>Che cosa ha chiesto</span>
            {/* ⚠️ Con parole SUE, non riassunto: chi prepara il prezzo tre ore
                dopo deve leggere la domanda vera, non l'interpretazione di chi
                l'ha raccolta. */}
            <textarea
              rows={3}
              value={bozza.richiesta}
              onChange={(e) => setBozza({ ...bozza, richiesta: e.target.value })}
              placeholder="«Vorrei un bouquet importante di rose bianche per un anniversario, consegna a Como sabato pomeriggio»"
            />
          </label>
          <div className="campi-affiancati">
            <label className="campo">
              <span>Marchio</span>
              <select
                value={bozza.negozioId}
                onChange={(e) => setBozza({ ...bozza, negozioId: e.target.value })}
              >
                <option value="">Non ancora deciso</option>
                {negozi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Cliente</span>
              <input
                value={bozza.clienteNome}
                onChange={(e) => setBozza({ ...bozza, clienteNome: e.target.value })}
              />
            </label>
          </div>
          <div className="campi-affiancati">
            <label className="campo">
              <span>Telefono</span>
              <input
                value={bozza.telefono}
                onChange={(e) => setBozza({ ...bozza, telefono: e.target.value })}
              />
            </label>
            <label className="campo">
              <span>Email</span>
              <input
                type="email"
                value={bozza.email}
                onChange={(e) => setBozza({ ...bozza, email: e.target.value })}
              />
            </label>
          </div>
          <div className="campi-affiancati">
            <label className="campo">
              <span>Città di consegna</span>
              <input
                value={bozza.citta}
                onChange={(e) => setBozza({ ...bozza, citta: e.target.value })}
              />
            </label>
            <label className="campo">
              <span>Quando</span>
              <input
                type="date"
                value={bozza.dataConsegna}
                onChange={(e) => setBozza({ ...bozza, dataConsegna: e.target.value })}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => void salvaNuovo()}>
              Apri il preventivo
            </button>
            <button className="btn btn-secondario" onClick={() => setFormAperto(false)}>
              Annulla
            </button>
          </div>
        </div>
      ) : null}

      {!caricato ? (
        <p className="colonna-vuota">Carico…</p>
      ) : visibili.length === 0 && (qCercata || periodo) ? (
        <p className="colonna-vuota">Nessun preventivo corrisponde ai filtri.</p>
      ) : preventivi.length === 0 && stato === 'aperti' ? (
        <p className="colonna-vuota">
          Nessun preventivo aperto. Quando un cliente chiede un prezzo, aprilo qui: è l&apos;unico
          modo perché quella domanda non si perda con la conversazione.
        </p>
      ) : (
        <div className="colonne-brand">
          {daMostrare.map((c) => {
            const suoi = visibili.filter((p) => p.negozioId === c.negozioId)
            return (
              <div className="colonna" key={c.negozioId || 'senza'}>
                <div className="colonna-testata">
                  <span className="pallino" aria-hidden="true" />
                  <span className="nome">{c.nome}</span>
                  <span className="conteggio">{c.aperti}</span>
                </div>
                <div className="colonna-valore">
                  {c.daFare} da preparare · {soldi(c.valoreInAttesa)} in attesa
                </div>

                {suoi.length === 0 ? (
                  <p className="colonna-vuota">Nessuno.</p>
                ) : (
                  suoi.map((p) => (
                    <div className="scheda-ordine" key={p.id}>
                      <div className="riga-alta">
                        <strong>{p.clienteNome || p.telefono || p.email || 'senza nome'}</strong>
                        <span>
                          {p.importo > 0 ? soldi(p.importo, p.valuta) : 'da quotare'}
                        </span>
                      </div>
                      {p.citta || p.occasione ? (
                        <div className="cliente">
                          {[p.citta, p.occasione].filter(Boolean).join(' · ')}
                        </div>
                      ) : null}
                      {p.dataConsegna ? (
                        <div className="consegna-riga">
                          consegna {dataBreve(p.dataConsegna)}
                          {p.fasciaConsegna ? ` · ore ${p.fasciaConsegna}` : ''}
                        </div>
                      ) : null}

                      <p className="preventivo-richiesta">{p.richiesta}</p>

                      <div className="riga-bassa">
                        <span className={`badge${p.stato === 'accettato' ? ' verde' : ''}`}>
                          {nomeStato(p.stato)}
                        </span>
                        {p.stato === 'da_fare' || p.stato === 'inviato' ? (
                          <Attesa giorni={p.giorniFermo} />
                        ) : null}
                        {p.origine && p.origine !== 'manuale' ? (
                          <span className="cella-sub">{p.origine}</span>
                        ) : null}
                        {p.bozzaNome ? <span className="cella-sub">bozza {p.bozzaNome}</span> : null}
                        {p.ordineNumero ? (
                          <span className="cella-sub">ordine {p.ordineNumero}</span>
                        ) : null}
                      </div>

                      {/* Il marchio si può ancora scegliere: molte richieste
                          arrivano prima che si sappia a quale brand rispondere. */}
                      {!p.negozioId && p.stato === 'da_fare' ? (
                        <select
                          value=""
                          onChange={(e) => e.target.value && void cambiaMarchio(p.id, e.target.value)}
                          style={{ marginTop: 6 }}
                        >
                          <option value="">Scegli il marchio…</option>
                          {negozi.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.nome}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {p.linkPagamento ? (
                        <div className="preventivo-link">
                          <input readOnly value={p.linkPagamento} />
                          <div className="azioni-ordine">
                            <button
                              className="bottone mini"
                              onClick={() => void navigator.clipboard?.writeText(p.linkPagamento)}
                            >
                              Copia
                            </button>
                            {p.telefono ? (
                              <a
                                className="bottone mini"
                                href={`https://wa.me/${p.telefono.replace(/[^\d]/g, '')}?text=${encodeURIComponent(p.linkPagamento)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                WhatsApp
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {p.stato === 'da_fare' || p.stato === 'inviato' ? (
                        <div className="azioni-ordine">
                          <div className="gruppo">
                            {p.stato === 'da_fare' ? (
                              <button
                                className="bottone mini"
                                onClick={() => {
                                  setPrezzoDi(prezzoDi === p.id ? '' : p.id)
                                  setDescrizione(p.richiesta.slice(0, 80))
                                }}
                              >
                                Prepara il prezzo
                              </button>
                            ) : null}
                            {p.conversazioneId ? (
                              <a
                                className="bottone mini"
                                href={`/inbox?c=${encodeURIComponent(p.conversazioneId)}`}
                              >
                                Conversazione
                              </a>
                            ) : null}
                          </div>
                          <div className="gruppo">
                            <button className="bottone mini" onClick={() => void chiudi(p.id, 'accettato')}>
                              Accettato
                            </button>
                            <button className="bottone mini" onClick={() => void chiudi(p.id, 'rifiutato')}>
                              Rifiutato
                            </button>
                            <button className="bottone mini" onClick={() => void chiudi(p.id, 'scaduto')}>
                              Scaduto
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="cella-sub">
                          {nomeStato(p.stato)}
                          {p.chiusoIl ? ` il ${dataBreve(p.chiusoIl)}` : ''}
                          {p.chiusoDaNome ? ` · ${p.chiusoDaNome}` : ''}
                        </div>
                      )}

                      {prezzoDi === p.id ? (
                        <div className="preventivo-prezzo">
                          <label className="campo">
                            <span>Descrizione che vedrà il cliente</span>
                            <input
                              value={descrizione}
                              onChange={(e) => setDescrizione(e.target.value)}
                            />
                          </label>
                          <div className="campi-affiancati">
                            <label className="campo">
                              <span>Prezzo (€)</span>
                              <input
                                inputMode="decimal"
                                value={prezzo}
                                onChange={(e) => setPrezzo(e.target.value)}
                                placeholder="450"
                              />
                            </label>
                            <label className="campo">
                              <span>Valido per (giorni)</span>
                              {/* ⚠️ Un prezzo senza scadenza diventa un impegno
                                  eterno: il cliente ripesca il link di marzo a
                                  novembre e si aspetta lo stesso prezzo. */}
                              <input
                                inputMode="numeric"
                                value={validita}
                                onChange={(e) => setValidita(e.target.value)}
                              />
                            </label>
                          </div>
                          <button className="btn small" onClick={() => void invia(p.id)}>
                            Crea la bozza e il link
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
