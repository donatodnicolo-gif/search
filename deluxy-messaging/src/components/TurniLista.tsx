'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GIORNI,
  giornoIso,
  giornoSettimana,
  inMinuti,
  lunediDi,
  piuGiorni,
  turniDelGiorno,
  type EsitoTurni,
} from '@/lib/turni'

// I turni degli operatori, fatti come gli **orari di apertura**: una persona
// alla volta, sette righe, aperto o chiuso.
//
// ⚠️ Due modi di guardarli, ed è la cosa che dà senso alla pagina:
// · **Sempre** — la regola che si ripete ogni settimana;
// · **una settimana precisa** — quella settimana lì, e solo quella.
// Cambiare un giorno dentro una settimana lo **stacca** dalla regola: la regola
// resta com'è, e il giorno staccato lo dice con un'etichetta e un «torna al
// solito». Senza questa distinzione, ogni ferie costringerebbe a riscrivere la
// regola e poi a rimetterla a posto — e non lo farebbe nessuno, così la pagina
// direbbe il falso in silenzio.
//
// ⚠️ «Adesso» e i confini della settimana si calcolano con l'orologio del
// BROWSER. Sul server sarebbe UTC — Vercel sta lì — e alle 09:30 italiane
// direbbe che non è entrato ancora nessuno.

/** «lun 24 – dom 30 ago», o coi due mesi quando la settimana li scavalca. */
function nomeSettimana(lunedi: Date): string {
  const domenica = piuGiorni(lunedi, 6)
  const stessoMese = lunedi.getMonth() === domenica.getMonth()
  const a = lunedi.toLocaleDateString('it-IT', stessoMese ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  const b = domenica.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  return `${a} – ${b}`
}

const VUOTO: EsitoTurni = { operatori: [], turni: [], eccezioni: [] }

/** L'orario che si propone aprendo un giorno: quello che si scrive più spesso. */
const DI_SOLITO = { dalle: '09:00', alle: '18:00' }

type Fascia = { dalle: string; alle: string }

export function TurniLista({ amministratore }: { amministratore: boolean }) {
  const [dati, setDati] = useState<EsitoTurni>(VUOTO)
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [chi, setChi] = useState('')

  // ⚠️⚠️ SI APRE SULLA SETTIMANA CORRENTE, non sulla regola. Chiesto
  // dall'utente il 26/08/2026: «tieni aggiornato alla settimana corrente
  // sempre». Chi apre i Turni vuole sapere **chi c'è questa settimana** — la
  // regola di sempre è un passo indietro, non il punto di partenza, e a
  // guardarla si scambia per l'orario vero di questi giorni.
  //
  // `null` = la regola di sempre. Altrimenti il lunedì della settimana guardata.
  const [lunedi, setLunedi] = useState<Date | null>(() => lunediDi(new Date()))
  /**
   * Il lunedì di ADESSO, ricontrollato ogni minuto.
   *
   * ⚠️⚠️ Serve perché questa pagina resta aperta per giorni su un computer del
   * servizio clienti. Senza, sabato notte la settimana mostrata smette di essere
   * quella corrente e lunedì mattina si scrivono i turni **sulla settimana
   * passata** — che non serve a nessuno, e non dà nessun errore.
   */
  const [lunediDiAdesso, setLunediDiAdesso] = useState(() => lunediDi(new Date()))
  const dal = lunedi ? giornoIso(lunedi) : ''

  const carica = useCallback(async () => {
    const res = await fetch('/api/turni' + (dal ? `?dal=${dal}` : ''))
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
  }, [dal])

  useEffect(() => {
    if (amministratore) void carica()
  }, [carica, amministratore])

  // ── RESTARE SULLA SETTIMANA CORRENTE ──
  //
  // ⚠️ Si sposta SOLO chi stava guardando la settimana che era corrente fino a
  // un attimo fa: se qualcuno è andato apposta a vedere la prossima, o la
  // regola di sempre, la pagina non gliela cambia sotto le mani. Una schermata
  // che salta mentre ci lavori è peggio di una ferma.
  useEffect(() => {
    const t = setInterval(() => {
      const nuovo = lunediDi(new Date())
      setLunediDiAdesso((vecchio) => {
        if (giornoIso(nuovo) === giornoIso(vecchio)) return vecchio
        setLunedi((mostrato) =>
          mostrato && giornoIso(mostrato) === giornoIso(vecchio) ? nuovo : mostrato
        )
        return nuovo
      })
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  async function chiama(metodo: 'POST' | 'PATCH' | 'DELETE', corpo?: object, query = '') {
    setSalvando(true)
    setErrore('')
    try {
      const q = query ? `${query}${dal ? `&dal=${dal}` : ''}` : ''
      const res = await fetch('/api/turni' + q, {
        method: metodo,
        ...(corpo
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(dal ? { ...corpo, dal } : corpo),
            }
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

  /** Le fasce della REGOLA per un giorno della settimana. */
  const diSempre = (n: number): Fascia[] =>
    dati.turni
      .filter((t) => t.utenteId === chi && t.giorno === n)
      .sort((a, b) => inMinuti(a.dalle) - inMinuti(b.dalle))
      .map((t) => ({ dalle: t.dalle, alle: t.alle }))

  /** Le righe scritte per una data precisa, se ce ne sono. */
  const scritteIl = (data: string) => dati.eccezioni.filter((e) => e.utenteId === chi && e.giorno === data)

  const giorniAperti = (utenteId: string) =>
    new Set(dati.turni.filter((t) => t.utenteId === utenteId).map((t) => t.giorno)).size

  const persona = dati.operatori.find((o) => o.id === chi)

  /** Scrive un giorno di una settimana per intero. Elenco vuoto = non lavora. */
  const scriviGiorno = (data: string, fasce: Fascia[], motivo = '') =>
    chiama('POST', { cosa: 'giorno-data', utenteId: chi, giorno: data, fasce, motivo })

  // Le sette righe da mostrare: o i giorni della regola, o i giorni della
  // settimana guardata con le loro date.
  const righe = GIORNI.map((g) => {
    if (!lunedi) {
      const fasce = diSempre(g.n)
      return { g, data: '', fasce, staccato: false, motivo: '' }
    }
    const data = giornoIso(piuGiorni(lunedi, g.n - 1))
    const scritte = scritteIl(data)
    const staccato = scritte.length > 0
    const fasce: Fascia[] = staccato
      ? scritte
          .filter((e) => e.tipo === 'orario')
          .map((e) => ({ dalle: e.dalle, alle: e.alle }))
          .sort((a, b) => inMinuti(a.dalle) - inMinuti(b.dalle))
      : diSempre(g.n)
    return { g, data, fasce, staccato, motivo: scritte[0]?.motivo ?? '' }
  })

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Turni</h1>
          <p className="page-sub">
            Chi lavora e quando, come gli orari di apertura. <strong>Sempre</strong> è la
            regola che si ripete; scegliendo una <strong>settimana</strong> si cambia solo
            quella — ferie, permessi, un orario diverso. Non assegnano ordini e non
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

      {/* ── CHI ── col numero di giorni già messi: si vede a colpo d'occhio chi
          non ha ancora un orario. */}
      <div className="filtri" style={{ marginTop: 18, marginBottom: 10 }}>
        <span className="etichetta-ordina">Orari di</span>
        {dati.operatori.map((o) => (
          <button
            key={o.id}
            className={chi === o.id ? 'bottone mini' : 'bottone secondario mini'}
            onClick={() => setChi(o.id)}
          >
            {o.nome}
            {giorniAperti(o.id) ? ` · ${giorniAperti(o.id)}g` : ''}
          </button>
        ))}
      </div>

      {/* ── QUANDO ── la regola, oppure una settimana precisa. */}
      <div className="filtri">
        <button
          className={!lunedi ? 'bottone mini' : 'bottone secondario mini'}
          onClick={() => setLunedi(null)}
          title="La regola che vale tutte le settimane"
        >
          Sempre
        </button>
        <span className="cella-sub">oppure</span>
        <button
          className="bottone secondario mini"
          onClick={() => setLunedi((l) => piuGiorni(l ?? lunediDi(new Date()), -7))}
          aria-label="Settimana prima"
        >
          ‹
        </button>
        <button
          className={lunedi ? 'bottone mini' : 'bottone secondario mini'}
          onClick={() => setLunedi((l) => l ?? lunediDi(new Date()))}
          style={{ minWidth: 132 }}
        >
          {lunedi ? nomeSettimana(lunedi) : nomeSettimana(lunediDi(new Date()))}
        </button>
        <button
          className="bottone secondario mini"
          onClick={() => setLunedi((l) => piuGiorni(l ?? lunediDi(new Date()), 7))}
          aria-label="Settimana dopo"
        >
          ›
        </button>
        {/* ⚠️ Si dice DOVE si è quando non si è sulla settimana corrente: senza,
            una griglia mezza vuota di tre settimane fa si legge come «non c'è
            nessuno in servizio». */}
        {lunedi && giornoIso(lunedi) !== giornoIso(lunediDiAdesso) ? (
          <>
            <span className="badge" style={{ color: 'var(--oro)' }}>
              {lunedi < lunediDiAdesso ? 'settimana passata' : 'settimana futura'}
            </span>
            <button className="bottone secondario mini" onClick={() => setLunedi(lunediDiAdesso)}>
              Questa settimana
            </button>
          </>
        ) : null}
      </div>

      {lunedi ? (
        <p className="descrizione" style={{ marginTop: -8 }}>
          Stai cambiando <strong>solo questa settimana</strong>, per{' '}
          {persona ? <strong>{persona.nome}</strong> : 'la persona scelta'}. La regola di sempre
          resta com’è.
        </p>
      ) : null}

      {/* ── I SETTE GIORNI ── */}
      <div className="card" style={{ padding: 0 }}>
        {righe.map(({ g, data, fasce, staccato, motivo }) => {
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
              <div style={{ width: 104, paddingTop: 4 }}>
                <div className="cella-nome">{g.nome}</div>
                {data ? (
                  <div className="cella-sub">
                    {new Date(`${data}T12:00:00`).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </div>
                ) : null}
              </div>

              {/* ⚠️ Aperto/chiuso è UN bottone: aprire un giorno mette l'orario
                  di sempre e si corregge scrivendoci sopra, chiuderlo toglie
                  tutte le fasce. È quello che fa Google, e nessuno lo trova
                  sorprendente. */}
              <button
                className={aperto ? 'bottone secondario mini' : 'bottone mini'}
                disabled={salvando || !chi}
                style={{ width: 88 }}
                onClick={() => {
                  if (lunedi) {
                    // In una settimana si scrive il giorno intero, in una
                    // chiamata sola: aperto con le fasce di sempre (o 9–18),
                    // chiuso con l'elenco vuoto.
                    const nuove = aperto ? [] : diSempre(g.n).length ? diSempre(g.n) : [DI_SOLITO]
                    void scriviGiorno(data, nuove, motivo)
                    return
                  }
                  if (aperto) {
                    // Una chiamata sola per tutto il giorno: mandarne una per
                    // fascia lascerebbe il giorno mezzo aperto a schermo.
                    void chiama('DELETE', undefined, `?cosa=giorno&utenteId=${chi}&giorno=${g.n}`)
                  } else {
                    void chiama('POST', { cosa: 'settimana', utenteId: chi, giorno: g.n, ...DI_SOLITO })
                  }
                }}
              >
                {aperto ? 'Aperto' : 'Chiuso'}
              </button>

              {aperto ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fasce.map((f, i) => (
                    <div key={`${data}-${i}-${f.dalle}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="time"
                        defaultValue={f.dalle}
                        disabled={salvando}
                        aria-label={`${g.nome}: dalle`}
                        onBlur={(e) => {
                          if (!e.target.value || e.target.value === f.dalle) return
                          const nuove = fasce.map((x, j) =>
                            j === i ? { ...x, dalle: e.target.value } : x
                          )
                          void (lunedi
                            ? scriviGiorno(data, nuove, motivo)
                            : chiamaSettimana(g.n, nuove))
                        }}
                      />
                      <span className="cella-sub">–</span>
                      <input
                        type="time"
                        defaultValue={f.alle}
                        disabled={salvando}
                        aria-label={`${g.nome}: alle`}
                        onBlur={(e) => {
                          if (!e.target.value || e.target.value === f.alle) return
                          const nuove = fasce.map((x, j) => (j === i ? { ...x, alle: e.target.value } : x))
                          void (lunedi
                            ? scriviGiorno(data, nuove, motivo)
                            : chiamaSettimana(g.n, nuove))
                        }}
                      />
                      {fasce.length > 1 ? (
                        <button
                          className="bottone secondario mini"
                          disabled={salvando}
                          title="Togli questa fascia"
                          onClick={() => {
                            const nuove = fasce.filter((_, j) => j !== i)
                            void (lunedi
                              ? scriviGiorno(data, nuove, motivo)
                              : chiamaSettimana(g.n, nuove))
                          }}
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
                    onClick={() => {
                      const nuove = [...fasce, { dalle: '15:00', alle: '18:00' }]
                      void (lunedi ? scriviGiorno(data, nuove, motivo) : chiamaSettimana(g.n, nuove))
                    }}
                  >
                    + Aggiungi orario
                  </button>
                </div>
              ) : (
                <span className="cella-muta" style={{ paddingTop: 5 }}>
                  non lavora
                </span>
              )}

              {/* ⚠️ Un giorno staccato dalla regola DEVE dirlo, e deve avere il
                  modo di tornare indietro: senza, chi guarda la settimana non
                  saprebbe se sta vedendo il solito o un'eccezione, e non
                  saprebbe come disfarla. */}
              {lunedi && staccato ? (
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    marginLeft: 'auto',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="badge">solo questa settimana</span>
                  <input
                    defaultValue={motivo}
                    disabled={salvando}
                    placeholder="motivo"
                    aria-label="Motivo"
                    style={{ width: 130 }}
                    onBlur={(e) => {
                      if (e.target.value.trim() === motivo) return
                      const riga = scritteIl(data)[0]
                      if (riga) void chiama('PATCH', { id: riga.id, motivo: e.target.value })
                    }}
                  />
                  <button
                    className="bottone secondario mini"
                    disabled={salvando}
                    title="Questo giorno torna a seguire la regola di sempre"
                    onClick={() =>
                      void chiama('DELETE', undefined, `?cosa=data&utenteId=${chi}&giorno=${data}`)
                    }
                  >
                    Torna al solito
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* ── I PROSSIMI CAMBI ── così non si va a caccia settimana per settimana. */}
      <ProssimiCambi dati={dati} vaiAllaSettimana={(d) => setLunedi(lunediDi(new Date(`${d}T12:00:00`)))} />
    </main>
  )

  /**
   * Riscrive un giorno della REGOLA con l'elenco di fasce dato.
   *
   * ⚠️ Una chiamata sola, e dall'altra parte una transazione: «cancella e poi
   * riscrivi» in due colpi vorrebbe dire che, se il secondo non arriva, il
   * giorno resta **vuoto** — cioè avremmo cancellato un turno per cambiargli
   * mezz'ora.
   */
  function chiamaSettimana(n: number, fasce: Fascia[]) {
    return chiama('POST', { cosa: 'settimana-giorno', utenteId: chi, giorno: n, fasce })
  }
}

/** L'elenco dei giorni staccati dalla regola, da qui in avanti. */
function ProssimiCambi({
  dati,
  vaiAllaSettimana,
}: {
  dati: EsitoTurni
  vaiAllaSettimana: (giorno: string) => void
}) {
  const oggi = giornoIso(new Date())
  const prossimi = dati.eccezioni.filter((e) => e.giorno >= oggi)
  // Un giorno con due fasce ha due righe: qui se ne mostra una sola.
  const visti = new Set<string>()
  const righe = prossimi.filter((e) => {
    const k = e.utenteId + e.giorno
    if (visti.has(k)) return false
    visti.add(k)
    return true
  })

  if (righe.length === 0) return null

  return (
    <>
      <h2 style={{ fontSize: 17, marginTop: 28, marginBottom: 4 }}>Prossimi cambi</h2>
      <p className="descrizione" style={{ marginTop: 0 }}>
        I giorni che non seguono la regola, di tutti. Clicca per aprire la loro settimana.
      </p>
      <div className="card" style={{ padding: 0 }}>
        {righe.map((e, i) => {
          const fasce = prossimi.filter(
            (x) => x.utenteId === e.utenteId && x.giorno === e.giorno && x.tipo === 'orario'
          )
          return (
            <button
              key={e.id}
              onClick={() => vaiAllaSettimana(e.giorno)}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '10px 16px',
                width: '100%',
                background: 'none',
                border: 'none',
                borderBottom: i === righe.length - 1 ? 'none' : '1px solid var(--hairline)',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                flexWrap: 'wrap',
              }}
            >
              <span className="cella-nome" style={{ minWidth: 120 }}>
                {new Date(`${e.giorno}T12:00:00`).toLocaleDateString('it-IT', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              <span style={{ minWidth: 150 }}>{e.utenteNome}</span>
              {fasce.length ? (
                fasce.map((f) => (
                  <span key={f.id} className="badge">
                    {f.dalle}–{f.alle}
                  </span>
                ))
              ) : (
                <span className="badge rosso">Non lavora</span>
              )}
              <span className="cella-muta">{e.motivo}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
