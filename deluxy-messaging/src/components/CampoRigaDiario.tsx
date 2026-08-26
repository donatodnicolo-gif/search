'use client'

import { useEffect, useRef, useState } from 'react'
import {
  GIORNI_CORTI,
  barraEComando,
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
// ⚠️⚠️ Ma qui la barra si usa **in mezzo alla riga**, non a campo vuoto: la data
// sta in fondo, dopo il numero d'ordine e dopo la cosa da fare. Perciò la regola
// è più stretta di quella dell'inbox e sta in `barraEComando()`: si apre solo se
// la barra è a **inizio di parola** (campo vuoto o dopo uno spazio) ed è appena
// stata scritta **in fondo**. Così «27/08» resta una data in cifre e non apre
// niente, che è esattamente il caso che rovinerebbe la funzione.

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

  const apri = () => {
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
    const testo = value.endsWith('/') ? value.slice(0, -1) : value
    onChange(`${testo}${scriviData(giorno)} `)
    setAperto(false)
    input.current?.focus()
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
          if (barraEComando(value, v)) apri()
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
