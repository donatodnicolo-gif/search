'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { GIORNI, giornoIso, inMinuti, turniDelGiorno, type EsitoTurni } from '@/lib/turni'

// I turni degli operatori, fatti come gli **orari di apertura**: una persona
// alla volta, sette righe, aperto o chiuso.
//
// ⚠️ La prima versione era una griglia persone × 7 giorni con sopra una barra
// da quattro tendine per aggiungere un turno. Funzionava e non si capiva: per
// mettere il lunedì di Federica bisognava scegliere la persona, il giorno e due
// ore in quattro controlli diversi, e poi cercare dove fosse finita la
// pastiglia. Qui si apre il giorno e si scrive l'ora dov'è scritta.
//
// ⚠️ «Adesso» si calcola con l'orologio del BROWSER. Sul server sarebbe UTC —
// Vercel sta lì — e alle 09:30 italiane direbbe che non è entrato ancora
// nessuno.

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

/** L'orario che si propone aprendo un giorno: quello che si scrive più spesso. */
const DI_SOLITO = { dalle: '09:00', alle: '18:00' }

export function TurniLista({ amministratore }: { amministratore: boolean }) {
  const [dati, setDati] = useState<EsitoTurni>(VUOTO)
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [chi, setChi] = useState('')

  // Il giorno speciale che si sta aggiungendo
  const [dataSpec, setDataSpec] = useState(giornoIso(new Date()))
  const [chiusoSpec, setChiusoSpec] = useState(true)
  const [dalleSpec, setDalleSpec] = useState('09:00')
  const [alleSpec, setAlleSpec] = useState('13:00')
  const [motivoSpec, setMotivoSpec] = useState('')

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
  }, [])

  useEffect(() => {
    if (amministratore) void carica()
  }, [carica, amministratore])

  async function chiama(metodo: 'POST' | 'PATCH' | 'DELETE', corpo?: unknown, query = '') {
    setSalvando(true)
    setErrore('')
    try {
      const res = await fetch('/api/turni' + query, {
        method: metodo,
        ...(corpo
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }
          : {}),
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

  // ── Chi è di turno adesso ──
  const adesso = useMemo(() => {
    const ora = new Date()
    const oggi = turniDelGiorno(dati, giornoIso(ora), giornoSettimana(ora))
    const m = ora.getHours() * 60 + ora.getMinutes()
    return {
      dentro: oggi.filter((t) => inMinuti(t.dalle) <= m && m < inMinuti(t.alle)),
      dopo: oggi.filter((t) => inMinuti(t.dalle) > m),
      nessunoOggi: oggi.length === 0,
    }
  }, [dati])

  if (!amministratore) {
    return (
      <main>
        <h1 className="page-title">Turni</h1>
        <div className="card" style={{ maxWidth: 640 }}>
          <p className="descrizione" style={{ marginBottom: 0 }}>
            I turni li imposta un <strong>amministratore</strong>. Se il tuo orario non è
            quello giusto, chiedi a chi amministra di correggerlo.
          </p>
        </div>
      </main>
    )
  }

  const fasceDi = (utenteId: string, n: number) =>
    dati.turni
      .filter((t) => t.utenteId === utenteId && t.giorno === n)
      .sort((a, b) => inMinuti(a.dalle) - inMinuti(b.dalle))

  const giorniAperti = (utenteId: string) =>
    new Set(dati.turni.filter((t) => t.utenteId === utenteId).map((t) => t.giorno)).size

  const eccezioniDi = dati.eccezioni.filter((e) => e.utenteId === chi)
  const persona = dati.operatori.find((o) => o.id === chi)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Turni</h1>
          <p className="page-sub">
            Chi lavora e quando, come gli orari di apertura: la settimana si ripete, i{' '}
            <strong>giorni speciali</strong> la scavalcano. Non assegnano ordini e non
            impediscono a nessuno di lavorare fuori orario: servono a sapere chi c’è.
          </p>
        </div>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* ── ADESSO ── una riga: è la domanda che ci si fa aprendo la pagina. */}
      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="etichetta-ordina" style={{ margin: 0 }}>
          Adesso
        </span>
        {!caricato ? (
          <span className="cella-sub">carico…</span>
        ) : adesso.dentro.length ? (
          adesso.dentro.map((t) => (
            <span key={t.utenteId + t.dalle} className="badge verde">
              {t.nome} · fino alle {t.alle}
            </span>
          ))
        ) : (
          <span className="cella-sub">
            {adesso.nessunoOggi ? 'oggi non c’è nessun turno' : 'nessuno in turno in questo momento'}
          </span>
        )}
        {adesso.dopo.length ? (
          <span className="cella-sub">
            poi {adesso.dopo.map((t) => `${t.nome} dalle ${t.dalle}`).join(' · ')}
          </span>
        ) : null}
      </div>

      {/* ── CHI ── una pastiglia per persona, col numero di giorni già messi:
          si vede a colpo d'occhio chi non ha ancora un orario. */}
      <div className="filtri" style={{ marginTop: 18 }}>
        <span className="etichetta-ordina">Orari di</span>
        {dati.operatori.map((o) => {
          const quanti = giorniAperti(o.id)
          return (
            <button
              key={o.id}
              className={chi === o.id ? 'bottone mini' : 'bottone secondario mini'}
              onClick={() => setChi(o.id)}
            >
              {o.nome}
              {quanti ? ` · ${quanti}g` : ''}
            </button>
          )
        })}
      </div>

      {/* ── LA SETTIMANA, come gli orari di apertura ── */}
      <div className="card" style={{ padding: 0 }}>
        {GIORNI.map((g) => {
          const fasce = fasceDi(chi, g.n)
          const aperto = fasce.length > 0
          return (
            <div
              key={g.n}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderBottom: g.n === 7 ? 'none' : '1px solid var(--hairline)',
                flexWrap: 'wrap',
              }}
            >
              <div className="cella-nome" style={{ width: 96, paddingTop: 4 }}>
                {g.nome}
              </div>

              {/* ⚠️ Aperto/chiuso è UN bottone, non una tendina: aprire un
                  giorno mette l'orario di sempre (9–18) e si corregge scrivendo
                  sopra. Chiuderlo toglie tutte le fasce di quel giorno — è la
                  stessa cosa che fa Google, e nessuno la trova sorprendente. */}
              <button
                className={aperto ? 'bottone secondario mini' : 'bottone mini'}
                disabled={salvando || !chi}
                style={{ width: 88 }}
                onClick={() => {
                  if (aperto) {
                    // Una chiamata sola per tutto il giorno: mandarne una per
                    // fascia lascerebbe il giorno mezzo aperto a schermo.
                    void chiama('DELETE', undefined, `?cosa=giorno&utenteId=${chi}&giorno=${g.n}`)
                  } else {
                    void chiama('POST', {
                      cosa: 'settimana',
                      utenteId: chi,
                      giorno: g.n,
                      ...DI_SOLITO,
                    })
                  }
                }}
              >
                {aperto ? 'Aperto' : 'Chiuso'}
              </button>

              {aperto ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fasce.map((f) => (
                    <div key={f.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="time"
                        defaultValue={f.dalle}
                        disabled={salvando}
                        aria-label={`${g.nome}: dalle`}
                        onBlur={(e) =>
                          e.target.value && void chiama('PATCH', { id: f.id, dalle: e.target.value, alle: f.alle })
                        }
                      />
                      <span className="cella-sub">–</span>
                      <input
                        type="time"
                        defaultValue={f.alle}
                        disabled={salvando}
                        aria-label={`${g.nome}: alle`}
                        onBlur={(e) =>
                          e.target.value && void chiama('PATCH', { id: f.id, dalle: f.dalle, alle: e.target.value })
                        }
                      />
                      {fasce.length > 1 ? (
                        <button
                          className="bottone secondario mini"
                          disabled={salvando}
                          title="Togli questa fascia"
                          onClick={() => void chiama('DELETE', undefined, `?id=${f.id}&cosa=settimana`)}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {/* Una seconda fascia serve a chi stacca per pranzo. */}
                  <button
                    className="bottone secondario mini"
                    disabled={salvando}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() =>
                      void chiama('POST', {
                        cosa: 'settimana',
                        utenteId: chi,
                        giorno: g.n,
                        dalle: '15:00',
                        alle: '18:00',
                      })
                    }
                  >
                    + Aggiungi orario
                  </button>
                </div>
              ) : (
                <span className="cella-muta" style={{ paddingTop: 5 }}>
                  non lavora
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── I GIORNI SPECIALI ── le «special hours»: ferie, permessi, orari
          diversi per un giorno solo. ⚠️ Valgono per la persona scelta sopra:
          un secondo elenco di persone qui sarebbe un controllo in più per
          niente. */}
      <h2 style={{ fontSize: 17, marginTop: 28, marginBottom: 4 }}>Giorni speciali</h2>
      <p className="descrizione" style={{ marginTop: 0 }}>
        Ferie, permessi o un orario diverso, per {persona ? <strong>{persona.nome}</strong> : 'la persona scelta'}.
        Scavalcano la settimana solo quel giorno.
      </p>

      <div className="filtri">
        <input
          type="date"
          value={dataSpec}
          onChange={(e) => setDataSpec(e.target.value)}
          aria-label="Giorno"
        />
        <button
          className={chiusoSpec ? 'bottone mini' : 'bottone secondario mini'}
          onClick={() => setChiusoSpec(true)}
        >
          Non lavora
        </button>
        <button
          className={!chiusoSpec ? 'bottone mini' : 'bottone secondario mini'}
          onClick={() => setChiusoSpec(false)}
        >
          Orario diverso
        </button>
        {!chiusoSpec ? (
          <>
            <input
              type="time"
              value={dalleSpec}
              onChange={(e) => setDalleSpec(e.target.value)}
              aria-label="Dalle"
            />
            <span className="cella-sub">–</span>
            <input
              type="time"
              value={alleSpec}
              onChange={(e) => setAlleSpec(e.target.value)}
              aria-label="Alle"
            />
          </>
        ) : null}
        <input
          value={motivoSpec}
          onChange={(e) => setMotivoSpec(e.target.value)}
          placeholder="motivo (ferie, visita…)"
          aria-label="Motivo"
          style={{ width: 170 }}
        />
        <button
          className="bottone mini"
          disabled={salvando || !chi}
          onClick={() =>
            void chiama('POST', {
              cosa: 'eccezione',
              utenteId: chi,
              giorno: dataSpec,
              tipo: chiusoSpec ? 'riposo' : 'orario',
              dalle: dalleSpec,
              alle: alleSpec,
              motivo: motivoSpec,
            }).then(() => setMotivoSpec(''))
          }
        >
          Aggiungi
        </button>
      </div>

      {eccezioniDi.length === 0 ? (
        <p className="descrizione">
          Nessun giorno speciale da ieri in poi. Quelli passati non si mostrano.
        </p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {eccezioniDi.map((e, i) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom: i === eccezioniDi.length - 1 ? 'none' : '1px solid var(--hairline)',
                flexWrap: 'wrap',
              }}
            >
              <span className="cella-nome" style={{ minWidth: 150 }}>
                {nomeGiornoData(e.giorno)}
              </span>
              {e.tipo === 'riposo' ? (
                <span className="badge rosso">Non lavora</span>
              ) : (
                <span className="badge">
                  {e.dalle}–{e.alle}
                </span>
              )}
              <span className="cella-muta" style={{ flex: 1 }}>
                {e.motivo}
              </span>
              <button
                className="bottone secondario mini"
                disabled={salvando}
                onClick={() => void chiama('DELETE', undefined, `?id=${e.id}&cosa=eccezione`)}
              >
                Togli
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
