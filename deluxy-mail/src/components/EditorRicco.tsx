'use client'

import { useEffect, useRef } from 'react'
import { sembraHtml, plainAHtml } from '@/lib/htmlMail'

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
  // render sposterebbe il cursore). Un testo semplice diventa HTML leggibile.
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = valoreIniziale
      ? sembraHtml(valoreIniziale)
        ? valoreIniziale
        : plainAHtml(valoreIniziale)
      : ''
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
