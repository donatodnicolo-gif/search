'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decidiPropostaRene, modificaPropostaRene } from '@/lib/actions'

// Etichette leggibili per i campi delle proposte (le chiavi tecniche del JSON).
const ETICHETTE: Record<string, string> = {
  nome: 'Nome',
  descrizione: 'Descrizione',
  titolo: 'Titolo',
  dettaglio: 'Dettaglio',
  scadenza: 'Scadenza (AAAA-MM-GG)',
  priorita: 'Priorità (P0–P3)',
  inizio: 'Inizio (AAAA-MM-GGThh:mm)',
  fine: 'Fine',
  luogo: 'Luogo',
  sezioneNome: 'Sezione',
  seMittente: 'Se il mittente contiene',
  seOggetto: 'Se l’oggetto contiene',
  seContiene: 'Se il testo contiene',
  archivia: 'Archivia',
  oggettoMail: 'Mail',
}

/** Una proposta di Renè: modifica (i suoi dati) / approva (anche "per sempre") / scarta. */
export function RenePropostaCard({
  id,
  tipo,
  dati,
}: {
  id: string
  tipo?: string
  dati?: Record<string, unknown>
}) {
  const [esito, setEsito] = useState<string | null>(null)
  const [modifica, setModifica] = useState(false)
  // I campi editabili: solo i valori "semplici" (testo/numero/booleano) del JSON.
  const [campi, setCampi] = useState<Record<string, unknown>>(dati ?? {})
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const chiavi = Object.keys(campi).filter((k) => {
    const v = campi[k]
    return v === null || ['string', 'number', 'boolean'].includes(typeof v)
  })

  const decidi = (approva: boolean, sempre = false) =>
    start(async () => {
      const r = await decidiPropostaRene(id, approva, sempre)
      setEsito(r.messaggio)
      router.refresh()
    })

  const salvaModifica = () =>
    start(async () => {
      const r = await modificaPropostaRene(id, campi)
      setEsito(r.messaggio)
      setModifica(false)
      router.refresh()
    })

  if (modifica) {
    return (
      <div style={{ width: '100%' }}>
        <div className="form-grid" style={{ marginBottom: 10 }}>
          {chiavi.map((k) => (
            <div key={k} className={typeof campi[k] === 'boolean' ? '' : 'full'}>
              {typeof campi[k] === 'boolean' ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(campi[k])}
                    onChange={(e) => setCampi((c) => ({ ...c, [k]: e.target.checked }))}
                  />
                  {ETICHETTE[k] ?? k}
                </label>
              ) : (
                <>
                  <label className="field-label">{ETICHETTE[k] ?? k}</label>
                  <input
                    type="text"
                    value={campi[k] == null ? '' : String(campi[k])}
                    onChange={(e) => setCampi((c) => ({ ...c, [k]: e.target.value }))}
                  />
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary small" type="button" disabled={inCorso} onClick={salvaModifica}>
            {inCorso ? 'Salvo…' : 'Salva modifiche'}
          </button>
          <button
            className="btn secondary small"
            type="button"
            disabled={inCorso}
            onClick={() => {
              setCampi(dati ?? {})
              setModifica(false)
            }}
          >
            Annulla
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn primary small" type="button" disabled={inCorso} onClick={() => decidi(true)}>
        {inCorso ? '…' : 'Approva'}
      </button>
      {tipo && chiavi.length > 0 && (
        <button
          className="btn secondary small"
          type="button"
          disabled={inCorso}
          title="Correggi la proposta prima di eseguirla"
          onClick={() => {
            setCampi(dati ?? {})
            setModifica(true)
          }}
        >
          Modifica
        </button>
      )}
      <button
        className="btn secondary small"
        type="button"
        disabled={inCorso}
        title={
          tipo === 'smista'
            ? 'Approva e crea una regola sul mittente: le prossime mail di questo mittente andranno da sole in questa sezione'
            : 'Approva e rendi questo TIPO di azione una conseguenza: d’ora in poi Renè lo farà da solo'
        }
        onClick={() => decidi(true, true)}
      >
        {tipo === 'smista' ? 'Approva, e crea la regola' : 'Approva, e fai sempre così'}
      </button>
      <button className="btn secondary small" type="button" disabled={inCorso} onClick={() => decidi(false)}>
        No
      </button>
      {esito && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{esito}</span>}
    </div>
  )
}
