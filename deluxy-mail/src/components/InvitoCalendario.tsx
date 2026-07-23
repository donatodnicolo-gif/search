'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { leggiInvito, rispondiInvito, type InvitoInMail } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * Inviti di calendario RICEVUTI (Outlook, Google, Apple): la mail porta con sé
 * una parte `text/calendar` con data, ora e organizzatore. Qui compaiono
 * **Accetta / Forse / Rifiuta**: l'appuntamento va in agenda e all'organizzatore
 * parte la risposta iCal, quella che gli aggiorna lo stato del partecipante.
 *
 * L'invito si legge DOPO il render (la parte calendario si prende dal server,
 * come gli allegati): aprire la mail resta istantaneo. Se non c'è nessun
 * invito, questo componente non mostra niente.
 */
export function InvitoCalendario({ messaggioId }: { messaggioId: string }) {
  const [invito, setInvito] = useState<InvitoInMail | null>(null)
  const [cercato, setCercato] = useState(false)
  const [esito, setEsito] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    let vivo = true
    leggiInvito(messaggioId)
      .then((i) => {
        if (vivo) {
          setInvito(i)
          setCercato(true)
        }
      })
      .catch(() => {
        if (vivo) setCercato(true)
      })
    return () => {
      vivo = false
    }
  }, [messaggioId])

  if (!cercato || !invito) return null

  // Invito annullato dall'organizzatore: non si risponde, si avvisa e basta.
  const annullato = invito.metodo === 'CANCEL'

  const rispondi = (stato: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE') =>
    start(async () => {
      const r = await rispondiInvito(messaggioId, stato)
      setEsito(r.messaggio)
      if (r.ok) {
        mostraFlash(r.messaggio)
        router.refresh()
      }
    })

  return (
    <div className="ai-box" style={{ marginBottom: 14 }}>
      <div className="ai-box-title">
        {annullato ? 'Appuntamento annullato' : 'Invito a un appuntamento'}
      </div>
      <div className="ai-box-text">
        <div style={{ fontSize: 15, fontWeight: 600 }}>{invito.titolo}</div>
        <div style={{ marginTop: 4 }}>📅 {invito.quando}</div>
        {invito.luogo && <div style={{ marginTop: 2 }}>📍 {invito.luogo}</div>}
        {invito.organizzatore && (
          <div className="muted" style={{ marginTop: 2, fontSize: 12.5 }}>
            Organizza: {invito.organizzatore}
          </div>
        )}
        {invito.giaInAgenda && (
          <div style={{ marginTop: 6 }}>
            <span className="badge green">
              <span className="dot" />
              Già nel tuo calendario
            </span>
          </div>
        )}

        {!annullato && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn primary small" type="button" disabled={inCorso} onClick={() => rispondi('ACCEPTED')}>
              {inCorso ? '…' : 'Accetta'}
            </button>
            <button className="btn secondary small" type="button" disabled={inCorso} onClick={() => rispondi('TENTATIVE')}>
              Forse
            </button>
            <button className="btn secondary small" type="button" disabled={inCorso} onClick={() => rispondi('DECLINED')}>
              Rifiuta
            </button>
          </div>
        )}

        {esito && (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 8 }}>{esito}</div>
        )}
        {!annullato && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Rispondendo, all’organizzatore arriva la conferma e l’appuntamento entra nel tuo
            calendario (con «Rifiuta» non viene aggiunto).
          </div>
        )}
      </div>
    </div>
  )
}
