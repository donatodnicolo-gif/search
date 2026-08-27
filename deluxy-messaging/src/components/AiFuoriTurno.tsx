'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { avvisaSessioneScaduta } from '@/lib/leggi-json'

// ── LA RISPOSTA AUTOMATICA, GOVERNATA DALL'INBOX ──
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «porta la possibilità di rispondere
// automaticamente tramite AI qui», cioè nell'inbox.
//
// Il motore c'era dal 25/08 (`src/lib/ai-fuori-turno.ts`) ed era fatto bene, ma
// viveva in due posti che nell'inbox non si vedono: un interruttore in fondo
// alla pagina Impostazioni e un cron ogni dieci minuti. Risultato, misurato il
// 26/08: **spento da sempre, zero risposte mandate su 1.070 messaggi usciti**, e
// nessuno che potesse accorgersene — l'esito di ogni giro finiva solo nel JSON
// della chiamata.
//
// ⚠️ Un interruttore che sta dove non si lavora è un interruttore che nessuno
// tocca, e uno di cui non si vede lo stato è peggio che non averlo: si crede di
// essere coperti quando non lo si è.
//
// Qui dentro ci sono le tre cose che servono per fidarsi: **com'è messa
// adesso**, **cosa direbbe** (la prova, che non manda niente) e **l'interruttore**.

type Stato = {
  acceso: boolean
  inTurno: string[]
  ultimo: string
  esito: string
  inAttesa: number
  script: number
}

type Giro = {
  fermo: string
  inTurno: string[]
  risposte: number
  domande: number
  saltate: number
  righe: string[]
}

export function AiFuoriTurno({ amministratore }: { amministratore: boolean }) {
  const [stato, setStato] = useState<Stato | null>(null)
  const [aperto, setAperto] = useState(false)
  const [prova, setProva] = useState<Giro | null>(null)
  const [inCorso, setInCorso] = useState('')
  const [errore, setErrore] = useState('')
  // ⚠️⚠️ DOVE disegnare il pannello. Sta appeso alla FINESTRA e non al bottone,
  // e non è un vezzo: la barra dell'inbox vive dentro `.elenco`, che ha
  // `overflow-y: auto` — e un contenitore che scorre RITAGLIA i figli assoluti,
  // sui due assi. Appeso lì dentro, il pannello (420px) sarebbe stato tagliato
  // dalla colonna (~340px) e nessuno avrebbe capito perché: sembra un problema
  // di z-index e non lo è.
  const bottone = useRef<HTMLButtonElement | null>(null)
  const [dove, setDove] = useState<{ top: number; left: number } | null>(null)

  // ⚠️⚠️ SE NON SI SA, NON SI DICE «SPENTA». Prima, quando la lettura falliva —
  // e col 307 verso /login fallisce con `res.ok` **vero**, perché a esplodere è
  // `res.json()` — lo stato restava `null` e `stato?.acceso ?? false` faceva
  // scrivere sul bottone «AI spenta». Su un interruttore che decide se l'app
  // parla ai clienti da sola, «non lo so» letto come «è spenta» è la bugia
  // peggiore: si crede di essere fermi mentre si sta scrivendo.
  const [nonLoSo, setNonLoSo] = useState(false)

  const leggi = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-fuori-turno', { cache: 'no-store' })
      const ct = res.headers.get('content-type') ?? ''
      if (!res.ok || res.redirected || !ct.includes('application/json')) {
        if (res.redirected || res.status === 401) avvisaSessioneScaduta()
        setNonLoSo(true)
        return
      }
      setStato((await res.json()) as Stato)
      setNonLoSo(false)
    } catch {
      setNonLoSo(true)
    }
  }, [])

  // ⚠️ E si riprova. Prima si leggeva **una volta sola**, al montaggio: un
  // inciampo all'apertura della pagina lasciava scritto «AI spenta» per tutta la
  // sessione. Un minuto è abbastanza: questo stato lo cambia una persona, non un
  // evento.
  useEffect(() => {
    void leggi()
    const t = setInterval(() => {
      if (!document.hidden) void leggi()
    }, 60000)
    return () => clearInterval(t)
  }, [leggi])

  async function accendi(acceso: boolean) {
    // ⚠️⚠️ La conferma dice COSA succede, non «sei sicuro?». Accendendo, da
    // questo momento un cliente può ricevere una risposta che in azienda non ha
    // letto nessuno: chi preme deve leggerlo scritto.
    const domanda = acceso
      ? 'Da adesso, quando non è in turno nessuno, l’AI risponde ai clienti da sola.\n\n' +
        'Il cliente riceve un messaggio che nessuno in azienda ha letto prima. Se non sa cosa dire non inventa: chiede all’amministratore su WhatsApp e non risponde.\n\n' +
        'Accendo?'
      : 'Spengo le risposte automatiche: fuori turno nessuno risponderà più fino alla mattina.\n\nSpengo?'
    if (!window.confirm(domanda)) return
    setErrore('')
    setInCorso('interruttore')
    try {
      const res = await fetch('/api/ai-fuori-turno', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceso }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrore((d as { errore?: string }).errore || 'Non è riuscito.')
        return
      }
      setStato(d as Stato)
    } catch {
      setErrore('Non è riuscito: problema di rete.')
    } finally {
      setInCorso('')
    }
  }

  async function giro(finto: boolean) {
    if (!finto) {
      // ⚠️ Un giro vero manda davvero: la conferma dice a quante conversazioni.
      const quante = stato?.inAttesa ?? 0
      if (
        !window.confirm(
          `Faccio rispondere l’AI adesso alle conversazioni che aspettano (${quante}).\n\n` +
            'I messaggi partono davvero, subito. Vale solo per quelle che non ha preso nessuno.\n\nProcedo?'
        )
      )
        return
    }
    setErrore('')
    setProva(null)
    setInCorso(finto ? 'prova' : 'giro')
    try {
      const res = await fetch(`/api/ai-fuori-turno${finto ? '?prova=1' : ''}`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrore((d as { errore?: string }).errore || 'Non è riuscito.')
        return
      }
      setProva(d as Giro)
      await leggi()
    } catch {
      setErrore('Non è riuscito: problema di rete.')
    } finally {
      setInCorso('')
    }
  }

  // La posizione si prende quando si apre, e si rifà se la finestra cambia
  // misura: un pannello che resta dov'era mentre la pagina si riorganizza
  // finisce a metà di un'altra cosa.
  const misura = useCallback(() => {
    const r = bottone.current?.getBoundingClientRect()
    if (!r) return
    // ⚠️⚠️ Allineato a SINISTRA del bottone e TENUTO DENTRO LO SCHERMO. Prima lo
    // allineavo a destra: il bottone sta in una colonna larga 340px sul lato
    // sinistro, e un pannello di 420 allineato al suo bordo destro cominciava a
    // **x = −159**, cioè un terzo fuori dalla finestra. Misurato, non immaginato.
    const larghezza = Math.min(420, window.innerWidth - 24)
    const massimo = window.innerWidth - larghezza - 8
    setDove({ top: r.bottom + 6, left: Math.min(Math.max(8, r.left), Math.max(8, massimo)) })
  }, [])

  useEffect(() => {
    if (!aperto) return
    misura()
    window.addEventListener('resize', misura)
    return () => window.removeEventListener('resize', misura)
  }, [aperto, misura])

  const acceso = stato?.acceso ?? false
  // ⚠️ Fuori turno è la CONDIZIONE, non un dettaglio: accesa ma con qualcuno in
  // turno, l'AI non risponde — e chi guarda il bottone deve poterlo capire senza
  // aprire niente.
  const cheOraE = stato
    ? stato.inTurno.length
      ? `in turno: ${stato.inTurno.join(', ')} — l’AI non risponde`
      : 'adesso non è in turno nessuno'
    : ''

  return (
    <>
      <button
        ref={bottone}
        // ⚠️ La classe si mette solo quando lo stato lo SAPPIAMO: finché la
        // lettura non è tornata (o è fallita) il bottone resta neutro, perché
        // un pallino grigio che dice «spenta» mentre in realtà non lo sappiamo
        // è la bugia che questo componente esiste per non dire.
        className={`bottone secondario mini${stato ? (acceso ? ' ai-accesa' : ' ai-spenta') : ''}`}
        onClick={() => setAperto((v) => !v)}
        title={
          stato
            ? `Risposta automatica dell’AI: ${acceso ? 'ACCESA' : 'spenta'} · ${cheOraE}`
            : 'Risposta automatica dell’AI'
        }
      >
        {stato ? (acceso ? 'AI accesa' : 'AI spenta') : nonLoSo ? 'AI: non lo so' : 'AI…'}
      </button>

      {aperto ? (
        <div
          className="pannello-ai"
          style={dove ? { top: dove.top, left: dove.left } : { visibility: 'hidden' }}
        >
          <div className="pannello-ai-testa">
            <strong>Risponde l’AI</strong>
            <button
              className="bottone secondario mini"
              onClick={() => setAperto(false)}
              aria-label="Chiudi"
            >
              ×
            </button>
          </div>

          {!stato ? (
            <p className={nonLoSo ? 'avviso-errore' : 'descrizione'}>
              {nonLoSo
                ? 'Non riesco a leggere com’è messa: potrebbe essere accesa. Ricarica la pagina, e se non torna rientra dal login.'
                : 'Guardo com’è messa…'}
            </p>
          ) : (
            <>
              <p className="descrizione" style={{ marginTop: 0 }}>
                {acceso ? (
                  <>
                    <strong>Accesa.</strong> Quando non è in turno nessuno, l’AI risponde da sola
                    alle conversazioni che <strong>non ha preso nessuno</strong>. Se non sa cosa
                    dire non inventa: chiede all’amministratore su WhatsApp.
                  </>
                ) : (
                  <>
                    <strong>Spenta.</strong> Fuori turno non risponde nessuno fino alla mattina.
                  </>
                )}
              </p>

              <ul className="pannello-ai-righe">
                <li>{cheOraE}</li>
                <li>
                  aspettano una risposta: <strong>{stato.inAttesa}</strong>
                </li>
                <li>
                  {/* ⚠️ Senza script l'AI non parte affatto: non inventa, attinge.
                      Dirlo qui evita di cercare un guasto che non c'è. */}
                  risposte pronte da cui attinge: <strong>{stato.script}</strong>
                  {stato.script === 0 ? ' — senza queste non risponde' : ''}
                </li>
                <li>
                  {/* ⚠️⚠️ SONO DUE COSE DIVERSE e prima erano scritte come una.
                      «Ultimo controllo» è l'ultima volta che il cron è passato
                      — ogni dieci minuti, anche quando non fa niente perché c'è
                      qualcuno in turno. «L'ultima volta che ha lavorato» è
                      l'ultimo giro che ha davvero guardato le conversazioni.
                      Scritte insieme, un cron sano che rispetta i turni sembrava
                      morto da tre ore. */}
                  {stato.ultimo
                    ? `ultimo controllo: ${new Date(stato.ultimo).toLocaleString('it-IT')}`
                    : 'non risulta nessun controllo: il cron non è mai passato'}
                </li>
                <li>
                  {stato.esito
                    ? `l’ultima volta che ha lavorato: ${stato.esito}`
                    : 'non ha ancora lavorato nessuna conversazione'}
                </li>
              </ul>

              <div className="pannello-ai-azioni">
                <button
                  className="bottone secondario mini"
                  onClick={() => void giro(true)}
                  disabled={!!inCorso}
                  title="Fa tutto il giro e ti mostra cosa risponderebbe, senza mandare niente a nessuno"
                >
                  {inCorso === 'prova' ? 'Provo…' : 'Prova (non manda niente)'}
                </button>
                {amministratore ? (
                  <>
                    <button
                      className="bottone secondario mini"
                      onClick={() => void accendi(!acceso)}
                      disabled={!!inCorso}
                    >
                      {inCorso === 'interruttore' ? '…' : acceso ? 'Spegni' : 'Accendi'}
                    </button>
                    <button
                      className="bottone secondario mini"
                      onClick={() => void giro(false)}
                      disabled={!!inCorso || !stato.inAttesa}
                      title={
                        stato.inAttesa
                          ? 'Fa rispondere l’AI adesso: i messaggi partono davvero'
                          : 'Non c’è niente che aspetti una risposta'
                      }
                    >
                      {inCorso === 'giro' ? 'Mando…' : 'Rispondi adesso'}
                    </button>
                  </>
                ) : (
                  // ⚠️ Non si nasconde e basta: si dice PERCHÉ non c'è. Un
                  // bottone che manca fa credere a un guasto.
                  <span className="cella-sub">
                    accenderla è da amministratore — la prova puoi farla
                  </span>
                )}
              </div>
            </>
          )}

          {errore ? <div className="avviso-errore">{errore}</div> : null}

          {prova ? (
            <div className="pannello-ai-esito">
              <strong>
                {prova.fermo
                  ? prova.fermo
                  : `${prova.risposte} risposte · ${prova.domande} domande · ${prova.saltate} saltate`}
              </strong>
              {prova.righe.length ? (
                <ul className="pannello-ai-righe">
                  {prova.righe.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
