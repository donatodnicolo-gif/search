'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvaAssenza } from '@/lib/actions'

export type DatiAssenza = {
  attiva: boolean
  /** `AAAA-MM-GG` o stringa vuota: il formato che vuole `<input type="date">`. */
  dal: string
  al: string
  messaggio: string
  inoltra: boolean
  inoltraA: string
}

export type InvioAssenza = {
  id: string
  tipo: string
  email: string
  oggetto: string
  quando: string
}

/**
 * L'assenza: risposta automatica a chi scrive, e inoltro della posta a un
 * indirizzo.
 *
 * ⚠️ Sotto al modulo c'è il REGISTRO di cosa è partito davvero. Non è un
 * dettaglio: è l'unico punto dell'app in cui una mail parte senza che nessuno
 * prema invio, e al ritorno la prima domanda è sempre «che cosa ha mandato in
 * giro?». Un automatismo che non sa rispondere a quella domanda non si usa.
 */
export function Assenza({
  iniziale,
  invii,
  quanti,
}: {
  iniziale: DatiAssenza
  invii: InvioAssenza[]
  quanti: { risposte: number; inoltri: number }
}) {
  const [attiva, setAttiva] = useState(iniziale.attiva)
  const [dal, setDal] = useState(iniziale.dal)
  const [al, setAl] = useState(iniziale.al)
  const [messaggio, setMessaggio] = useState(iniziale.messaggio)
  const [inoltra, setInoltra] = useState(iniziale.inoltra)
  const [inoltraA, setInoltraA] = useState(iniziale.inoltraA)
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const salva = () => {
    setEsito(null)
    const form = new FormData()
    form.set('attiva', attiva ? 'si' : 'no')
    form.set('dal', dal)
    form.set('al', al)
    form.set('messaggio', messaggio)
    form.set('inoltra', inoltra ? 'si' : 'no')
    form.set('inoltraA', inoltraA)
    start(async () => {
      const r = await salvaAssenza(form)
      setEsito(r)
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="card">
      <label className="mail-select-all" style={{ fontSize: 14 }}>
        <input type="checkbox" checked={attiva} onChange={(e) => setAttiva(e.target.checked)} />
        <span>
          <strong>Sono assente</strong>
          {attiva ? ' — la posta in arrivo fa scattare quello che imposti qui sotto' : ''}
        </span>
      </label>

      <div className="form-grid" style={{ marginTop: 14 }}>
        <div>
          <label className="field-label">Dal</label>
          <input type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
          <p className="page-caption" style={{ margin: '6px 0 0' }}>
            Vuoto = da adesso. Serve anche a non far rispondere l’app alla posta arretrata.
          </p>
        </div>
        <div>
          <label className="field-label">Al</label>
          <input type="date" value={al} onChange={(e) => setAl(e.target.value)} />
          <p className="page-caption" style={{ margin: '6px 0 0' }}>
            Vuoto = finché non spegni l’assenza a mano.
          </p>
        </div>

        <div className="full">
          <label className="field-label">Risposta automatica</label>
          <textarea
            rows={5}
            value={messaggio}
            onChange={(e) => setMessaggio(e.target.value)}
            placeholder={'Sono assente fino al… Per urgenze scrivi a…'}
          />
          <p className="page-caption" style={{ margin: '6px 0 0' }}>
            Parte una volta sola per ogni mittente, e mai verso indirizzi automatici
            (<code className="app-var">noreply</code>, notifiche, avvisi di mancata consegna) né verso
            la posta finita in SPAM. Lascialo vuoto se non vuoi rispondere a nessuno.
          </p>
        </div>

        <div className="full">
          <label className="mail-select-all" style={{ fontSize: 14 }}>
            <input type="checkbox" checked={inoltra} onChange={(e) => setInoltra(e.target.checked)} />
            <span>Inoltra la posta in arrivo a un altro indirizzo</span>
          </label>
        </div>

        {inoltra && (
          <div className="full">
            <label className="field-label">Inoltra a</label>
            <input
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={inoltraA}
              onChange={(e) => setInoltraA(e.target.value)}
              placeholder="collega@esempio.it"
            />
            <p className="page-caption" style={{ margin: '6px 0 0' }}>
              ⚠️ Non può essere una delle tue caselle di AI Mail: la mail rientrerebbe e
              ripartirebbe all’infinito. Gli <strong>allegati non viaggiano</strong> con l’inoltro
              automatico — restano qui, e chi riceve se lo vede scritto in cima alla mail.
            </p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary small" disabled={inCorso} onClick={salva}>
          {inCorso ? 'Salvo…' : 'Salva'}
        </button>
        {esito && (
          <span
            className="page-caption"
            style={{ margin: 0, color: esito.ok ? undefined : 'var(--red)' }}
          >
            {esito.messaggio}
          </span>
        )}
      </div>

      {(quanti.risposte > 0 || quanti.inoltri > 0) && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
          <p className="page-caption" style={{ marginTop: 0 }}>
            Da quando è attiva: <strong>{quanti.risposte}</strong>{' '}
            {quanti.risposte === 1 ? 'risposta automatica' : 'risposte automatiche'} e{' '}
            <strong>{quanti.inoltri}</strong> {quanti.inoltri === 1 ? 'inoltro' : 'inoltri'}.
          </p>
          <div className="sotto-tabella-wrap">
            <table className="tabella-dati">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Cosa</th>
                  <th>A</th>
                  <th>Mail</th>
                </tr>
              </thead>
              <tbody>
                {invii.map((i) => (
                  <tr key={i.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{i.quando}</td>
                    <td>{i.tipo === 'inoltro' ? 'inoltro' : 'risposta'}</td>
                    <td>{i.email}</td>
                    <td>{i.oggetto || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
