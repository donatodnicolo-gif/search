'use client'

import { useEffect, useState, useTransition } from 'react'
import { salvaNotaAttivita } from '@/lib/actions'
import { mostraFlash } from './Flash'

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
export function NotaAttivita({ id, nota }: { id: string; nota: string | null }) {
  const [testo, setTesto] = useState(nota ?? '')
  const [apre, setApre] = useState(false)
  const [inCorso, start] = useTransition()

  useEffect(() => setTesto(nota ?? ''), [nota])

  function salva() {
    start(async () => {
      const r = await salvaNotaAttivita(id, testo)
      mostraFlash(r.messaggio)
      // ⚠️ Si riparte da quello che ha scritto il SERVER (tagliato a 2000, senza
      // spazi ai bordi): se no a schermo resterebbe una versione che nel
      // database non esiste.
      if (r.ok) setTesto(r.nota)
      setApre(false)
    })
  }

  if (!apre) {
    return testo ? (
      <div className="task-sub nota-riga">
        <strong>Nota:</strong> {testo}{' '}
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
