'use client'

import { useEffect, useRef } from 'react'
import { mistoAHtml } from '@/lib/htmlMail'
import { sanitizzaHtml } from '@/lib/sanitizzaHtml'

/**
 * Editor di testo formattato per il corpo delle mail: grassetto, corsivo,
 * sottolineato, elenchi, link. Produce HTML. Niente librerie esterne: usa un
 * contenteditable con i comandi del browser (document.execCommand), che tutti
 * i browser supportano ancora e non richiede dipendenze.
 */
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
    if (ref.current) onChange(ref.current.innerHTML)
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
      </div>
      <div
        ref={ref}
        className="rt-area"
        contentEditable
        role="textbox"
        aria-multiline="true"
        style={{ minHeight: minAltezza }}
        onInput={emetti}
        onBlur={emetti}
        suppressContentEditableWarning
      />
    </div>
  )
}
