'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// Il diario di lavoro: le righe che ci si scrive per ricordare cosa c'è da fare
// su un ordine.
//
// ⚠️ Si scrive come sul quaderno di prima — «12562 da fare 16 luglio» — e il
// numero d'ordine viene staccato da solo: chiedere due campi invece di uno
// vorrebbe dire che le righe si continuano a scrivere altrove.

export type NotaDiario = {
  id: string
  ordineNumero: string
  /** La chat da cui la nota e nata, e di chi era: vedi lo schema. */
  conversazioneId: string
  conversazioneChi: string
  testo: string
  fatta: boolean
  fattaIl: string | null
  autoreNome: string
  fattaDaNome: string
  creatoIl: string
}

function quando(iso: string): string {
  const d = new Date(iso)
  const oggi = new Date()
  const stessoGiorno = d.toDateString() === oggi.toDateString()
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (stessoGiorno) return ora
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · ${ora}`
}

type OrdineAperto = {
  numero: string
  clienteNome: string
  negozioNome: string
  dataConsegna: string | null
  fasciaConsegna: string
  note: number
}

/** «oggi», «domani», «16 lug»: come si dice una consegna in due parole. */
function consegnaBreve(iso: string | null): string {
  if (!iso) return 'senza data'
  const d = new Date(iso)
  const giorni = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) /
      86400000
  )
  if (giorni === 0) return 'oggi'
  if (giorni === 1) return 'domani'
  if (giorni < 0) return `scaduta da ${-giorni}g`
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

export function Diario() {
  const [note, setNote] = useState<NotaDiario[]>([])
  const [aperte, setAperte] = useState(0)
  const [stato, setStato] = useState<'aperte' | 'fatte' | 'tutte'>('aperte')
  const [q, setQ] = useState('')
  const [testo, setTesto] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  /** Gli ordini aperti da suggerire sopra il campo. */
  const [ordiniAperti, setOrdiniAperti] = useState<OrdineAperto[]>([])
  const [soloScoperti, setSoloScoperti] = useState(false)
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const p = new URLSearchParams({ stato })
    if (q.trim()) p.set('q', q.trim())
    const res = await fetch('/api/diario?' + p.toString())
    if (!res.ok) return
    const d = (await res.json()) as { note: NotaDiario[]; aperte: number }
    setNote(d.note)
    setAperte(d.aperte)
    setCaricato(true)
  }, [stato, q])

  useEffect(() => {
    void carica()
  }, [carica])

  // Gli ordini aperti: si rileggono quando cambia il diario, perché il numero
  // di note per ordine cambia insieme.
  useEffect(() => {
    fetch('/api/diario/ordini')
      .then((r) => (r.ok ? r.json() : { ordini: [] }))
      .then((d: { ordini?: OrdineAperto[] }) => setOrdiniAperti(d.ordini ?? []))
      .catch(() => setOrdiniAperti([]))
  }, [note])

  async function aggiungi() {
    const riga = testo.trim()
    if (!riga) return
    setErrore('')
    const res = await fetch('/api/diario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testo: riga }),
    })
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      setErrore(d.errore || 'Riga non salvata.')
      return
    }
    setTesto('')
    await carica()
  }

  async function segna(n: NotaDiario, fatta: boolean) {
    await fetch(`/api/diario/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fatta }),
    })
    await carica()
  }

  async function cancella(n: NotaDiario) {
    if (!window.confirm(`Cancello «${n.testo.slice(0, 60)}»?`)) return
    await fetch(`/api/diario/${n.id}`, { method: 'DELETE' })
    await carica()
  }

  return (
    <>
      <div className="testa-pagina">
        <h1>Diario</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge">{aperte} da fare</span>
          <select value={stato} onChange={(e) => setStato(e.target.value as typeof stato)}>
            <option value="aperte">Da fare</option>
            <option value="fatte">Fatte</option>
            <option value="tutte">Tutte</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca nel diario…"
            aria-label="Cerca nel diario"
          />
        </div>
      </div>

      {/* ⚠️ Un campo solo, e si scrive come si è sempre scritto: «12562 da fare
          16 luglio». Il numero d'ordine si stacca da solo — chiedere due campi
          vorrebbe dire che le righe continuano a finire in una chat. */}
      {/* ── GLI ORDINI APERTI, SOPRA IL CAMPO ──
          ⚠️ Chi scrive il diario ha in testa «quello di Bolzano», non «#12562»:
          l'elenco davanti evita di andarselo a cercare in un'altra schermata e
          di riportarlo a mano — dove si sbaglia una cifra e la nota finisce su
          un ordine di un altro.
          ⚠️ Ogni ordine dice quante righe ha già: la domanda della mattina non
          è «quali ordini ci sono», è **quali sono ancora scoperti**. */}
      {ordiniAperti.length ? (
        <div className="card" style={{ paddingBottom: 8 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <span className="cella-nome">Ordini aperti</span>
            <span className="cella-sub">
              clicca per scrivere una riga su quell&apos;ordine
            </span>
            <button
              className={soloScoperti ? 'bottone mini' : 'bottone secondario mini'}
              onClick={() => setSoloScoperti(!soloScoperti)}
              title="Solo quelli che non hanno ancora nessuna riga nel diario"
            >
              {soloScoperti ? 'Solo senza note ✓' : 'Solo senza note'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ordiniAperti
              .filter((o) => !soloScoperti || o.note === 0)
              .map((o) => (
                <button
                  key={o.numero}
                  className={o.note ? 'bottone secondario mini' : 'bottone mini'}
                  onClick={() => {
                    // Il numero va in testa, come si scrive a mano: il resto
                    // della riga lo continua chi sta scrivendo.
                    setTesto((t) => `${o.numero.replace('#', '')} ${t}`.trimEnd() + ' ')
                    campo.current?.focus()
                  }}
                  title={`${o.clienteNome || 'senza nome'} · ${o.negozioNome} · consegna ${consegnaBreve(o.dataConsegna)}${o.note ? ` · ${o.note} righe nel diario` : ' · nessuna riga'}`}
                >
                  {o.numero} · {consegnaBreve(o.dataConsegna)}
                  {o.note ? ` · ${o.note}` : ''}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <label className="campo">
          <span>Scrivi una riga — comincia col numero d&apos;ordine, se ce l&apos;ha</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={campo}
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void aggiungi()
                }
              }}
              placeholder="12562 da fare 16 luglio · chiamare il fornitore di Bolzano"
              style={{ flex: 1 }}
            />
            <button className="bottone" onClick={() => void aggiungi()} disabled={!testo.trim()}>
              Aggiungi
            </button>
          </div>
        </label>
        {errore ? <div className="avviso-errore">{errore}</div> : null}
      </div>

      {!caricato ? (
        <p className="descrizione">Carico…</p>
      ) : note.length === 0 ? (
        <p className="colonna-vuota">
          {stato === 'aperte' ? 'Niente da fare: il diario è pulito.' : 'Nessuna riga.'}
        </p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <ul className="elenco-diario">
            {note.map((n) => (
              <li key={n.id} className={n.fatta ? 'fatta' : ''}>
                <input
                  type="checkbox"
                  checked={n.fatta}
                  onChange={(e) => void segna(n, e.target.checked)}
                  aria-label={n.fatta ? 'Riapri' : 'Segna fatta'}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {/* Il numero è un link: da una riga del diario si arriva
                        all'ordine, che è quello che si vuole fare dopo averla
                        letta. */}
                    {n.ordineNumero ? (
                      <Link
                        href={`/ordini-globali?q=${encodeURIComponent(n.ordineNumero.replace('#', ''))}`}
                        className="badge"
                        style={{ marginRight: 6 }}
                      >
                        {n.ordineNumero}
                      </Link>
                    ) : null}
                    {/* La chat da cui la nota è nata. Il nome è una COPIA presa
                        quando la nota è stata scritta, e regge anche se poi la
                        conversazione finisce nel cestino. */}
                    {n.conversazioneId ? (
                      <Link
                        href={`/inbox?c=${encodeURIComponent(n.conversazioneId)}`}
                        className="badge"
                        style={{ marginRight: 6 }}
                        title="Apri la conversazione da cui è nata questa nota"
                      >
                        {n.conversazioneChi || 'dalla chat'}
                      </Link>
                    ) : null}
                    <span>{n.testo}</span>
                  </div>
                  <div className="cella-sub">
                    {[
                      n.autoreNome ? `scritta da ${n.autoreNome}` : '',
                      quando(n.creatoIl),
                      n.fatta && n.fattaDaNome ? `fatta da ${n.fattaDaNome}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <button className="bottone secondario mini" onClick={() => void cancella(n)}>
                  Cancella
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
