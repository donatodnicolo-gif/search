'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { corpoDiMessaggio } from '@/lib/actions'
import { CorpoMessaggio } from './CorpoMessaggio'
import { RispostaAzioni } from './RispostaAzioni'
import { StaccaRiga } from './StaccaRiga'

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
  }, [])

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
      if (e.key === 'r') {
        e.preventDefault()
        window.location.href = `/messaggio/${fuoco}/scrivi?modo=rispondi`
      }
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  }, [righe, fuoco, correnteId, apriChiudi])

  if (righe.length === 0) return null

  // La prima non letta: sopra ci va la riga «da qui non hai letto», come nei
  // client che si usano davvero — dice dove riprendere senza contare.
  const primaNonLetta = righe.find((r) => !r.letto && r.direzione === 'entrata' && r.id !== correnteId)

  return (
    <div className="conv-stack" ref={contenitore}>
      <div className="conv-testa">
        <div style={{ minWidth: 0 }}>
          <div className="conv-oggetto">{oggetto}</div>
          <div className="conv-sotto">
            {righe.length} messaggi · <kbd>j</kbd>/<kbd>k</kbd> per muoverti, <kbd>Invio</kbd> per
            aprire, <kbd>r</kbd> per rispondere
          </div>
        </div>
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
              }${!r.letto && r.direzione === 'entrata' ? ' nonletta' : ''}`}
            >
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

              {aperta && !corrente && (
                <div className="conv-corpo">
                  <CorpoDellaRiga id={r.id} />
                  <div className="conv-azioni">
                    <RispostaAzioni id={r.id} />
                    <Link href={`/messaggio/${r.id}`} className="azione-riga">
                      Apri a tutta pagina →
                    </Link>
                    <StaccaRiga messaggioId={r.id} />
                  </div>
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
