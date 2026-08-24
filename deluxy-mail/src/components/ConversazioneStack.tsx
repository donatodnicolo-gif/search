'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { azioneMassa, corpoDiMessaggio, segnaLetto } from '@/lib/actions'
import { CorpoMessaggio } from './CorpoMessaggio'
import { RispostaAzioni } from './RispostaAzioni'
import { StaccaRiga } from './StaccaRiga'
import { AllegatiMessaggio } from './AllegatiMessaggio'
import { BottoneApp } from './BottoneApp'
import { DelegaReneBottone } from './DelegaRene'
import { dichiaraFuocoConversazione } from './fuocoConversazione'

export type RigaConversazione = {
  id: string
  mittente: string
  mittenteNome: string | null
  destinatari: string
  direzione: string
  oggetto: string
  /** Prima riga di quello che è stato scritto DAVVERO (senza la citazione). */
  anteprima: string
  /** Data già formattata dal server: qui non si formattano date (fuso). */
  quando: string
  quandoLungo: string
  letto: boolean
  allegati: number
  priorita: string | null
}

type Props = {
  righe: RigaConversazione[]
  /** La mail aperta a tutta pagina, che sta sopra: qui si segna e non si apre. */
  correnteId: string
  /** L'oggetto del thread: si mostra una volta sola, non su ogni riga. */
  oggetto: string
}

/**
 * LA CONVERSAZIONE, TUTTA IN UN POSTO.
 *
 * Prima questo era un elenco di link: per leggere il quinto messaggio si
 * cambiava pagina, si perdeva il segno e non si potevano mai vedere due
 * messaggi insieme. Ora la conversazione è una PILA che si apre sul posto —
 * è il modo di Gmail, ed è quello giusto — con tre differenze volute:
 *
 * 1. sulla riga chiusa non c'è l'oggetto (in un thread è lo stesso per tutti e
 *    non dice niente) ma la PRIMA RIGA scritta davvero, senza la citazione:
 *    è l'unica cosa che permette di scorrere un thread lungo e capire dove
 *    guardare;
 * 2. il corpo si carica solo quando apri: la pagina non si porta dietro il
 *    testo di venti mail per mostrarne una;
 * 3. si gira con la TASTIERA (j/k, Invio, r), come nei client veloci: chi
 *    lavora sulla posta non deve prendere il mouse per leggere.
 */
export function ConversazioneStack({ righe, correnteId, oggetto }: Props) {
  // Lo stato «letta» si tiene anche QUI, in locale: la spunta deve muoversi al
  // clic, non a fine giro (lezione già pagata con le attività). Parte da
  // quello che dice il server e vince finché la pagina non si rilegge.
  const [lette, setLette] = useState<Set<string>>(new Set())
  const eLetta = (r: RigaConversazione) => r.letto || lette.has(r.id)
  const [inCorso, start] = useTransition()

  const segna = (ids: string[]) =>
    start(async () => {
      setLette((s) => new Set([...s, ...ids]))
      try {
        if (ids.length === 1) await segnaLetto(ids[0], true)
        else await azioneMassa(ids, 'letto')
      } catch {
        // Non è riuscito: si torna indietro, invece di mostrare una cosa falsa.
        setLette((s) => {
          const n = new Set(s)
          for (const i of ids) n.delete(i)
          return n
        })
      }
    })

  // Aperte: di default l'ULTIMA (se non è quella già aperta sopra a tutta
  // pagina). È la regola di Gmail e vale: l'ultima è quella che serve.
  const ultima = righe.length > 0 ? righe[righe.length - 1] : null
  const [aperte, setAperte] = useState<Set<string>>(
    () => new Set(ultima && ultima.id !== correnteId ? [ultima.id] : [])
  )
  const [fuoco, setFuoco] = useState<string | null>(ultima?.id ?? null)
  const contenitore = useRef<HTMLDivElement>(null)

  const apriChiudi = useCallback((id: string) => {
    setAperte((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    setFuoco(id)
    // Da qui in poi «r» risponde a QUESTO messaggio, non a quello in cima.
    dichiaraFuocoConversazione(id)
  }, [])

  // Uscendo dalla pagina il tasto «r» torna alla mail aperta.
  useEffect(() => () => dichiaraFuocoConversazione(null), [])

  const tutteAperte = aperte.size >= righe.filter((r) => r.id !== correnteId).length && righe.length > 1

  // ---- Tastiera: j/k per muoversi, Invio per aprire, r per rispondere ----
  useEffect(() => {
    const su = (e: KeyboardEvent) => {
      // Mai mentre si scrive: in un campo di testo «r» è una lettera.
      const t = e.target as HTMLElement | null
      const dentroUnCampo =
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      if (dentroUnCampo || e.metaKey || e.ctrlKey || e.altKey) return

      const i = righe.findIndex((r) => r.id === fuoco)
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        const prossimo = e.key === 'j' ? Math.min(righe.length - 1, i + 1) : Math.max(0, i - 1)
        const r = righe[prossimo]
        if (!r) return
        setFuoco(r.id)
        dichiaraFuocoConversazione(r.id)
        document.getElementById(`conv-${r.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      if (!fuoco) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (fuoco === correnteId) window.scrollTo({ top: 0, behavior: 'smooth' })
        else apriChiudi(fuoco)
        return
      }
      // ⚠️ «r» NON si gestisce qui: lo fanno le scorciatoie globali, che sanno
      // già quale messaggio è a fuoco (vedi fuocoConversazione.ts). Averlo in
      // due posti significherebbe due comportamenti diversi per lo stesso tasto.
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  }, [righe, fuoco, correnteId, apriChiudi])

  if (righe.length === 0) return null

  // La prima non letta: sopra ci va la riga «da qui non hai letto», come nei
  // client che si usano davvero — dice dove riprendere senza contare.
  const nonLette = righe.filter((r) => !eLetta(r) && r.direzione === 'entrata' && r.id !== correnteId)
  const primaNonLetta = nonLette[0]

  return (
    <div className="conv-stack" ref={contenitore}>
      <div className="conv-testa">
        <div style={{ minWidth: 0 }}>
          <div className="conv-oggetto">{oggetto}</div>
          <div className="conv-sotto">
            {righe.length} messaggi · <kbd>j</kbd>/<kbd>k</kbd> per muoverti, <kbd>Invio</kbd> per
            aprire, <kbd>r</kbd> per rispondere · <kbd>?</kbd> tutte le scorciatoie
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {nonLette.length > 0 && (
            <button
              type="button"
              className="azione-riga"
              disabled={inCorso}
              title="Toglie il pallino blu da tutte le mail non lette di questa conversazione"
              onClick={() => segna(nonLette.map((r) => r.id))}
            >
              ✓ Segna come {nonLette.length === 1 ? 'letto' : `letti (${nonLette.length})`}
            </button>
          )}
          <button
            type="button"
            className="azione-riga"
            onClick={() =>
              setAperte(
                tutteAperte ? new Set() : new Set(righe.filter((r) => r.id !== correnteId).map((r) => r.id))
              )
            }
          >
            {tutteAperte ? 'Chiudi tutte' : 'Apri tutte'}
          </button>
        </div>
      </div>

      {righe.map((r) => {
        const corrente = r.id === correnteId
        const aperta = aperte.has(r.id)
        const chi = r.direzione === 'uscita' ? 'Tu' : r.mittenteNome || r.mittente
        return (
          <div key={r.id}>
            {primaNonLetta?.id === r.id && (
              <div className="conv-nonlette">
                <span>da qui non hai letto</span>
              </div>
            )}
            <div
              id={`conv-${r.id}`}
              className={`conv-riga${aperta ? ' aperta' : ''}${corrente ? ' corrente' : ''}${
                fuoco === r.id ? ' fuoco' : ''
              }${!eLetta(r) && r.direzione === 'entrata' ? ' nonletta' : ''}`}
            >
              <div className="conv-riga-testa">
              <button
                type="button"
                className="conv-intestazione"
                onClick={() => (corrente ? window.scrollTo({ top: 0, behavior: 'smooth' }) : apriChiudi(r.id))}
                title={corrente ? 'È la mail aperta qui sopra' : aperta ? 'Chiudi' : 'Apri qui, senza cambiare pagina'}
              >
                <span className={`conv-iniziali${r.direzione === 'uscita' ? ' mia' : ''}`} aria-hidden>
                  {iniziali(chi)}
                </span>
                <span className="conv-testo">
                  <span className="conv-chi">
                    {chi}
                    {corrente && <span className="badge neutral conv-qui">qui sopra</span>}
                    {r.allegati > 0 && <span className="conv-graffetta" title={`${r.allegati} allegati`}>📎</span>}
                    {r.priorita && <span className={`badge ${coloreP(r.priorita)} conv-p`}>{r.priorita}</span>}
                  </span>
                  {/* Chiusa: la prima riga scritta davvero. Aperta: i
                      destinatari, che è quello che serve sapere leggendo. */}
                  <span className="conv-anteprima">{aperta ? `a ${r.destinatari}` : r.anteprima || '(nessun testo)'}</span>
                </span>
                <span className="conv-quando" title={r.quandoLungo}>
                  {r.quando}
                </span>
              </button>
              {/* ⚠️ Fuori dal bottone della riga: un bottone dentro un altro
                  bottone non si può, e questo deve poter essere premuto senza
                  aprire il messaggio. */}
              {!eLetta(r) && r.direzione === 'entrata' && !corrente && (
                <button
                  type="button"
                  className="conv-segna"
                  disabled={inCorso}
                  title="Segna come letto (senza aprirlo)"
                  aria-label="Segna come letto"
                  onClick={() => segna([r.id])}
                >
                  ✓
                </button>
              )}
              </div>

              {aperta && !corrente && (
                <div className="conv-corpo">
                  {/* ⚠️ LE AZIONI STANNO SOPRA IL CORPO, non sotto.
                      È la QUARTA volta che rientra la stessa segnalazione con la
                      stessa forma: allegati → graffetta in testa, scorciatoie →
                      lettere sui bottoni, app → «→ App» in testa, e ora questi.
                      In una mail lunga tutto ciò che sta sotto il testo, per chi
                      guarda, NON ESISTE: bisogna sapere che c'è e andarlo a
                      cercare scorrendo. Regola per la prossima volta: in questa
                      pagina un comando si mette DOPO l'intestazione, mai in fondo. */}
                  <div className="conv-azioni conv-azioni-alto">
                    <RispostaAzioni id={r.id} />
                    {!eLetta(r) && r.direzione === 'entrata' && (
                      <button
                        type="button"
                        className="azione-riga"
                        disabled={inCorso}
                        onClick={() => segna([r.id])}
                      >
                        ✓ Segna come letto
                      </button>
                    )}
                    {/* Anche da qui si richiama un'app Deluxy: dentro un
                        thread la mail che interessa al registro è spesso una
                        di MEZZO (quella con i dati dell'azienda), non l'ultima
                        — e prima bisognava aprirla a tutta pagina per poterlo
                        fare. Il dialogo è montato nel layout, quindi risponde
                        anche da qui. */}
                    <BottoneApp id={r.id} />
                    <DelegaReneBottone id={r.id} />
                    <Link href={`/messaggio/${r.id}`} className="azione-riga">
                      Apri a tutta pagina →
                    </Link>
                    <StaccaRiga messaggioId={r.id} />
                  </div>
                  <CorpoDellaRiga id={r.id} />
                  {/* ⚠️ Gli ALLEGATI anche qui dentro. La graffetta sulla riga
                      diceva che c'erano, ma per aprirli bisognava andare sulla
                      mail a tutta pagina — e in una conversazione il file che
                      cerchi (la planimetria, il preventivo) sta quasi sempre in
                      un messaggio di MEZZO. Segnalato il 9/08/2026. L'elenco si
                      chiede al server solo quando apri quel messaggio. */}
                  {r.allegati > 0 && <AllegatiMessaggio messaggioId={r.id} quanti={r.allegati} />}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Il corpo di una mail della pila: si chiede al server solo quando si apre. */
function CorpoDellaRiga({ id }: { id: string }) {
  const [dati, setDati] = useState<Awaited<ReturnType<typeof corpoDiMessaggio>> | null>(null)
  const [errore, setErrore] = useState(false)

  useEffect(() => {
    let vivo = true
    corpoDiMessaggio(id)
      .then((r) => vivo && (r.ok ? setDati(r) : setErrore(true)))
      .catch(() => vivo && setErrore(true))
    return () => {
      vivo = false
    }
  }, [id])

  if (errore) return <div className="muted" style={{ fontSize: 13 }}>Non sono riuscito a leggere questo messaggio.</div>
  if (!dati) return <div className="muted" style={{ fontSize: 13 }}>Carico il messaggio…</div>

  return (
    <CorpoMessaggio
      html={dati.html}
      testo={dati.testo}
      tradotto={dati.tradotto}
      lingua={dati.lingua}
      htmlDalServerDi={dati.htmlDalServer ? id : undefined}
    />
  )
}

function iniziali(nome: string): string {
  const p = nome.replace(/[<>"]/g, ' ').trim().split(/[\s.@]+/).filter(Boolean)
  if (p.length === 0) return '?'
  return (p[0][0] + (p[1]?.[0] ?? '')).toUpperCase()
}

function coloreP(p: string): string {
  return p === 'P0' ? 'red' : p === 'P1' ? 'orange' : p === 'P2' ? 'blue' : 'neutral'
}
