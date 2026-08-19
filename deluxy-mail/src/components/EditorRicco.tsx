'use client'

import { useEffect, useRef, useState } from 'react'
import { mistoAHtml } from '@/lib/htmlMail'
import { sanitizzaHtml } from '@/lib/sanitizzaHtml'

/**
 * Editor di testo formattato per il corpo delle mail: grassetto, corsivo,
 * sottolineato, elenchi, link, immagini. Produce HTML. Niente librerie esterne:
 * usa un contenteditable con i comandi del browser (document.execCommand), che
 * tutti i browser supportano ancora e non richiede dipendenze.
 */

/** Larghezze proposte per un'immagine, in pixel. */
const MISURE = [
  { nome: 'Piccola', px: 240 },
  { nome: 'Media', px: 400 },
  { nome: 'Grande', px: 640 },
]

/** Byte veri dietro un `src="data:…;base64,…"` (0 se non è un data URL). */
function pesoDataUrl(src: string): number {
  const i = src.indexOf(';base64,')
  if (!src.startsWith('data:') || i < 0) return 0
  return Math.round((src.length - i - 8) * 0.75)
}

function leggibile(byte: number): string {
  return byte >= 1024 * 1024 ? `${(byte / 1024 / 1024).toFixed(1)} MB` : `${Math.round(byte / 1024)} KB`
}

export function EditorRicco({
  valoreIniziale,
  onChange,
  minAltezza = 300,
  idAllegati,
}: {
  valoreIniziale: string
  onChange: (html: string) => void
  minAltezza?: number
  /** Id del campo file degli allegati: se c'è, nella barra compare la
   *  graffetta accanto al link. */
  idAllegati?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // L'immagine su cui si sta lavorando. ⚠️ Chrome, a differenza di Firefox, NON
  // disegna maniglie di ridimensionamento dentro un contenteditable: senza
  // questi comandi un'immagine incollata resta grande com'è e non c'è modo di
  // rimpicciolirla (segnalato il 19/08/2026).
  const [scelta, setScelta] = useState<HTMLImageElement | null>(null)
  const [peso, setPeso] = useState(0)
  const [nota, setNota] = useState('')

  // Il contenuto si imposta UNA volta: dopo comanda il DOM (reimpostarlo a ogni
  // render sposterebbe il cursore). ⚠️ `mistoAHtml` e non «o testo o HTML»:
  // quello che scrive Renè è testo semplice CON IN FONDO la firma in HTML, e
  // trattarlo tutto come HTML buttava via gli a-capo del testo (mail «tutte
  // attaccate», 9/08/2026).
  useEffect(() => {
    if (!ref.current) return
    // ⚠️ SANIFICARE anche qui, non solo alla fonte. Questo è un innerHTML del
    // documento PRINCIPALE (non l'iframe in sandbox della vista): un gestore
    // `onerror` che sfuggisse eseguirebbe con la sessione dell'utente. La
    // citazione dell'originale nasce sanificata (rispondi.ts), ma una bozza
    // salvata PRIMA della correzione del filtro potrebbe averlo dentro: si
    // ripulisce di nuovo al montaggio. (Revisione 14/08/2026.)
    ref.current.innerHTML = valoreIniziale ? sanitizzaHtml(mistoAHtml(valoreIniziale)) : ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emetti() {
    const el = ref.current
    if (!el) return
    // ⚠️ Il segno della selezione è roba dell'editor, non della mail: si toglie
    // prima di leggere l'HTML e si rimette subito dopo, o `data-scelta`
    // partirebbe dentro il messaggio.
    const segnata = el.querySelector('img[data-scelta]')
    segnata?.removeAttribute('data-scelta')
    onChange(el.innerHTML)
    segnata?.setAttribute('data-scelta', '')
  }

  function comando(cmd: string, valore?: string) {
    ref.current?.focus()
    document.execCommand(cmd, false, valore)
    emetti()
  }

  function inserisciLink() {
    const url = window.prompt('Indirizzo del link (https://…):')
    if (!url) return
    const pulito = /^https?:\/\//i.test(url) ? url : `https://${url}`
    comando('createLink', pulito)
  }

  /** Un clic su un'immagine la prende in carico; un clic altrove la lascia. */
  function suClick(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    el.querySelectorAll('img[data-scelta]').forEach((i) => i.removeAttribute('data-scelta'))
    setNota('')
    const bersaglio = e.target as HTMLElement
    if (bersaglio?.tagName === 'IMG') {
      const img = bersaglio as HTMLImageElement
      img.setAttribute('data-scelta', '')
      setScelta(img)
      setPeso(pesoDataUrl(img.getAttribute('src') || ''))
    } else {
      setScelta(null)
      setPeso(0)
    }
  }

  /** `px = null` significa «larga quanto il messaggio». */
  function larghezza(px: number | null) {
    const img = scelta
    if (!img) return
    // ⚠️ Si scrive SIA l'attributo `width` SIA lo stile inline: i programmi di
    // posta sono divisi, alcuni vecchi guardano solo l'attributo, e un foglio
    // di stile esterno non arriva mai a destinazione. `height:auto` tiene le
    // proporzioni, `max-width:100%` evita che sfondi le finestre strette.
    img.removeAttribute('height')
    img.style.height = 'auto'
    img.style.maxWidth = '100%'
    if (px === null) {
      img.removeAttribute('width')
      img.style.width = '100%'
    } else {
      img.setAttribute('width', String(px))
      img.style.width = `${px}px`
    }
    emetti()
  }

  /**
   * Rimpicciolisce l'IMMAGINE VERA, non solo come si vede.
   * ⚠️ Ridurre la larghezza a schermo non toglie un byte alla mail: una foto da
   * 4 MB incollata resta 4 MB anche mostrata a 240px, e in questa app ci sono
   * mail con 20 MB di immagini dentro. Qui si ridisegna davvero.
   * ⚠️ Solo per le immagini `data:`: disegnare su canvas un'immagine presa da
   * un altro sito lo «sporca» e `toDataURL` smette di funzionare.
   * ⚠️ Si riesce in JPEG: pesa una frazione, ma le trasparenze si perdono.
   */
  function riduciDavvero() {
    const img = scelta
    if (!img) return
    const src = img.getAttribute('src') || ''
    const prima = pesoDataUrl(src)
    if (!prima || !img.naturalWidth) {
      setNota('Questa immagine non è incorporata: si può solo ridimensionare.')
      return
    }
    const mostrata = img.getBoundingClientRect().width || 400
    // Il doppio di come si vede (schermi a densità alta), mai più dell'originale.
    const larghezzaFinale = Math.min(img.naturalWidth, Math.max(320, Math.round(mostrata * 2)))
    const tela = document.createElement('canvas')
    tela.width = larghezzaFinale
    tela.height = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * larghezzaFinale))
    const ctx = tela.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, tela.width, tela.height)
    const nuovo = tela.toDataURL('image/jpeg', 0.82)
    const dopo = pesoDataUrl(nuovo)
    if (dopo >= prima) {
      setNota(`Già leggera: ${leggibile(prima)}, non conviene rifarla.`)
      return
    }
    img.setAttribute('src', nuovo)
    setPeso(dopo)
    setNota(`Da ${leggibile(prima)} a ${leggibile(dopo)}.`)
    emetti()
  }

  const B = ({ cmd, label, titolo, valore }: { cmd: string; label: React.ReactNode; titolo: string; valore?: string }) => (
    <button
      type="button"
      className="rt-btn"
      title={titolo}
      onMouseDown={(e) => e.preventDefault()} // non perdere la selezione
      onClick={() => comando(cmd, valore)}
    >
      {label}
    </button>
  )

  return (
    <div className="rt-editor">
      <div className="rt-toolbar">
        <B cmd="bold" label={<strong>G</strong>} titolo="Grassetto" />
        <B cmd="italic" label={<em>C</em>} titolo="Corsivo" />
        <B cmd="underline" label={<u>S</u>} titolo="Sottolineato" />
        <span className="rt-sep" />
        <B cmd="insertUnorderedList" label="• —" titolo="Elenco puntato" />
        <B cmd="insertOrderedList" label="1." titolo="Elenco numerato" />
        <span className="rt-sep" />
        <button type="button" className="rt-btn" title="Inserisci link" onMouseDown={(e) => e.preventDefault()} onClick={inserisciLink}>
          🔗
        </button>
        {/* Graffetta accanto al link: è una <label> legata al campo file degli
            allegati (più sotto nella pagina), così apre il selettore da sé. */}
        {idAllegati && (
          <label className="rt-btn" htmlFor={idAllegati} title="Aggiungi allegato" style={{ cursor: 'pointer' }}>
            📎
          </label>
        )}
        <B cmd="removeFormat" label="⌫" titolo="Togli la formattazione" />
        {!scelta && <span className="rt-nota">Tocca un'immagine per ridimensionarla</span>}
      </div>

      {/* I comandi dell'immagine compaiono solo quando ce n'è una scelta: una
          riga di bottoni sempre accesi ma quasi sempre inutili è rumore. */}
      {scelta && (
        <div className="rt-toolbar rt-imgbar">
          <span className="rt-imglabel">Immagine</span>
          {MISURE.map((m) => (
            <button
              key={m.px}
              type="button"
              className="rt-btn"
              title={`Larga ${m.px} pixel`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => larghezza(m.px)}
            >
              {m.nome}
            </button>
          ))}
          <button
            type="button"
            className="rt-btn"
            title="Larga quanto il messaggio"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => larghezza(null)}
          >
            Piena
          </button>
          {peso > 0 && (
            <>
              <span className="rt-sep" />
              <button
                type="button"
                className="rt-btn"
                title="Ridisegna l'immagine alla misura scelta: alleggerisce la mail davvero (le trasparenze si perdono)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={riduciDavvero}
              >
                Alleggerisci il file ({leggibile(peso)})
              </button>
            </>
          )}
          {nota && <span className="rt-nota">{nota}</span>}
        </div>
      )}

      <div
        ref={ref}
        className="rt-area"
        contentEditable
        role="textbox"
        aria-multiline="true"
        style={{ minHeight: minAltezza }}
        onInput={emetti}
        onBlur={emetti}
        onClick={suClick}
        suppressContentEditableWarning
      />
    </div>
  )
}
