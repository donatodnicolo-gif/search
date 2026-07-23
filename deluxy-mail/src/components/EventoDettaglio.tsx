'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminaEvento, modificaEvento } from '@/lib/actions'
import { Ricorrenza } from './Ricorrenza'
import { mostraFlash } from './Flash'

/** I dati dell'appuntamento che la scheda mostra e modifica. Giorno e ore
 *  arrivano già in ora italiana dal server: qui non si fanno conti sui fusi. */
export type DatiEvento = {
  id: string
  titolo: string
  descrizione: string
  luogo: string
  giorno: string // YYYY-MM-DD
  oraInizio: string // HH:MM
  oraFine: string // HH:MM ('' se non c'è)
  giornataIntera: boolean
  /** Valorizzato se fa parte di una serie ricorrente. */
  serieId: string | null
  /** Descrizione leggibile della ricorrenza ("Ogni 2 giorni…"). */
  regola: string
  invitati: string
  messaggioId: string | null
}

const EVENTO_APERTO = 'aimail:evento'

/** Apre la scheda di un appuntamento (usato dalle celle del calendario). */
export function apriEvento(dati: DatiEvento) {
  window.dispatchEvent(new CustomEvent(EVENTO_APERTO, { detail: dati }))
}

/** Pulsante-evento leggero: nessuno stato, apre la scheda condivisa. */
export function EventoApribile({
  dati,
  className,
  title,
  children,
}: {
  dati: DatiEvento
  className?: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={className}
      title={title}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        apriEvento(dati)
      }}
    >
      {children}
    </button>
  )
}

/**
 * La scheda di dettaglio di un appuntamento: si apre cliccandolo nel
 * calendario, permette di modificarlo o cancellarlo. Se fa parte di una serie
 * ricorrente si sceglie ogni volta se agire solo su quello o su tutta la serie.
 * Montata UNA volta per pagina.
 */
export function EventoDettaglio() {
  const [dati, setDati] = useState<DatiEvento | null>(null)
  const [modifica, setModifica] = useState(false)
  const [ambito, setAmbito] = useState<'questo' | 'serie'>('questo')
  const [confermaElimina, setConfermaElimina] = useState(false)
  // La ripetizione si rifà solo se lo chiedi esplicitamente (vedi il form).
  const [cambiaRip, setCambiaRip] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const su = (e: Event) => {
      setDati((e as CustomEvent).detail as DatiEvento)
      setModifica(false)
      setAmbito('questo')
      setConfermaElimina(false)
      setCambiaRip(false)
      setErrore(null)
    }
    window.addEventListener(EVENTO_APERTO, su)
    return () => window.removeEventListener(EVENTO_APERTO, su)
  }, [])

  if (!dati) return null
  const inSerie = Boolean(dati.serieId)
  const chiudi = () => setDati(null)

  const salva = (form: FormData) =>
    start(async () => {
      form.set('id', dati.id)
      form.set('ambito', ambito)
      const esito = await modificaEvento(form)
      if (!esito.ok) {
        setErrore(esito.messaggio)
        return
      }
      mostraFlash(esito.messaggio)
      chiudi()
      router.refresh()
    })

  const elimina = () =>
    start(async () => {
      await eliminaEvento(dati.id, ambito)
      mostraFlash(
        ambito === 'serie' ? 'Serie di appuntamenti eliminata.' : 'Appuntamento eliminato.'
      )
      chiudi()
      router.refresh()
    })

  // La scelta "solo questo / tutta la serie", mostrata solo se serve davvero.
  const sceltaAmbito = inSerie && (
    <div className="full" style={{ marginTop: 4 }}>
      <label className="field-label">A cosa si applica</label>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label className="checkbox-row">
          <input
            type="radio"
            name="ambito-scelta"
            checked={ambito === 'questo'}
            onChange={() => setAmbito('questo')}
          />
          Solo questo appuntamento
        </label>
        <label className="checkbox-row">
          <input
            type="radio"
            name="ambito-scelta"
            checked={ambito === 'serie'}
            onChange={() => setAmbito('serie')}
          />
          Tutta la serie
        </label>
      </div>
    </div>
  )

  return (
    <div className="modal-scrim" onClick={chiudi}>
      <div className="modal" role="dialog" aria-label="Appuntamento" onClick={(e) => e.stopPropagation()}>
        {!modifica ? (
          <>
            <div className="modal-title">{dati.titolo}</div>

            <div style={{ fontSize: 13.5, lineHeight: 1.7, marginBottom: 12 }}>
              <div>
                <strong>Quando:</strong>{' '}
                {dati.giorno.split('-').reverse().join('/')}
                {dati.giornataIntera
                  ? ' · tutto il giorno'
                  : ` · ${dati.oraInizio}${dati.oraFine ? `–${dati.oraFine}` : ''}`}
              </div>
              {dati.luogo && (
                <div>
                  <strong>Dove:</strong> {dati.luogo}
                </div>
              )}
              {dati.descrizione && (
                <div>
                  <strong>Note:</strong> {dati.descrizione}
                </div>
              )}
              {dati.invitati && (
                <div>
                  <strong>Invitati:</strong> {dati.invitati}
                </div>
              )}
              {inSerie && dati.regola && (
                <div style={{ marginTop: 6 }}>
                  <span className="badge gold">
                    <span className="dot" />
                    {dati.regola}
                  </span>
                </div>
              )}
            </div>

            {dati.messaggioId && (
              <a href={`/messaggio/${dati.messaggioId}`} className="azione-riga">
                Apri la mail collegata →
              </a>
            )}

            {confermaElimina ? (
              <div style={{ marginTop: 14 }}>
                {sceltaAmbito}
                <div style={{ fontSize: 13, color: 'var(--red)', margin: '10px 0' }}>
                  {ambito === 'serie'
                    ? 'Elimino TUTTE le occorrenze di questa serie. Non si torna indietro.'
                    : 'Elimino questo appuntamento. Non si torna indietro.'}
                </div>
                <div className="form-footer">
                  <button className="btn secondary" type="button" onClick={() => setConfermaElimina(false)} disabled={inCorso}>
                    Annulla
                  </button>
                  <button className="btn danger" type="button" onClick={elimina} disabled={inCorso}>
                    {inCorso ? 'Elimino…' : 'Sì, elimina'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-footer" style={{ marginTop: 14 }}>
                <button className="btn secondary" type="button" onClick={chiudi}>
                  Chiudi
                </button>
                <button className="btn secondary" type="button" onClick={() => setConfermaElimina(true)}>
                  Elimina
                </button>
                <button className="btn primary" type="button" onClick={() => setModifica(true)}>
                  Modifica
                </button>
              </div>
            )}
          </>
        ) : (
          <form action={salva}>
            <div className="modal-title">Modifica appuntamento</div>
            <div className="form-grid">
              <div className="full">
                <label className="field-label">
                  Titolo <span className="req">*</span>
                </label>
                <input type="text" name="titolo" defaultValue={dati.titolo} required autoFocus />
              </div>
              <div>
                <label className="field-label">
                  Giorno <span className="req">*</span>
                </label>
                <input type="date" name="giorno" defaultValue={dati.giorno} required disabled={ambito === 'serie'} />
                {ambito === 'serie' && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Sulla serie ogni appuntamento resta nel suo giorno.
                  </div>
                )}
              </div>
              <div>
                <label className="field-label">Luogo</label>
                <input type="text" name="luogo" defaultValue={dati.luogo} />
              </div>

              <div className="full">
                <label className="checkbox-row">
                  <input type="checkbox" name="giornataIntera" defaultChecked={dati.giornataIntera} />
                  Tutto il giorno
                </label>
              </div>

              <div>
                <label className="field-label">Dalle</label>
                <input type="time" name="oraInizio" defaultValue={dati.oraInizio || '09:00'} />
              </div>
              <div>
                <label className="field-label">Alle</label>
                <input type="time" name="oraFine" defaultValue={dati.oraFine} />
              </div>

              <div className="full">
                <label className="field-label">Note</label>
                <input type="text" name="descrizione" defaultValue={dati.descrizione} />
              </div>

              {/* Ripetizione: si tocca solo se lo chiedi, così salvare un
                  cambio di titolo non rifà mai la serie per sbaglio. */}
              <div className="full">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    name="cambiaRipetizione"
                    checked={cambiaRip}
                    onChange={(e) => setCambiaRip(e.target.checked)}
                  />
                  {inSerie ? 'Cambia la ripetizione' : 'Fai ripetere questo appuntamento'}
                </label>
                {inSerie && !cambiaRip && dati.regola && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Adesso: {dati.regola.toLowerCase()}.
                  </div>
                )}
              </div>

              {cambiaRip && (
                <>
                  <Ricorrenza />
                  <div className="full" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    La nuova ripetizione vale da questo appuntamento in poi: le occorrenze
                    successive vengono rifatte, quelle già passate restano dove sono.
                    {inSerie && ' Scegli «Non si ripete» per farlo smettere di ripetersi.'}
                  </div>
                </>
              )}

              {sceltaAmbito}
            </div>

            {errore && <div style={{ fontSize: 13, marginTop: 10, color: 'var(--red)' }}>{errore}</div>}

            <div className="form-footer">
              <button className="btn secondary" type="button" onClick={() => setModifica(false)} disabled={inCorso}>
                Annulla
              </button>
              <button className="btn primary" type="submit" disabled={inCorso}>
                {inCorso ? 'Salvo…' : 'Salva'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
