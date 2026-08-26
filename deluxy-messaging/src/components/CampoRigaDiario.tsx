'use client'

import { useEffect, useRef, useState } from 'react'
import {
  GIORNI_CORTI,
  posizioneBarraComando,
  caselleDelMese,
  inizioGiorno,
  nomeMese,
  piuGiorni,
  scriviData,
  stessoGiorno,
} from '@/lib/data-italiana'

// ── «/» APRE IL CALENDARIO, DENTRO LA RIGA ──
//
// ⚠️⚠️ Chiesto dall'utente il 26/08/2026, con la barra già scritta nel campo del
// diario: «con lo "/" apre nella riga un calendario».
//
// Le righe vere del quaderno hanno quasi tutte una data dentro — «12562 da fare
// 16 luglio», «per 27 agosto, loro per la torta» — e finora quella data si
// scriveva a mano, ogni volta, guardando un calendario da un'altra parte.
//
// ⚠️ La barra è già una convenzione di quest'app: nell'inbox, a riquadro vuoto,
// apre le risposte pronte (`Inbox.tsx`). Stesso gesto, stessa promessa: la barra
// non è testo, è un comando — e quando il comando va a buon fine **sparisce**,
// sostituita da quello che ha prodotto.
//
// ⚠️⚠️ Ma qui la barra si usa **dentro** la riga, non a campo vuoto: la regola è
// più stretta di quella dell'inbox e sta in `posizioneBarraComando()` — vale a
// **inizio di parola** (campo vuoto o dopo uno spazio) e **in qualunque punto**
// della riga. Così «27/08» resta una data in cifre e non apre niente, che è
// esattamente il caso che rovinerebbe la funzione.
//
// ⚠️ «In qualunque punto» è arrivato dopo, segnalato dall'utente: la prima
// versione guardava solo la fine della riga, e **correggendo** una nota — che è
// proprio il momento in cui una data si sostituisce, «chiamare ~~domani~~ / alle
// 9!» — non si apriva mai.
//
// ⚠️ E tolta la barra, il calendario **si chiude**: sta lì per quella barra, e
// un pannello che resta aperto dopo che il suo motivo è sparito copre la pagina
// e basta.

type Props = {
  value: string
  onChange: (v: string) => void
  /** Invio a calendario chiuso. */
  onInvio?: () => void
  /** Esc a calendario chiuso (il primo Esc chiude il calendario). */
  onEsc?: () => void
  placeholder?: string
  ariaLabel?: string
  autoFocus?: boolean
  /** Per portare il fuoco da fuori (i bottoni degli ordini aperti). */
  campoRef?: React.RefObject<HTMLInputElement | null>
  style?: React.CSSProperties
}

export function CampoRigaDiario({
  value,
  onChange,
  onInvio,
  onEsc,
  placeholder,
  ariaLabel,
  autoFocus,
  campoRef,
  style,
}: Props) {
  const mio = useRef<HTMLInputElement | null>(null)
  const input = campoRef ?? mio
  const guscio = useRef<HTMLDivElement | null>(null)
  const [aperto, setAperto] = useState(false)
  // Il giorno su cui sta il cursore del calendario. ⚠️ Si decide APRENDO, non
  // qui: `new Date()` durante il primo disegno lo calcolerebbe anche sul
  // server, che sta a Francoforte in UTC — e alle 23 di Roma sarebbe un altro
  // giorno, con React che si lamenta della differenza.
  const [scelto, setScelto] = useState<Date | null>(null)
  // ⚠️ DOVE sta la barra da sostituire. La data non va per forza in fondo:
  // correggendo una riga la si mette in mezzo, al posto di «domani».
  const [posizione, setPosizione] = useState(0)

  const apri = (dove: number) => {
    setPosizione(dove)
    setScelto(inizioGiorno(new Date()))
    setAperto(true)
  }
  const chiudi = () => setAperto(false)

  // ⚠️ Un clic fuori chiude: un pannello che resta aperto mentre si lavora
  // altrove copre la pagina e si finisce per ricaricarla.
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => {
      if (!guscio.current?.contains(e.target as Node)) chiudi()
    }
    document.addEventListener('mousedown', fuori)
    return () => document.removeEventListener('mousedown', fuori)
  }, [aperto])

  /**
   * Mette la data al posto della barra.
   *
   * ⚠️ La barra sparisce: era il comando. Se restasse, la riga direbbe
   * «da fare / 27 agosto» — e quella barra finirebbe nel quaderno di tutti.
   */
  function metti(giorno: Date) {
    // ⚠️ Si sostituisce LA BARRA, dov'è: `value.endsWith('/')` valeva solo per
    // la riga scritta da capo, e correggendo in mezzo avrebbe tagliato l'ultimo
    // carattere della frase lasciando la barra dov'era.
    const dove = value[posizione] === '/' ? posizione : value.lastIndexOf('/')
    if (dove < 0) {
      setAperto(false)
      return
    }
    const data = scriviData(giorno)
    const prima = value.slice(0, dove)
    const dopo = value.slice(dove + 1)
    // ⚠️ Lo spazio dopo la data solo se serve: in fondo alla riga aiuta a
    // continuare a scrivere, ma davanti a « alle 9!» farebbe due spazi.
    const stacco = dopo === '' || !dopo.startsWith(' ') ? ' ' : ''
    const nuovo = prima + data + stacco + dopo
    onChange(nuovo)
    setAperto(false)
    // ⚠️ Il cursore torna DOPO la data, non in fondo alla riga: correggendo in
    // mezzo, ritrovarselo alla fine vuol dire ricercare a mano il punto in cui
    // si stava scrivendo.
    const fine = prima.length + data.length + stacco.length
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(fine, fine)
    })
  }

  const oggi = inizioGiorno(new Date())
  const cursore = scelto ?? oggi

  return (
    <div ref={guscio} style={{ position: 'relative', flex: 1, ...style }}>
      <input
        ref={input}
        value={value}
        onChange={(e) => {
          const v = e.target.value
          onChange(v)
          // La barra resta scritta finché non si sceglie: se si chiude senza
          // scegliere, chi voleva davvero una barra ce l'ha.
          const dove = posizioneBarraComando(value, v)
          if (dove >= 0) {
            apri(dove)
            return
          }
          // ── TOLTA LA BARRA, IL CALENDARIO SI CHIUDE ──
          //
          // ⚠️⚠️ Segnalato dall'utente il 26/08/2026: cancellata la barra, il
          // pannello restava aperto sopra la pagina. Sta lì **per quella
          // barra**: sparita lei, non ha più un posto dove mettere la data —
          // e scegliere un giorno non farebbe più niente di visibile.
          //
          // ⚠️ Il tasto qui non basta: scrivendo, il pannello si chiude già da
          // `onKeyDown`, ma **Backspace e Canc non sono caratteri** e passavano
          // oltre. Si guarda il testo, non il tasto: così valgono anche il
          // taglia, il seleziona-tutto-e-cancella e l'annulla del browser.
          //
          // ⚠️ Si chiude anche se la barra è ancora nella riga ma **non è più
          // dove era**: dopo una cancellazione in mezzo, la posizione salvata
          // punterebbe a un altro carattere, e la data finirebbe in un punto che
          // nessuno ha scelto.
          if (aperto && v[posizione] !== '/') chiudi()
        }}
        onKeyDown={(e) => {
          if (aperto) {
            // ⚠️ Col calendario aperto le frecce muovono il GIORNO, non il
            // cursore nel testo: la mano è sulla tastiera, ed è lì che deve
            // poter finire il lavoro. `preventDefault` o la freccia farebbe
            // anche scorrere la pagina.
            if (e.key === 'Escape') {
              e.preventDefault()
              chiudi()
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              metti(cursore)
              return
            }
            const passo: Record<string, number> = {
              ArrowLeft: -1,
              ArrowRight: 1,
              ArrowUp: -7,
              ArrowDown: 7,
            }
            if (e.key in passo) {
              e.preventDefault()
              setScelto(piuGiorni(cursore, passo[e.key]))
              return
            }
            // Qualunque altro tasto: si sta scrivendo, non scegliendo.
            if (e.key.length === 1) chiudi()
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            onInvio?.()
          }
          if (e.key === 'Escape') onEsc?.()
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        style={{ width: '100%' }}
      />

      {aperto ? (
        <div className="calendario-riga" role="dialog" aria-label="Scegli una data">
          {/* ⚠️⚠️ «Oggi» e «domani» si SCRIVONO come data, non come parola. Una
              riga che dice «chiamare domani» la si legge fra tre giorni e vuol
              dire un altro giorno: la parola invecchia, la data no. */}
          <div className="calendario-svelte">
            <button type="button" className="bottone secondario mini" onClick={() => metti(oggi)}>
              Oggi
            </button>
            <button
              type="button"
              className="bottone secondario mini"
              onClick={() => metti(piuGiorni(oggi, 1))}
            >
              Domani
            </button>
            <button
              type="button"
              className="bottone secondario mini"
              onClick={() => metti(piuGiorni(oggi, 2))}
            >
              Dopodomani
            </button>
          </div>

          <div className="calendario-testa">
            <button
              type="button"
              className="calendario-freccia"
              aria-label="Mese prima"
              onClick={() => setScelto(new Date(cursore.getFullYear(), cursore.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <span>
              {nomeMese(cursore.getMonth())} {cursore.getFullYear()}
            </span>
            <button
              type="button"
              className="calendario-freccia"
              aria-label="Mese dopo"
              onClick={() => setScelto(new Date(cursore.getFullYear(), cursore.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>

          <div className="calendario-griglia">
            {GIORNI_CORTI.map((g) => (
              <span key={g} className="calendario-intestazione">
                {g}
              </span>
            ))}
            {caselleDelMese(cursore.getFullYear(), cursore.getMonth()).map((d, i) =>
              d ? (
                <button
                  key={d.toISOString()}
                  type="button"
                  className={[
                    'calendario-giorno',
                    stessoGiorno(d, oggi) ? 'oggi' : '',
                    stessoGiorno(d, cursore) ? 'scelto' : '',
                    // ⚠️ Il passato non si nasconde: una riga di diario può
                    // parlare di ieri («richiamato il 25»). Si smorza soltanto,
                    // perché nove volte su dieci la data è avanti.
                    d < oggi ? 'passato' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => metti(d)}
                >
                  {d.getDate()}
                </button>
              ) : (
                <span key={`vuota-${i}`} />
              )
            )}
          </div>

          <div className="calendario-piede">
            ↑↓←→ per spostarti · Invio per scegliere · Esc per chiudere
          </div>
        </div>
      ) : null}
    </div>
  )
}
