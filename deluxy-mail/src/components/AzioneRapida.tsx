'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { creaEvento, creaAttivitaManuale } from '@/lib/actions'
import { ComandoRene } from './ComandoRene'
import { mostraFlash } from './Flash'

export type TipoAzione = 'evento' | 'attivita' | 'rene'
const APRI = 'aimail:azione-rapida'

/** Apre il popup dell'azione rapida (usato dai «+» della sidebar). */
export function apriAzioneRapida(tipo: TipoAzione) {
  window.dispatchEvent(new CustomEvent(APRI, { detail: { tipo } }))
}

const TITOLI: Record<TipoAzione, string> = {
  evento: 'Nuovo appuntamento',
  attivita: 'Nuova attività',
  rene: 'Chiedi a Renè',
}

/**
 * Il popup dell'azione rapida: da qui crei un appuntamento, un'attività o dai
 * un comando a Renè SENZA lasciare la posta in arrivo. Montato una volta nel
 * guscio (Shell), si apre con l'evento `aimail:azione-rapida`.
 */
export function AzioneRapida() {
  const [tipo, setTipo] = useState<TipoAzione | null>(null)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const su = (e: Event) => {
      setTipo((e as CustomEvent).detail.tipo as TipoAzione)
      setStato(null)
    }
    window.addEventListener(APRI, su)
    return () => window.removeEventListener(APRI, su)
  }, [])

  if (!tipo) return null
  const chiudi = () => setTipo(null)

  const salvaEvento = (form: FormData) =>
    start(async () => {
      const esito = await creaEvento(form)
      setStato(esito.messaggio)
      if (esito.ok) {
        mostraFlash(esito.messaggio)
        chiudi()
        router.refresh()
      }
    })

  const salvaAttivita = (form: FormData) =>
    start(async () => {
      const esito = await creaAttivitaManuale(form)
      setStato(esito.messaggio)
      if (esito.ok) {
        mostraFlash(esito.messaggio)
        chiudi()
        router.refresh()
      }
    })

  return (
    <div className="modal-scrim" onClick={chiudi}>
      <div className="modal" role="dialog" aria-label={TITOLI[tipo]} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{TITOLI[tipo]}</div>

        {tipo === 'evento' && (
          <form action={salvaEvento}>
            <div className="form-grid">
              <div className="full">
                <label className="field-label">Titolo <span className="req">*</span></label>
                <input type="text" name="titolo" required autoFocus placeholder="Es. Sopralluogo Hotel Principe" />
              </div>
              <div>
                <label className="field-label">Giorno <span className="req">*</span></label>
                <input type="date" name="giorno" required />
              </div>
              <div>
                <label className="field-label">Dalle</label>
                <input type="time" name="oraInizio" defaultValue="09:00" />
              </div>
              <div className="full">
                <label className="field-label">Luogo</label>
                <input type="text" name="luogo" placeholder="Via, città (opzionale)" />
              </div>
            </div>
            {stato && <div style={{ fontSize: 13, marginTop: 10, color: 'var(--text-secondary)' }}>{stato}</div>}
            <div className="form-footer">
              <button className="btn secondary" type="button" onClick={chiudi} disabled={inCorso}>Annulla</button>
              <button className="btn primary" type="submit" disabled={inCorso}>{inCorso ? 'Salvo…' : 'Salva'}</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Per invitati e ripetizioni apri il <a href="/calendario" style={{ textDecoration: 'underline' }}>Calendario</a>.
            </p>
          </form>
        )}

        {tipo === 'attivita' && (
          <form action={salvaAttivita}>
            <div className="form-grid">
              <div className="full">
                <label className="field-label">Cosa c’è da fare <span className="req">*</span></label>
                <input type="text" name="titolo" required autoFocus placeholder="Es. Richiamare il fornitore" />
              </div>
              <div>
                <label className="field-label">Priorità</label>
                <select name="priorita" defaultValue="P2">
                  <option value="P0">P0 · urgente</option>
                  <option value="P1">P1 · alta</option>
                  <option value="P2">P2 · normale</option>
                  <option value="P3">P3 · bassa</option>
                </select>
              </div>
              <div>
                <label className="field-label">Entro il</label>
                <input type="date" name="scadenza" />
              </div>
              <div className="full">
                <label className="field-label">Note</label>
                <input type="text" name="dettaglio" placeholder="Dettagli (opzionale)" />
              </div>
            </div>
            {stato && <div style={{ fontSize: 13, marginTop: 10, color: 'var(--text-secondary)' }}>{stato}</div>}
            <div className="form-footer">
              <button className="btn secondary" type="button" onClick={chiudi} disabled={inCorso}>Annulla</button>
              <button className="btn primary" type="submit" disabled={inCorso}>{inCorso ? 'Salvo…' : 'Salva'}</button>
            </div>
          </form>
        )}

        {tipo === 'rene' && (
          <>
            {/* Il box completo di Renè: comandi di massa, appuntamenti, invio. */}
            <ComandoRene />
            <div className="form-footer">
              <button className="btn secondary" type="button" onClick={chiudi}>Chiudi</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
