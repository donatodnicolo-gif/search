'use client'

import { useEffect, useState, useTransition } from 'react'
import { salvaNotaAttivita } from '@/lib/actions'
import { mostraFlash } from './Flash'

/** «21 ago», o «21 ago 2025» se non è di quest'anno: in un elenco la data
 *  serve a collocare la nota, non a essere precisa al secondo. */
function quandoBreve(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const opzioni: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' }
  if (d.getFullYear() !== new Date().getFullYear()) opzioni.year = 'numeric'
  return d.toLocaleDateString('it-IT', opzioni)
}

/**
 * La NOTA di un'attività, scrivibile dall'elenco.
 *
 * Fino al 21/08/2026 il campo si poteva riempire solo alla creazione: una volta
 * nata, l'attività non si poteva più annotare — e annotare è proprio quello che
 * si fa mentre una cosa da fare avanza («chiamato, richiama lunedì»).
 *
 * ⚠️ Campo PROPRIO (`note`), separato da `dettaglio`. Il primo tentativo riusava
 * `dettaglio` per non aggiungere colonne — ma quello e la descrizione di cosa
 * fare, quasi sempre scritta dall AI, e «modifica» invitava a cancellarla per
 * annotare (segnalato dall utente: «non modifica ma aggiungi nota»). Sono due
 * cose diverse e restano due campi. Al registro condiviso vanno insieme:
 * `descrizione` = dettaglio + «Note: …» (vedi registroTask.ts).
 *
 * ⚠️ Lo stato locale si riallinea alla prop (`useEffect`): se la nota cambia
 * altrove — un'altra scheda aperta, o l'attività modificata dentro Deluxy Tasks
 * — quello che si legge qui non deve restare la versione vecchia. È la regola
 * pagata col pallino blu e col tasto «Letto».
 */
export function NotaAttivita({
  id,
  nota,
  autore,
  quando,
}: {
  id: string
  nota: string | null
  autore?: string | null
  /** ISO: la pagina è un Server Component, le date si passano serializzabili. */
  quando?: string | null
}) {
  const [testo, setTesto] = useState(nota ?? '')
  const [firma, setFirma] = useState<{ autore: string | null; quando: string | null }>({
    autore: autore ?? null,
    quando: quando ?? null,
  })
  const [apre, setApre] = useState(false)
  const [inCorso, start] = useTransition()

  useEffect(() => setTesto(nota ?? ''), [nota])
  useEffect(() => setFirma({ autore: autore ?? null, quando: quando ?? null }), [autore, quando])

  function salva() {
    start(async () => {
      const r = await salvaNotaAttivita(id, testo)
      mostraFlash(r.messaggio)
      // ⚠️ Si riparte da quello che ha scritto il SERVER (tagliato a 2000, senza
      // spazi ai bordi): se no a schermo resterebbe una versione che nel
      // database non esiste.
      if (r.ok) {
        setTesto(r.nota)
        // La firma la decide il server: chi salva e l'istante in cui l'ha fatto.
        setFirma({ autore: r.autore ?? null, quando: r.quando ?? null })
      }
      setApre(false)
    })
  }

  if (!apre) {
    return testo ? (
      <div className="task-sub nota-riga">
        <strong>Nota{firma.autore || firma.quando ? ` (${[firma.autore, quandoBreve(firma.quando)].filter(Boolean).join(', ')})` : ''}:</strong>{' '}
        {testo}{' '}
        <button type="button" className="link-sottile" onClick={() => setApre(true)}>
          modifica la nota
        </button>
      </div>
    ) : (
      <button type="button" className="link-sottile" onClick={() => setApre(true)}>
        + Aggiungi una nota
      </button>
    )
  }

  return (
    <div className="nota-modifica">
      <textarea
        className="input"
        rows={3}
        autoFocus
        value={testo}
        maxLength={2000}
        placeholder="Una nota su questa attività: a che punto è, cosa aspetti, chi hai sentito…"
        onChange={(e) => setTesto(e.target.value)}
        // ⚠️ Ctrl+Invio salva, Esc annulla. `Invio` da solo NO: in una nota di
        // tre righe l'a-capo serve, ed è la stessa regola dell'editor delle mail.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            salva()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setTesto(nota ?? '')
            setApre(false)
          }
        }}
      />
      <div className="nota-azioni">
        <button type="button" className="btn btn-primario" onClick={salva} disabled={inCorso}>
          {inCorso ? 'Salvo…' : 'Salva'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setTesto(nota ?? '')
            setApre(false)
          }}
        >
          Annulla
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          Ctrl+Invio salva · Esc annulla
        </span>
      </div>
    </div>
  )
}
