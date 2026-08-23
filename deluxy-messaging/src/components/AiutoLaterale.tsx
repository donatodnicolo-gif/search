'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Il pannello dell'aiuto: una linguetta sul bordo destro, sempre lì.
//
// ⚠️⚠️ **Sta su ogni pagina apposta.** Ci si blocca mentre si sta facendo una
// cosa, non prima: se per chiedere bisogna uscire da dove si è, si perde il
// contesto — e con quello la voglia. La linguetta si apre dove sei.
//
// ⚠️⚠️ **Il contesto lo registra il codice, non la persona.** «Che faccio?» non
// si può rispondere, «che faccio con l'ordine #2783» sì: la pagina e il numero
// d'ordine si prendono dall'indirizzo. Chiederli in un campo vorrebbe dire che
// una domanda su tre arriva senza, e chi risponde deve rincorrere.
//
// ⚠️ Le domande **restano scritte anche dopo la risposta**, ed è il motivo per
// cui esistono: rilette tutte insieme dicono che cosa non è chiaro — cioè cosa
// manca nel glossario, negli script o nelle istruzioni dell'AI.

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
  risposta: string
  rispostaDaNome: string
  rispostaIl: string | null
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
 * Dove porta una domanda quando ci si clicca sopra.
 *
 * ⚠️ Prima la **chat**, poi l'**ordine**: se una domanda nasce da una
 * conversazione, quello che serve a chi risponde è leggere che cosa si sono
 * detti — l'ordine lo si raggiunge da lì. Senza né l'una né l'altro non si
 * porta da nessuna parte: un clic che non fa niente è peggio di un clic che non
 * c'è, perché la prima volta si crede a un guasto.
 */
function dovePorta(d: { conversazioneId: string; ordineNumero: string }): string {
  if (d.conversazioneId) return `/inbox?c=${encodeURIComponent(d.conversazioneId)}`
  // ⚠️ Il numero si cerca SENZA cancelletto: è così che lo tiene la ricerca
  // degli ordini globali.
  if (d.ordineNumero) return `/ordini-globali?q=${encodeURIComponent(d.ordineNumero.replace('#', ''))}`
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
  // Il contesto letto dall'indirizzo nel momento in cui si apre il pannello.
  const [contesto, setContesto] = useState({ conversazione: '', ordine: '' })
  const [aperto, setAperto] = useState(false)
  const [dati, setDati] = useState<Dati>(VUOTO)
  const [testo, setTesto] = useState('')
  const [ordine, setOrdine] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')
  const [rispostaA, setRispostaA] = useState('')
  const [testoRisposta, setTestoRisposta] = useState('')

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

  // ⚠️⚠️ **Ricaricare APRENDO il pannello** è la cosa che mancava, e si è vista
  // subito alla prima prova vera: la risposta era arrivata in 17 secondi, ma chi
  // apriva il pannello vedeva ancora «in attesa» — perché i dati erano quelli
  // dell'ultimo giro. Un pannello che si apre su una cosa vecchia fa credere
  // che il canale non funzioni, ed è il modo più veloce per farlo abbandonare.
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
  // Con `useSearchParams` il pannello continuerebbe a leggere l'indirizzo di
  // quando la pagina è stata caricata — cioè quasi sempre senza la chat.
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

  // Il pallino sulla linguetta: per l'amministratore le domande che aspettano
  // lui, per gli altri le risposte che non hanno ancora letto.
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
            ? 'Le domande dei colleghi, e il posto per rispondere'
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
              <strong>{dati.amministratore ? 'Domande dei colleghi' : 'Chiedi aiuto'}</strong>
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
                  rows={3}
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
              {/* ⚠️ Si dice a schermo che la pagina viene allegata: allegare in
                  silenzio qualcosa di chi scrive è un modo per farlo scoprire
                  male. E chi lo sa scrive domande migliori. */}
              <p className="cella-sub" style={{ marginTop: -4, marginBottom: 8 }}>
                Insieme alla domanda parte anche <strong>da dove la stai facendo</strong> ({path}
                ): serve a chi risponde per capire di cosa parli.
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

            {/* ── L'ELENCO ── */}
            <div className="aiuto-elenco">
              {dati.domande.length === 0 ? (
                <p className="descrizione" style={{ padding: 16 }}>
                  {dati.amministratore
                    ? 'Nessuno ha chiesto niente.'
                    : 'Non hai ancora chiesto niente. Le domande e le risposte restano qui.'}
                </p>
              ) : (
                dati.domande.map((d) => (
                  <div
                    key={d.id}
                    className={`aiuto-riga${dovePorta(d) ? ' apribile' : ''}`}
                    // ⚠️ Il clic sta sulla RIGA, non su un link in fondo: chi
                    // legge una domanda vuole vedere di cosa parla, e cercare un
                    // bottone piccolo per farlo è un passaggio di troppo.
                    // ⚠️ Ma non deve rubare i clic dei bottoni che ci stanno
                    // dentro («Rispondi», «L'ho letta»): quelli fermano l'evento
                    // da soli, e senza il controllo qui sotto premere Rispondi
                    // porterebbe via dalla pagina.
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, a, textarea, input')) return
                      const dove = dovePorta(d)
                      if (dove) window.location.href = dove
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {d.stato === 'aperta' ? (
                        <span className="badge rosso">in attesa</span>
                      ) : (
                        <span className="badge verde">risposta</span>
                      )}
                      {d.ordineNumero ? <span className="badge">{d.ordineNumero}</span> : null}
                      <span className="cella-sub">
                        {d.mia ? 'tu' : d.utenteNome} · {quando(d.creatoIl)}
                        {d.pagina ? ` · da ${d.pagina}` : ''}
                      </span>
                    </div>
                    <p style={{ margin: '5px 0 0', fontSize: 14 }}>{d.testo}</p>
                    {dovePorta(d) ? (
                      <p className="cella-sub" style={{ marginTop: 3 }}>
                        {d.conversazioneId ? 'Clicca per aprire la chat' : 'Clicca per aprire l’ordine'}
                      </p>
                    ) : null}

                    {/* ── L'AVVISO SU WHATSAPP ──
                        ⚠️⚠️ Se non è partito bisogna DIRLO, e forte: chi crede
                        di aver avvisato qualcuno che invece non sa niente sta
                        peggio di chi sa di non averlo avvisato. Fuori dalla
                        finestra di 24 ore WhatsApp rifiuta i messaggi liberi,
                        e capita spesso. */}
                    {d.stato === 'aperta' && d.avvisoEsito && d.avvisoEsito !== 'inviato' ? (
                      <p className="aiuto-avviso-ko">
                        ⚠️ L’avviso su WhatsApp <strong>non è partito</strong>: {d.avvisoEsito}
                        <br />
                        La domanda è comunque salvata e si vede qui. Per riaprire il canale
                        basta che l’amministratore scriva una parola al numero aziendale.
                      </p>
                    ) : null}
                    {d.stato === 'aperta' && d.avvisoEsito === 'inviato' ? (
                      <p className="cella-sub" style={{ marginTop: 3 }}>
                        Avvisato su WhatsApp{d.codice ? ` · codice ${d.codice}` : ''}
                      </p>
                    ) : null}

                    {d.risposta ? (
                      <div className="aiuto-risposta">
                        <p style={{ margin: 0, fontSize: 14 }}>{d.risposta}</p>
                        <p className="cella-sub" style={{ marginTop: 3 }}>
                          {d.rispostaDaNome}
                          {d.rispostaIl ? ` · ${quando(d.rispostaIl)}` : ''}
                        </p>
                        {/* ⚠️ «L'ho letta» toglie il pallino solo a chi ha
                            chiesto: è il segnale che la risposta è arrivata a
                            destinazione, non che è stata scritta. */}
                        {d.mia && !d.lettaIl ? (
                          <button
                            className="bottone secondario mini"
                            disabled={salvando}
                            onClick={() => void manda({ azione: 'letta', id: d.id })}
                          >
                            L’ho letta
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {dati.amministratore && d.stato === 'aperta' ? (
                      rispostaA === d.id ? (
                        <div style={{ marginTop: 6 }}>
                          <textarea
                            rows={2}
                            value={testoRisposta}
                            onChange={(e) => setTestoRisposta(e.target.value)}
                            placeholder="La risposta…"
                            style={{ width: '100%' }}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button
                              className="bottone mini"
                              disabled={salvando || !testoRisposta.trim()}
                              onClick={async () => {
                                const ok = await manda({
                                  azione: 'rispondi',
                                  id: d.id,
                                  testo: testoRisposta,
                                })
                                if (ok) {
                                  setRispostaA('')
                                  setTestoRisposta('')
                                }
                              }}
                            >
                              Manda la risposta
                            </button>
                            <button
                              className="bottone secondario mini"
                              onClick={() => setRispostaA('')}
                            >
                              Lascia stare
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="bottone secondario mini"
                          style={{ marginTop: 6 }}
                          onClick={() => {
                            setRispostaA(d.id)
                            setTestoRisposta('')
                          }}
                        >
                          Rispondi
                        </button>
                      )
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <p className="cella-sub" style={{ padding: '10px 16px', margin: 0 }}>
              La domanda arriva all’amministratore <strong>su WhatsApp</strong>, e lui può
              rispondere da lì: la risposta compare qui. Le domande restano scritte anche
              dopo la risposta — rilette tutte insieme dicono che cosa non è chiaro, e da lì
              si capisce cosa aggiungere al glossario o alle risposte pronte.
            </p>
          </aside>
        </>
      ) : null}
    </>
  )
}
