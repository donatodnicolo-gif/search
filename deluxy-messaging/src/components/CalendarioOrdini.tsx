'use client'

import { useCallback, useEffect, useState } from 'react'

// Calendario delle consegne: un mese per volta, gli ordini nel giorno in cui
// devono essere consegnati, colorati con lo stato della pipeline di Orders.

type OrdineCal = {
  id: string
  numero: string
  negozioNome: string
  clienteNome: string
  citta: string
  totale: number
  valuta: string
  giorno: string // YYYY-MM-DD
  fasciaConsegna: string
  statoChiave: string
  statoNome: string
  statoColore: string
}

type StatoCal = { chiave: string; nome: string; colore: string; quanti: number }

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']

function meseCorrente(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function spostaMese(mese: string, delta: number): string {
  const [a, m] = mese.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nomeMese(mese: string): string {
  const [a, m] = mese.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

/** Le celle del mese: caselle vuote iniziali (lun=0) + i giorni. */
function celle(mese: string): (string | null)[] {
  const [a, m] = mese.split('-').map(Number)
  const primo = new Date(a, m - 1, 1)
  const quanti = new Date(a, m, 0).getDate()
  const partenza = (primo.getDay() + 6) % 7 // lunedì primo
  const out: (string | null)[] = Array(partenza).fill(null)
  for (let g = 1; g <= quanti; g++) {
    out.push(`${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`)
  }
  return out
}

function euro(v: number, valuta: string): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

export function CalendarioOrdini() {
  const [mese, setMese] = useState(meseCorrente())
  const [ordini, setOrdini] = useState<OrdineCal[]>([])
  const [stati, setStati] = useState<StatoCal[]>([])
  const [negozi, setNegozi] = useState<{ id: string; nome: string }[]>([])
  const [negozio, setNegozio] = useState('')
  const [senzaData, setSenzaData] = useState(0)
  const [caricato, setCaricato] = useState(false)
  const [statoScelto, setStatoScelto] = useState('')
  // Si parte da OGGI: l'agenda delle prossime consegne è la domanda di tutti i
  // giorni. La griglia del mese resta a un clic, per la visione d'insieme.
  const [vista, setVista] = useState<'agenda' | 'mese'>('agenda')

  const carica = useCallback(async () => {
    setCaricato(false)
    try {
      const p = new URLSearchParams({ mese })
      // in agenda si chiedono i prossimi 60 giorni a partire da oggi
      if (vista === 'agenda') p.set('giorni', '60')
      if (negozio) p.set('negozio', negozio)
      const res = await fetch('/api/ordini/calendario?' + p.toString())
      if (!res.ok) return
      const d = (await res.json()) as {
        ordini: OrdineCal[]
        stati: StatoCal[]
        negozi: { id: string; nome: string }[]
        senzaData: number
      }
      setOrdini(d.ordini)
      setStati(d.stati)
      setNegozi(d.negozi)
      setSenzaData(d.senzaData)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [mese, negozio, vista])

  useEffect(() => {
    carica()
  }, [carica])

  const visibili = statoScelto
    ? ordini.filter((o) => (o.statoChiave || 'senza-stato') === statoScelto)
    : ordini

  const perGiorno = new Map<string, OrdineCal[]>()
  for (const o of visibili) {
    const g = perGiorno.get(o.giorno)
    if (g) g.push(o)
    else perGiorno.set(o.giorno, [o])
  }

  const oggi = new Date().toISOString().slice(0, 10)
  const valoreMese = visibili.reduce((s, o) => s + o.totale, 0)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Calendario ordini</h1>
          <p className="page-sub">
            Gli ordini nel giorno in cui vanno <strong>consegnati</strong>, colorati per stato.
            {senzaData > 0
              ? ` ${senzaData.toLocaleString('it-IT')} ordini non hanno una data di consegna indicata e non compaiono qui.`
              : ''}
          </p>
        </div>
      </div>

      <div className="filtri">
        <button
          className={`stato-pill${vista === 'agenda' ? ' attuale' : ''}`}
          onClick={() => setVista('agenda')}
        >
          Da oggi
        </button>
        <button
          className={`stato-pill${vista === 'mese' ? ' attuale' : ''}`}
          onClick={() => setVista('mese')}
        >
          Mese
        </button>
        {vista === 'mese' ? (
          <>
            <button className="btn btn-secondario small" onClick={() => setMese(spostaMese(mese, -1))}>
              ← Mese precedente
            </button>
            <strong style={{ alignSelf: 'center', minWidth: 170, textTransform: 'capitalize' }}>
              {nomeMese(mese)}
            </strong>
            <button className="btn btn-secondario small" onClick={() => setMese(spostaMese(mese, 1))}>
              Mese successivo →
            </button>
            <button className="btn btn-secondario small" onClick={() => setMese(meseCorrente())}>
              Oggi
            </button>
          </>
        ) : (
          <strong style={{ alignSelf: 'center' }}>Prossime consegne</strong>
        )}
        <select value={negozio} onChange={(e) => setNegozio(e.target.value)} aria-label="Negozio">
          <option value="">Tutti i negozi</option>
          {negozi.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nome}
            </option>
          ))}
        </select>
      </div>

      {/* Legenda degli stati: cliccando si filtra */}
      {stati.length > 0 ? (
        <div className="filtri" style={{ marginTop: -8 }}>
          <span className="etichetta-ordina">Stato</span>
          <button
            className={`stato-pill${statoScelto === '' ? ' attuale' : ''}`}
            onClick={() => setStatoScelto('')}
          >
            Tutti ({ordini.length})
          </button>
          {stati.map((s) => (
            <button
              key={s.chiave}
              className={`stato-pill${statoScelto === s.chiave ? ' attuale' : ''}`}
              onClick={() => setStatoScelto(statoScelto === s.chiave ? '' : s.chiave)}
              style={{ color: s.colore }}
            >
              <span className="dot" style={{ background: s.colore }} />
              <span className="stato-label">
                {s.nome} ({s.quanti})
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{visibili.length.toLocaleString('it-IT')}</div>
          <div className="kpi-etichetta">
            {vista === 'agenda' ? 'Consegne da oggi (60 giorni)' : 'Consegne nel mese'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(valoreMese, 'EUR')}</div>
          <div className="kpi-etichetta">Valore delle consegne</div>
        </div>
      </div>

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : visibili.length === 0 ? (
        <div className="vuoto">
          {vista === 'agenda'
            ? 'Nessuna consegna nei prossimi 60 giorni'
            : `Nessuna consegna in ${nomeMese(mese)}`}
          {statoScelto ? ' con questo stato' : ''}.
        </div>
      ) : vista === 'agenda' ? (
        // Agenda: i giorni con consegne, dal più vicino, a partire da oggi.
        <div className="agenda">
          {[...perGiorno.keys()]
            .sort()
            .map((giorno) => {
              const suoi = perGiorno.get(giorno) ?? []
              const d = new Date(giorno + 'T00:00:00')
              const etichetta =
                giorno === oggi
                  ? 'Oggi'
                  : d.toLocaleDateString('it-IT', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
              return (
                <div className={`agenda-giorno${giorno === oggi ? ' oggi' : ''}`} key={giorno}>
                  <div className="agenda-testata">
                    <span className="giorno" style={{ textTransform: 'capitalize' }}>
                      {etichetta}
                    </span>
                    <span className="quanti">
                      {suoi.length} {suoi.length === 1 ? 'consegna' : 'consegne'}
                    </span>
                    <span className="valore">
                      {euro(
                        suoi.reduce((s, o) => s + o.totale, 0),
                        'EUR'
                      )}
                    </span>
                  </div>
                  {suoi.map((o) => (
                    <div
                      className="agenda-riga"
                      key={o.id}
                      style={{ borderLeftColor: o.statoColore || 'var(--text-tertiary)' }}
                    >
                      <span className="fascia">{o.fasciaConsegna || '—'}</span>
                      <span className="numero">{o.numero}</span>
                      <span className="chi">
                        {o.clienteNome || '—'}
                        {o.citta ? ` · ${o.citta}` : ''}
                      </span>
                      <span className="negozio">{o.negozioNome}</span>
                      <span className="stato" style={{ color: o.statoColore || undefined }}>
                        {o.statoNome || 'Senza stato'}
                      </span>
                      <span className="importo">{euro(o.totale, o.valuta)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
        </div>
      ) : (
        <div className="calendario">
          <div className="cal-testata">
            {GIORNI.map((g) => (
              <div key={g} className="cal-giorno-nome">
                {g}
              </div>
            ))}
          </div>
          <div className="cal-griglia">
            {celle(mese).map((giorno, i) => {
              if (!giorno) return <div key={`vuota-${i}`} className="cal-cella vuota" />
              const suoi = perGiorno.get(giorno) ?? []
              const numero = Number(giorno.slice(-2))
              return (
                <div key={giorno} className={`cal-cella${giorno === oggi ? ' oggi' : ''}`}>
                  <div className="cal-numero">
                    {numero}
                    {suoi.length > 0 ? <span className="cal-conteggio">{suoi.length}</span> : null}
                  </div>
                  {suoi.map((o) => (
                    <div
                      key={o.id}
                      className="cal-ordine"
                      style={{ borderLeftColor: o.statoColore || 'var(--text-tertiary)' }}
                      title={`${o.numero} · ${o.clienteNome || '—'}${o.citta ? ' · ' + o.citta : ''}\n${o.statoNome || 'Senza stato'}${o.fasciaConsegna ? ' · ' + o.fasciaConsegna : ''}\n${euro(o.totale, o.valuta)} · ${o.negozioNome}`}
                    >
                      <span className="cal-num">{o.numero}</span>
                      {o.fasciaConsegna ? (
                        <span className="cal-fascia">{o.fasciaConsegna}</span>
                      ) : null}
                      <span className="cal-cliente">{o.clienteNome || '—'}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </main>
  )
}
