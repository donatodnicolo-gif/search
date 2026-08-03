'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { segnaLetto, smaltisciEProssimo } from '@/lib/actions'
import { mostraFlash } from './Flash'
import { fuocoConversazione } from './fuocoConversazione'

/**
 * LE SCORCIATOIE DA TASTIERA.
 *
 * ⚠️ Lettere singole, non `Ctrl+…`: `Ctrl+R` ricarica la pagina, `Ctrl+F`
 * apre la ricerca del browser, `Ctrl+S` salva la pagina. Rubarle vuol dire
 * rompere cose che l'utente usa da vent'anni. È anche il motivo per cui Gmail
 * e i client veloci usano `r`, `e`, `j`, `k` da soli.
 *
 * Sta nel layout, quindi vale ovunque: le scorciatoie che riguardano UNA mail
 * si accendono da sole quando l'indirizzo è quello di una mail aperta.
 *
 * Non scattano mai mentre si scrive (campo di testo, editor), né con Ctrl,
 * Alt o Cmd premuti — e nemmeno se qualcun altro ha già gestito il tasto
 * (la pila della conversazione usa j/k/Invio/r sulla riga a fuoco).
 */
const APRI_AIUTO = 'aimail:scorciatoie'

/** Apre l'elenco delle scorciatoie (lo usa il tasto «⌨» della barra azioni). */
export function apriScorciatoie() {
  window.dispatchEvent(new CustomEvent(APRI_AIUTO))
}

export function Scorciatoie() {
  const [aiuto, setAiuto] = useState(false)
  const percorso = usePathname()
  const router = useRouter()

  // Il «?» lo trova solo chi già sa che esiste: l'elenco si apre anche dal
  // tasto visibile accanto ai bottoni della mail.
  useEffect(() => {
    const su = () => setAiuto(true)
    window.addEventListener(APRI_AIUTO, su)
    return () => window.removeEventListener(APRI_AIUTO, su)
  }, [])

  useEffect(() => {
    const su = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return
      }

      // Aiuto: «?» ovunque.
      if (e.key === '?') {
        e.preventDefault()
        setAiuto((v) => !v)
        return
      }
      if (e.key === 'Escape' && aiuto) {
        setAiuto(false)
        return
      }

      // Ovunque.
      if (e.key === 'c') {
        e.preventDefault()
        router.push('/scrivi')
        return
      }
      if (e.key === 'u') {
        e.preventDefault()
        router.push('/')
        return
      }

      // Solo su una mail aperta: l'id sta nell'indirizzo.
      const id = percorso?.match(/^\/messaggio\/([^/]+)$/)?.[1]
      if (!id) return

      const vaiA = (modo: string) => {
        e.preventDefault()
        // Se nella conversazione qui sotto c'è un messaggio a fuoco, la
        // risposta parte da QUELLO: è quello che l'utente sta guardando.
        router.push(`/messaggio/${fuocoConversazione() ?? id}/scrivi?modo=${modo}`)
      }
      // Due lettere per la stessa cosa apposta: `r`/`a`/`f` sono quelle di
      // Gmail (chi ci arriva da lì le ha nelle dita), `i` e `t` sono le
      // iniziali italiane — Inoltra, Tutti — che è quello che uno prova per
      // primo qui dentro.
      if (e.key === 'r') return vaiA('rispondi')
      if (e.key === 'a' || e.key === 't') return vaiA('tutti')
      if (e.key === 'f' || e.key === 'i') return vaiA('inoltra')

      // Archivia / cestina e VAI AVANTI: smaltita una mail si apre la
      // successiva, non si torna nell'elenco a cercare dov'eri.
      const smaltisci = (azione: 'cestina' | 'archivia') => {
        e.preventDefault()
        void smaltisciEProssimo(id, azione).then((r) => {
          mostraFlash(r.messaggio)
          router.push(r.prossimo ? `/messaggio/${r.prossimo}` : '/')
        })
      }
      if (e.key === 'e') return smaltisci('archivia')
      // «#» come su Gmail, e il Canc per chi lo cerca lì.
      if (e.key === '#' || e.key === 'Delete') return smaltisci('cestina')
      if (e.key === 's') {
        e.preventDefault()
        void segnaLetto(id, false).then(() => {
          mostraFlash('Segnata da leggere.')
          router.refresh()
        })
      }
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  }, [percorso, router, aiuto])

  if (!aiuto) return null

  return (
    <div className="modal-scrim" onClick={() => setAiuto(false)}>
      <div className="modal" role="dialog" aria-label="Scorciatoie" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Scorciatoie da tastiera</div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Lettere singole, senza Ctrl: <kbd>Ctrl+R</kbd> e compagni restano al browser. Non
          scattano mentre scrivi.
        </p>
        <dl className="scorciatoie">
          {[
            ['c', 'Scrivi una mail nuova'],
            ['u', 'Torna alla posta in arrivo'],
            ['r', 'Rispondi alla mail aperta'],
            ['a o t', 'Rispondi a tutti'],
            ['i o f', 'Inoltra'],
            ['e', 'Archivia e apri la successiva'],
            ['# o Canc', 'Cestina e apri la successiva (si recupera)'],
            ['s', 'Segna da leggere'],
            ['j / k', 'Muoviti fra i messaggi della conversazione'],
            ['Invio', 'Apri o chiudi il messaggio a fuoco'],
            ['?', 'Questo elenco'],
          ].map(([tasto, cosa]) => (
            <div key={tasto}>
              <dt>
                <kbd>{tasto}</kbd>
              </dt>
              <dd>{cosa}</dd>
            </div>
          ))}
        </dl>
        <div className="form-footer" style={{ marginTop: 14 }}>
          <button className="btn secondary" type="button" onClick={() => setAiuto(false)}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}
