'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { creaEvento } from '@/lib/actions'

/** Il modulo per annotare un appuntamento nel calendario. */
export function NuovoEvento() {
  const [aperto, setAperto] = useState(false)
  const [giornataIntera, setGiornataIntera] = useState(false)
  const [stato, setStato] = useState<{ ok: boolean; testo: string } | null>(null)
  const [inCorso, start] = useTransition()
  const form = useRef<HTMLFormElement>(null)
  const router = useRouter()

  const salva = (dati: FormData) =>
    start(async () => {
      setStato(null)
      const esito = await creaEvento(dati)
      setStato({ ok: esito.ok, testo: esito.messaggio })
      if (esito.ok) {
        form.current?.reset()
        setAperto(false)
        router.refresh()
      }
    })

  if (!aperto) {
    return (
      <div style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn primary" type="button" onClick={() => setAperto(true)}>
          + Nuovo appuntamento
        </button>
        {stato && (
          <span style={{ fontSize: 12.5, color: stato.ok ? 'var(--text-secondary)' : 'var(--red)' }}>
            {stato.testo}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <form ref={form} action={salva}>
        <div className="form-grid">
          <div className="full">
            <label className="field-label">Titolo <span className="req">*</span></label>
            <input type="text" name="titolo" required placeholder="Es. Sopralluogo Hotel Principe" autoFocus />
          </div>
          <div>
            <label className="field-label">Giorno <span className="req">*</span></label>
            <input type="date" name="giorno" required />
          </div>
          <div>
            <label className="field-label">Luogo</label>
            <input type="text" name="luogo" placeholder="Via, città (opzionale)" />
          </div>

          <div className="full">
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="giornataIntera"
                checked={giornataIntera}
                onChange={(e) => setGiornataIntera(e.target.checked)}
              />
              Tutto il giorno
            </label>
          </div>

          {!giornataIntera && (
            <>
              <div>
                <label className="field-label">Dalle</label>
                <input type="time" name="oraInizio" defaultValue="09:00" />
              </div>
              <div>
                <label className="field-label">Alle</label>
                <input type="time" name="oraFine" />
              </div>
            </>
          )}

          <div className="full">
            <label className="field-label">Note</label>
            <input type="text" name="descrizione" placeholder="Dettagli utili (opzionale)" />
          </div>

          <div className="full">
            <label className="field-label">Invita (email, separate da virgola)</label>
            <input type="text" name="invitati" placeholder="Es. mario@rossi.it, anna@bianchi.it (opzionale)" />
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
              A ogni invitato parte subito la mail d’invito con Accetta/Rifiuta (e
              l’invito-calendario che Gmail e Outlook riconoscono).
            </div>
          </div>
        </div>

        {stato && !stato.ok && (
          <div style={{ fontSize: 13, marginTop: 12, color: 'var(--red)' }}>{stato.testo}</div>
        )}

        <div className="form-footer">
          <button className="btn secondary" type="button" onClick={() => setAperto(false)} disabled={inCorso}>
            Annulla
          </button>
          <button className="btn primary" type="submit" disabled={inCorso}>
            {inCorso ? 'Salvo…' : 'Salva appuntamento'}
          </button>
        </div>
      </form>
    </div>
  )
}
