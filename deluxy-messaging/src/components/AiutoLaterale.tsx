'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Il pannello dell'aiuto: una linguetta sul bordo destro, sempre lì.
//
// ⚠️⚠️ **Sta su ogni pagina apposta.** Ci si blocca mentre si sta facendo una
// cosa, non prima: se per chiedere bisogna uscire da dove si è, si perde il
// contesto — e con quello la voglia. La linguetta si apre dove sei.
//
// ⚠️⚠️ **È uno SCAMBIO, non una domanda sola.** La prima versione aveva una
// domanda e una risposta, e si è rotta al primo uso vero: l'amministratore ha
// risposto «cosa hai bisogno?» e chi aveva chiesto non poteva continuare.
//
// ⚠️⚠️ **Il contesto lo registra il codice, non la persona.** «Che faccio?» non
// si può rispondere, «che faccio con l'ordine #2783» sì: la pagina e la chat
// aperta si prendono dall'indirizzo.
//
// ⚠️ Le richieste **restano scritte anche dopo**, ed è il motivo per cui
// esistono: rilette tutte insieme dicono che cosa non è chiaro — cioè cosa
// manca nel glossario, negli script o nelle istruzioni dell'AI.

type MessaggioAiuto = {
  id: string
  autore: string
  autoreNome: string
  testo: string
  viaWhatsApp: boolean
  avvisoEsito: string
  creatoIl: string
}

type Domanda = {
  id: string
  testo: string
  pagina: string
  ordineNumero: string
  conversazioneId: string
  utenteNome: string
  mia: boolean
  stato: string
  avvisoEsito: string
  codice: string
  messaggi: MessaggioAiuto[]
  ultimoAutore: string
  lettaIl: string | null
  creatoIl: string
}

type Dati = {
  domande: Domanda[]
  daRispondere: number
  risposteDaLeggere: number
  amministratore: boolean
}

const VUOTO: Dati = { domande: [], daRispondere: 0, risposteDaLeggere: 0, amministratore: false }

/**
 * Dove porta una richiesta quando ci si clicca sopra.
 *
 * ⚠️ Prima la **chat**, poi l'**ordine**: se una domanda nasce da una
 * conversazione, quello che serve a chi risponde è leggere che cosa si sono
 * detti. Senza né l'una né l'altro non si porta da nessuna parte: un clic che
 * non fa niente è peggio di un clic che non c'è.
 */
function dovePorta(d: { conversazioneId: string; ordineNumero: string }): string {
  if (d.conversazioneId) return `/inbox?c=${encodeURIComponent(d.conversazioneId)}`
  // ⚠️ Il numero si cerca SENZA cancelletto: è così che lo tiene la ricerca
  // degli ordini globali.
  if (d.ordineNumero) {
    return `/ordini-globali?q=${encodeURIComponent(d.ordineNumero.replace('#', ''))}`
  }
  return ''
}

function quando(iso: string): string {
  const d = new Date(iso)
  const oggi = new Date()
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === oggi.toDateString()) return ora
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · ${ora}`
}

export function AiutoLaterale() {
  const path = usePathname()
  const [contesto, setContesto] = useState({ conversazione: '', ordine: '' })
  const [aperto, setAperto] = useState(false)
  const [dati, setDati] = useState<Dati>(VUOTO)
  const [testo, setTesto] = useState('')
  const [ordine, setOrdine] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')
  /** Quale filo si sta continuando, e cosa si sta scrivendo dentro. */
  const [filoAperto, setFiloAperto] = useState('')
  const [seguito, setSeguito] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/aiuto')
      if (!res.ok) return
      setDati((await res.json()) as Dati)
    } catch {
      // Il pannello dell'aiuto non deve far rumore se la rete cade: è un
      // accessorio, e un errore rosso su ogni pagina sarebbe peggio del guasto.
    }
  }, [])

  // ⚠️⚠️ Ricaricare APRENDO il pannello è la cosa che mancava, e si è vista
  // subito alla prima prova vera: la risposta era arrivata in 17 secondi, ma chi
  // apriva il pannello vedeva ancora «in attesa». Un pannello che si apre su una
  // cosa vecchia fa credere che il canale non funzioni.
  useEffect(() => {
    if (aperto) void carica()
  }, [aperto, carica])

  useEffect(() => {
    void carica()
    // ⚠️ Ogni 45 secondi, non ogni 5 come l'inbox: qui la fretta serve meno, ma
    // due minuti erano troppi — chi aspetta una risposta guarda spesso.
    const t = setInterval(() => void carica(), 45_000)
    // ⚠️ E al ritorno sulla finestra: chi va su WhatsApp a leggere la risposta e
    // torna qui deve trovarla, non aspettare il prossimo giro.
    const alRitorno = () => {
      if (!document.hidden) void carica()
    }
    document.addEventListener('visibilitychange', alRitorno)
    window.addEventListener('focus', alRitorno)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alRitorno)
      window.removeEventListener('focus', alRitorno)
    }
  }, [carica])

  // ⚠️⚠️ Si legge `window.location` e NON `useSearchParams`: l'inbox scrive la
  // chat aperta con `history.replaceState`, che il router di Next non vede.
  // ⚠️ Il parametro è `c`, quello che l'inbox usa davvero: la prima versione
  // cercava `conversazione` e non trovava mai niente.
  useEffect(() => {
    if (!aperto) return
    const p = new URLSearchParams(window.location.search)
    const conversazione = p.get('c') || ''
    const ordineUrl = p.get('ordine') || p.get('numero') || ''
    setContesto({ conversazione, ordine: ordineUrl })
    if (ordineUrl && !ordine) setOrdine(ordineUrl)
  }, [aperto, ordine])

  async function manda(corpo: Record<string, unknown>) {
    setSalvando(true)
    setErrore('')
    try {
      const res = await fetch('/api/aiuto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const d = (await res.json()) as Dati & { errore?: string }
      if (!res.ok) {
        setErrore(d.errore ?? 'Non sono riuscito a salvare.')
        return false
      }
      setDati(d)
      return true
    } catch {
      setErrore('Non sono riuscito a salvare: problema di rete.')
      return false
    } finally {
      setSalvando(false)
    }
  }

  const daVedere = dati.amministratore ? dati.daRispondere : dati.risposteDaLeggere

  return (
    <>
      <button
        className={`aiuto-linguetta${daVedere ? ' segnalata' : ''}`}
        onClick={() => setAperto((a) => !a)}
        aria-expanded={aperto}
        aria-controls="pannello-aiuto"
        title={
          dati.amministratore
            ? 'Le richieste dei colleghi, e il posto per rispondere'
            : 'Chiedi all’amministratore, senza uscire da qui'
        }
      >
        Aiuto{daVedere ? ` · ${daVedere}` : ''}
      </button>

      {aperto ? (
        <>
          <div className="aiuto-velo" onClick={() => setAperto(false)} />
          <aside className="aiuto-pannello" id="pannello-aiuto">
            <div className="aiuto-testa">
              <strong>{dati.amministratore ? 'Richieste dei colleghi' : 'Chiedi aiuto'}</strong>
              <button className="bottone secondario mini" onClick={() => setAperto(false)}>
                Chiudi
              </button>
            </div>

            {errore ? <div className="avviso-errore">{errore}</div> : null}

            {/* ── CHIEDERE ──
                ⚠️ C'è anche per l'amministratore: chi coordina si blocca come
                gli altri, e un pannello che a lui non lo lascia chiedere gli
                dice che i suoi dubbi non contano. */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
              <label className="campo">
                <span>Che cosa ti serve sapere?</span>
                <textarea
                  rows={2}
                  value={testo}
                  onChange={(e) => setTesto(e.target.value)}
                  placeholder="Il cliente chiede la consegna alle 7 di mattina: posso confermare?"
                />
              </label>
              <label className="campo">
                <span>Ordine (facoltativo)</span>
                <input
                  value={ordine}
                  onChange={(e) => setOrdine(e.target.value)}
                  placeholder="#2783"
                />
              </label>
              {/* ⚠️ Si dice a schermo che il contesto viene allegato: allegare
                  in silenzio qualcosa di chi scrive è un modo per farlo
                  scoprire male. E chi lo sa scrive domande migliori. */}
              <p className="cella-sub" style={{ marginTop: -4, marginBottom: 8 }}>
                Parte anche <strong>da dove la stai facendo</strong> ({path}
                {contesto.conversazione ? ', con la chat aperta' : ''}).
              </p>
              <button
                className="bottone"
                disabled={salvando || !testo.trim()}
                onClick={async () => {
                  const ok = await manda({
                    azione: 'chiedi',
                    testo,
                    pagina: path,
                    ordineNumero: ordine,
                    conversazioneId: contesto.conversazione,
                  })
                  if (ok) {
                    setTesto('')
                    setOrdine('')
                  }
                }}
              >
                Manda la domanda
              </button>
            </div>

            {/* ── I FILI ── */}
            <div className="aiuto-elenco">
              {dati.domande.length === 0 ? (
                <p className="descrizione" style={{ padding: 16 }}>
                  {dati.amministratore
                    ? 'Nessuno ha chiesto niente.'
                    : 'Non hai ancora chiesto niente. Le richieste e le risposte restano qui.'}
                </p>
              ) : (
                dati.domande.map((d) => {
                  const stoScrivendo = filoAperto === d.id
                  // ⚠️ Un operatore continua solo le PROPRIE: intromettersi
                  // nello scambio di un collega non è aiutare, è confondere chi
                  // deve rispondere.
                  const posso = dati.amministratore || d.mia
                  return (
                    <div key={d.id} className={`aiuto-riga${d.stato === 'chiusa' ? ' chiusa' : ''}`}>
                      <div
                        style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        {d.stato === 'chiusa' ? (
                          <span className="badge">chiusa</span>
                        ) : d.ultimoAutore === 'operatore' ? (
                          <span className="badge rosso">aspetta risposta</span>
                        ) : (
                          <span className="badge verde">ha risposto</span>
                        )}
                        {d.ordineNumero ? <span className="badge">{d.ordineNumero}</span> : null}
                        <span className="cella-sub">
                          {d.mia ? 'tu' : d.utenteNome} · {quando(d.creatoIl)}
                          {d.pagina ? ` · da ${d.pagina}` : ''}
                        </span>
                        {dovePorta(d) ? (
                          <a
                            className="bottone secondario mini"
                            href={dovePorta(d)}
                            style={{ marginLeft: 'auto' }}
                          >
                            {d.conversazioneId ? 'Apri la chat ↗' : 'Apri l’ordine ↗'}
                          </a>
                        ) : null}
                      </div>

                      {/* Il filo: la domanda, e tutto quello che è venuto dopo. */}
                      <div className="aiuto-filo">
                        <p className="aiuto-bolla operatore">{d.testo}</p>
                        {d.messaggi.map((m) => (
                          <p
                            key={m.id}
                            className={`aiuto-bolla ${m.autore === 'admin' ? 'admin' : 'operatore'}`}
                          >
                            {m.testo}
                            <span className="cella-sub" style={{ display: 'block', marginTop: 2 }}>
                              {m.autoreNome}
                              {/* ⚠️ Da dove è entrato il messaggio resta scritto:
                                  una riga scritta dal telefono, in piedi, non è
                                  una riga scritta guardando la schermata. */}
                              {m.viaWhatsApp ? ' · da WhatsApp' : ''} · {quando(m.creatoIl)}
                            </span>
                          </p>
                        ))}
                      </div>

                      {d.stato !== 'chiusa' && d.avvisoEsito && d.avvisoEsito !== 'inviato' ? (
                        <p className="aiuto-avviso-ko">
                          ⚠️ L’avviso su WhatsApp <strong>non è partito</strong>: {d.avvisoEsito}
                          <br />
                          La richiesta è comunque salvata e si vede qui. Per riaprire il canale
                          basta che l’amministratore scriva una parola al numero aziendale.
                        </p>
                      ) : null}

                      {posso ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {stoScrivendo ? (
                            <>
                              <textarea
                                rows={2}
                                value={seguito}
                                onChange={(e) => setSeguito(e.target.value)}
                                placeholder="Continua…"
                                style={{ width: '100%' }}
                              />
                              <button
                                className="bottone mini"
                                disabled={salvando || !seguito.trim()}
                                onClick={async () => {
                                  const ok = await manda({
                                    azione: 'scrivi',
                                    id: d.id,
                                    testo: seguito,
                                  })
                                  if (ok) {
                                    setSeguito('')
                                    setFiloAperto('')
                                  }
                                }}
                              >
                                Manda
                              </button>
                              <button
                                className="bottone secondario mini"
                                onClick={() => {
                                  setFiloAperto('')
                                  setSeguito('')
                                }}
                              >
                                Lascia stare
                              </button>
                            </>
                          ) : (
                            <>
                              {/* ⚠️ Lo stesso bottone per tutti e due: chi ha
                                  chiesto continua, chi risponde risponde. È il
                                  difetto che stiamo togliendo — «cosa hai
                                  bisogno?» dev'essere una domanda a cui si può
                                  rispondere, non un vicolo cieco. */}
                              <button
                                className="bottone secondario mini"
                                onClick={() => {
                                  setFiloAperto(d.id)
                                  setSeguito('')
                                }}
                              >
                                {d.stato === 'chiusa' ? 'Riapri e scrivi' : 'Scrivi'}
                              </button>
                              {d.stato !== 'chiusa' ? (
                                <button
                                  className="bottone secondario mini"
                                  disabled={salvando}
                                  onClick={() => void manda({ azione: 'chiudi', id: d.id })}
                                >
                                  Risolto
                                </button>
                              ) : null}
                              {d.mia && d.ultimoAutore === 'admin' && !d.lettaIl ? (
                                <button
                                  className="bottone secondario mini"
                                  disabled={salvando}
                                  onClick={() => void manda({ azione: 'letta', id: d.id })}
                                >
                                  L’ho letta
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>

            <p className="cella-sub" style={{ padding: '10px 16px', margin: 0 }}>
              La richiesta arriva all’amministratore <strong>su WhatsApp</strong>, e lui può
              rispondere da lì: la risposta compare qui e <strong>la conversazione
              continua</strong>. Resta scritta anche dopo — rilette tutte insieme, le
              richieste dicono che cosa non è chiaro.
            </p>
          </aside>
        </>
      ) : null}
    </>
  )
}
