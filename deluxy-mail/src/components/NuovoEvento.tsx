'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { creaEvento } from '@/lib/actions'
import { fineConDurata } from '@/lib/orari'
import { CampoDestinatari, type ContattoRubrica } from './CampoDestinatari'
import { Ricorrenza } from './Ricorrenza'

/** Doppio clic su un giorno del calendario → apre questo form su quella data. */
export const NUOVO_EVENTO_GIORNO = 'aimail:nuovo-evento'

/** Il modulo per annotare un appuntamento nel calendario. */
export function NuovoEvento({ contatti = [] }: { contatti?: ContattoRubrica[] }) {
  const [aperto, setAperto] = useState(false)
  // Giorno precompilato quando si apre con doppio clic su una cella.
  const [giornoIniziale, setGiornoIniziale] = useState('')
  const [giornataIntera, setGiornataIntera] = useState(false)

  // Apertura da doppio clic su una cella del calendario, con la data pronta.
  useEffect(() => {
    const su = (e: Event) => {
      const giorno = (e as CustomEvent).detail?.giorno as string | undefined
      if (!giorno) return
      setGiornoIniziale(giorno)
      setAperto(true)
      // Porta il form in vista: la cella cliccata può essere sotto il fold.
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener(NUOVO_EVENTO_GIORNO, su)
    return () => window.removeEventListener(NUOVO_EVENTO_GIORNO, su)
  }, [])
  // Un appuntamento dura un'ora, se non dici altro. Spostando l'inizio, la
  // fine lo segue mantenendo la durata che avevi impostato.
  const [oraInizio, setOraInizio] = useState('09:00')
  const [oraFine, setOraFine] = useState('10:00')

  // La regola sta in `lib/orari.ts`: la stessa la usa anche la MODIFICA
  // dell'appuntamento, che prima non ce l'aveva (vedi il commento là).
  const cambiaInizio = (nuovo: string) => {
    setOraInizio(nuovo)
    const nuovaFine = fineConDurata(oraInizio, oraFine, nuovo)
    if (nuovaFine) setOraFine(nuovaFine)
  }
  // Gli invitati: campo controllato con l'autocompletamento dalla rubrica.
  const [invitati, setInvitati] = useState('')
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
        setInvitati('')
        // I campi controllati non li tocca reset(): si riportano a mano.
        setOraInizio('09:00')
        setOraFine('10:00')
        setGiornoIniziale('')
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
            {/* `key` sul giorno: quando arriva da un doppio clic, l'input si
                rimonta con la data giusta (defaultValue da solo non basta). */}
            <input key={giornoIniziale} type="date" name="giorno" required defaultValue={giornoIniziale} />
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
                {/* ⏱️ SLOT DI 15 MINUTI: `step={900}` + `min` come ancora (lo
                    step si conta da lì). La tendina dell'orologio propone i
                    quarti d'ora; **digitare 16:07 resta possibile**, e va bene
                    così — un appuntamento alle 16:07 non è un errore da
                    impedire. Verdetto del custode UX dell'11/09/2026: si usa
                    sempre il controllo nativo, mai una tendina di 96 voci (su
                    telefono sarebbe una lista da scorrere al posto della rotella,
                    e toglierebbe la digitazione rapida). */}
                <input
                  type="time"
                  name="oraInizio"
                  step={900}
                  min="00:00"
                  value={oraInizio}
                  onChange={(e) => cambiaInizio(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Alle</label>
                <input
                  type="time"
                  name="oraFine"
                  step={900}
                  min="00:00"
                  value={oraFine}
                  onChange={(e) => setOraFine(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="full">
            <label className="field-label">Note</label>
            <input type="text" name="descrizione" placeholder="Dettagli utili (opzionale)" />
          </div>

          <Ricorrenza />



          <div className="full">
            <label className="field-label">Invita (dalla rubrica, o scrivi l’email)</label>
            {/* Autocompletamento dalla rubrica, come nei destinatari di una mail.
                Il valore viaggia nel form con l'input nascosto. */}
            <CampoDestinatari
              value={invitati}
              onChange={setInvitati}
              contatti={contatti}
              placeholder="Es. mario@rossi.it, anna@bianchi.it (opzionale)"
            />
            <input type="hidden" name="invitati" value={invitati} />
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
