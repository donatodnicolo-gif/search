'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GIORNI,
  giornoIso,
  inMinuti,
  turniDelGiorno,
  type EsitoTurni,
} from '@/lib/turni'

// I turni degli operatori: chi lavora, quando.
//
// ⚠️ Due cose separate, ed è il cuore della pagina: **la settimana che si
// ripete** («Federica il lunedì dalle 9 alle 13») e **i giorni in cui quella
// settimana non vale** («il 25 agosto è in ferie»). Se ci fosse solo la prima,
// ogni permesso costringerebbe a riscrivere la regola e poi a rimetterla a
// posto — e nessuno lo farebbe, così la griglia direbbe il falso in silenzio.
//
// ⚠️ «Adesso» si calcola con l'orologio del BROWSER. Sul server sarebbe UTC —
// Vercel sta lì — e alle 09:30 italiane direbbe che nessuno è ancora entrato.

/** «di turno adesso», con l'orologio di chi guarda. */
function oraCorrente(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 1 = lunedì … 7 = domenica, dal `getDay()` che invece parte dalla domenica. */
function giornoSettimana(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay()
}

function nomeGiornoData(giorno: string): string {
  const d = new Date(`${giorno}T12:00:00`)
  const oggi = giornoIso(new Date())
  const domani = giornoIso(new Date(Date.now() + 86400000))
  const ieri = giornoIso(new Date(Date.now() - 86400000))
  const testo = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
  if (giorno === oggi) return `oggi · ${testo}`
  if (giorno === domani) return `domani · ${testo}`
  if (giorno === ieri) return `ieri · ${testo}`
  return testo
}

const VUOTO: EsitoTurni = { operatori: [], turni: [], eccezioni: [] }

export function TurniLista({ amministratore }: { amministratore: boolean }) {
  const [dati, setDati] = useState<EsitoTurni>(VUOTO)
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Il modulo della settimana
  const [chi, setChi] = useState('')
  const [giorno, setGiorno] = useState(1)
  const [dalle, setDalle] = useState('09:00')
  const [alle, setAlle] = useState('13:00')

  // Il modulo delle eccezioni
  const [chiEcc, setChiEcc] = useState('')
  const [dataEcc, setDataEcc] = useState(giornoIso(new Date()))
  const [tipoEcc, setTipoEcc] = useState<'riposo' | 'orario'>('riposo')
  const [dalleEcc, setDalleEcc] = useState('09:00')
  const [alleEcc, setAlleEcc] = useState('13:00')
  const [motivoEcc, setMotivoEcc] = useState('')

  const carica = useCallback(async () => {
    const res = await fetch('/api/turni')
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      setErrore(d.errore ?? 'Non sono riuscito a leggere i turni.')
      setCaricato(true)
      return
    }
    const d = (await res.json()) as EsitoTurni
    setDati(d)
    setCaricato(true)
    setChi((c) => c || d.operatori[0]?.id || '')
    setChiEcc((c) => c || d.operatori[0]?.id || '')
  }, [])

  useEffect(() => {
    if (amministratore) void carica()
  }, [carica, amministratore])

  async function manda(corpo: Record<string, unknown>) {
    setSalvando(true)
    setErrore('')
    try {
      const res = await fetch('/api/turni', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const d = (await res.json()) as EsitoTurni & { errore?: string }
      if (!res.ok) setErrore(d.errore ?? 'Non sono riuscito a salvare.')
      else setDati(d)
    } catch {
      setErrore('Non sono riuscito a salvare: riprova.')
    } finally {
      setSalvando(false)
    }
  }

  async function togli(id: string, cosa: 'settimana' | 'eccezione') {
    setSalvando(true)
    setErrore('')
    try {
      const res = await fetch(`/api/turni?id=${encodeURIComponent(id)}&cosa=${cosa}`, {
        method: 'DELETE',
      })
      const d = (await res.json()) as EsitoTurni & { errore?: string }
      if (!res.ok) setErrore(d.errore ?? 'Non sono riuscito a togliere il turno.')
      else setDati(d)
    } finally {
      setSalvando(false)
    }
  }

  // ── Chi è di turno adesso, e chi entra dopo ──
  const adesso = useMemo(() => {
    const ora = new Date()
    const oggi = turniDelGiorno(dati, giornoIso(ora), giornoSettimana(ora))
    const m = oraCorrente(ora)
    return {
      dentro: oggi.filter((t) => inMinuti(t.dalle) <= m && m < inMinuti(t.alle)),
      dopo: oggi.filter((t) => inMinuti(t.dalle) > m),
      nessunTurnoOggi: oggi.length === 0,
    }
  }, [dati])

  if (!amministratore) {
    return (
      <main>
        <h1 className="page-title">Turni</h1>
        <div className="card" style={{ maxWidth: 640 }}>
          <p className="descrizione" style={{ marginBottom: 0 }}>
            I turni li imposta un <strong>amministratore</strong>. Il tuo è un account
            operatore: se il tuo orario non è quello giusto, chiedi a chi amministra di
            correggerlo.
          </p>
        </div>
      </main>
    )
  }

  const perGiorno = (utenteId: string, n: number) =>
    dati.turni
      .filter((t) => t.utenteId === utenteId && t.giorno === n)
      .sort((a, b) => inMinuti(a.dalle) - inMinuti(b.dalle))

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Turni</h1>
          <p className="page-sub">
            Chi lavora e quando. La <strong>settimana</strong> è la regola che si ripete; le{' '}
            <strong>eccezioni</strong> sono i giorni in cui quella regola non vale — ferie,
            permessi, un cambio di orario. L’eccezione vince sempre sulla settimana.
          </p>
        </div>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* ── ADESSO ──
          ⚠️ È il primo riquadro perché è la domanda che si fa aprendo la
          pagina: «c'è qualcuno adesso?». La griglia serve a impostare, questo
          a guardare. */}
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Adesso</h2>
        {!caricato ? (
          <p className="descrizione" style={{ marginBottom: 0 }}>
            Carico…
          </p>
        ) : adesso.dentro.length ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {adesso.dentro.map((t) => (
              <span key={t.utenteId + t.dalle} className="badge verde">
                {t.nome} · fino alle {t.alle}
                {t.motivo ? ` · ${t.motivo}` : ''}
              </span>
            ))}
          </div>
        ) : (
          <p className="descrizione" style={{ marginBottom: 0 }}>
            {adesso.nessunTurnoOggi
              ? 'Oggi non è di turno nessuno.'
              : 'In questo momento non c’è nessuno in turno.'}
          </p>
        )}
        {adesso.dopo.length ? (
          <p className="descrizione" style={{ marginBottom: 0, marginTop: 10 }}>
            Dopo:{' '}
            {adesso.dopo.map((t) => `${t.nome} dalle ${t.dalle}`).join(' · ')}
          </p>
        ) : null}
      </div>

      {/* ── LA SETTIMANA ── */}
      <h2 style={{ fontSize: 17, marginTop: 26, marginBottom: 10 }}>La settimana</h2>

      <div className="filtri">
        <span className="etichetta-ordina">Aggiungi</span>
        <select value={chi} onChange={(e) => setChi(e.target.value)} aria-label="Persona">
          {dati.operatori.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <select
          value={giorno}
          onChange={(e) => setGiorno(Number(e.target.value))}
          aria-label="Giorno della settimana"
        >
          {GIORNI.map((g) => (
            <option key={g.n} value={g.n}>
              {g.nome}
            </option>
          ))}
        </select>
        <span className="cella-sub">dalle</span>
        <input
          type="time"
          value={dalle}
          onChange={(e) => setDalle(e.target.value)}
          aria-label="Dalle"
        />
        <span className="cella-sub">alle</span>
        <input
          type="time"
          value={alle}
          onChange={(e) => setAlle(e.target.value)}
          aria-label="Alle"
        />
        <button
          className="bottone mini"
          disabled={salvando || !chi}
          onClick={() => void manda({ cosa: 'settimana', utenteId: chi, giorno, dalle, alle })}
        >
          Aggiungi il turno
        </button>
      </div>

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              {GIORNI.map((g) => (
                <th key={g.n} title={g.nome}>
                  {g.breve}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dati.operatori.map((o) => (
              <tr key={o.id}>
                <td>
                  <div className="cella-nome">{o.nome}</div>
                  <div className="cella-sub">{o.ruolo === 'admin' ? 'amministratore' : 'operatore'}</div>
                </td>
                {GIORNI.map((g) => {
                  const fasce = perGiorno(o.id, g.n)
                  return (
                    <td key={g.n} style={{ verticalAlign: 'top' }}>
                      {fasce.length === 0 ? (
                        <span className="cella-muta">—</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {fasce.map((f) => (
                            <button
                              key={f.id}
                              className="bottone secondario mini"
                              disabled={salvando}
                              title="Togli questo turno"
                              onClick={() => void togli(f.id, 'settimana')}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              {f.dalle}–{f.alle} ×
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caricato && dati.turni.length === 0 ? (
        <p className="descrizione" style={{ marginTop: 10 }}>
          Nessun turno impostato: finché la griglia è vuota, «Adesso» dirà sempre che non c’è
          nessuno.
        </p>
      ) : null}

      {/* ── LE ECCEZIONI ── */}
      <h2 style={{ fontSize: 17, marginTop: 30, marginBottom: 6 }}>
        Quando la settimana non vale
      </h2>
      <p className="descrizione" style={{ marginTop: 0 }}>
        Ferie, permessi, un cambio di orario per un giorno solo. ⚠️ Un{' '}
        <strong>riposo</strong> cancella tutte le fasce di quella persona in quel giorno; un{' '}
        <strong>orario diverso</strong> le sostituisce. La settimana resta com’è.
      </p>

      <div className="filtri">
        <span className="etichetta-ordina">Aggiungi</span>
        <select value={chiEcc} onChange={(e) => setChiEcc(e.target.value)} aria-label="Persona">
          {dati.operatori.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dataEcc}
          onChange={(e) => setDataEcc(e.target.value)}
          aria-label="Giorno"
        />
        <select
          value={tipoEcc}
          onChange={(e) => setTipoEcc(e.target.value === 'orario' ? 'orario' : 'riposo')}
          aria-label="Che cosa cambia"
        >
          <option value="riposo">Non lavora</option>
          <option value="orario">Orario diverso</option>
        </select>
        {tipoEcc === 'orario' ? (
          <>
            <span className="cella-sub">dalle</span>
            <input
              type="time"
              value={dalleEcc}
              onChange={(e) => setDalleEcc(e.target.value)}
              aria-label="Dalle"
            />
            <span className="cella-sub">alle</span>
            <input
              type="time"
              value={alleEcc}
              onChange={(e) => setAlleEcc(e.target.value)}
              aria-label="Alle"
            />
          </>
        ) : null}
        <input
          value={motivoEcc}
          onChange={(e) => setMotivoEcc(e.target.value)}
          placeholder="motivo (ferie, visita…)"
          aria-label="Motivo"
          style={{ width: 180 }}
        />
        <button
          className="bottone mini"
          disabled={salvando || !chiEcc}
          onClick={() =>
            void manda({
              cosa: 'eccezione',
              utenteId: chiEcc,
              giorno: dataEcc,
              tipo: tipoEcc,
              dalle: dalleEcc,
              alle: alleEcc,
              motivo: motivoEcc,
            }).then(() => setMotivoEcc(''))
          }
        >
          Aggiungi l’eccezione
        </button>
      </div>

      {dati.eccezioni.length === 0 ? (
        <p className="descrizione">
          Nessuna eccezione da ieri in poi. Quelle passate non si mostrano: sono archivio, e un
          elenco che cresce all’infinito smette di guardarsi.
        </p>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Giorno</th>
                <th>Persona</th>
                <th>Che cosa cambia</th>
                <th>Motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dati.eccezioni.map((e) => (
                <tr key={e.id}>
                  <td className="cella-nome" style={{ whiteSpace: 'nowrap' }}>
                    {nomeGiornoData(e.giorno)}
                  </td>
                  <td>{e.utenteNome}</td>
                  <td>
                    {e.tipo === 'riposo' ? (
                      <span className="badge rosso">Non lavora</span>
                    ) : (
                      <span className="badge">
                        {e.dalle}–{e.alle}
                      </span>
                    )}
                  </td>
                  <td className="cella-muta">
                    {e.motivo || '—'}
                    {e.creatoDaNome ? (
                      <div className="cella-sub">messa da {e.creatoDaNome}</div>
                    ) : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="bottone secondario mini"
                      disabled={salvando}
                      onClick={() => void togli(e.id, 'eccezione')}
                    >
                      Togli
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 22, maxWidth: 860 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Che cosa fanno, e che cosa non fanno</h2>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          I turni <strong>si scrivono qui e basta</strong>: non assegnano ordini, non
          smistano conversazioni e non impediscono a nessuno di entrare fuori orario. Servono
          a sapere chi c’è — e a poterlo dire a un cliente che chiede quando richiamare. Se
          un domani devono contare davvero (per esempio per dare le chat nuove a chi è di
          turno), è una cosa da decidere e da costruire, non da far succedere di lato.
        </p>
      </div>
    </main>
  )
}
