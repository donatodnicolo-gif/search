'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvaChiaveAppAction } from '@/lib/actions'

/**
 * Il campo dove l'admin incolla la chiave API di un'app. La chiave la scrive
 * l'utente; il server la cifra (non passa mai in chiaro, come le password IMAP)
 * e non viene mai rimandata al browser: qui si vede solo se è impostata.
 */
export function ChiaveAppForm({
  nome,
  etichetta,
  impostataDaApp,
  daHub = false,
  daEnv,
  variabileEnv,
}: {
  nome: string
  etichetta: string
  impostataDaApp: boolean
  daHub?: boolean
  daEnv: boolean
  variabileEnv: string
}) {
  const [valore, setValore] = useState('')
  const [modifica, setModifica] = useState(!impostataDaApp && !daHub && !daEnv)
  const [stato, setStato] = useState<{ ok: boolean; testo: string } | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const salva = () =>
    start(async () => {
      setStato(null)
      const esito = await salvaChiaveAppAction(nome, valore)
      setStato({ ok: esito.ok, testo: esito.messaggio })
      if (esito.ok) {
        setValore('')
        setModifica(false)
        router.refresh()
      }
    })

  const rimuovi = () =>
    start(async () => {
      if (!window.confirm(`Rimuovere la chiave di ${etichetta}? L’app tornerà scollegata (o userà la variabile del server, se impostata).`)) return
      const esito = await salvaChiaveAppAction(nome, '')
      setStato({ ok: esito.ok, testo: esito.messaggio })
      setValore('')
      router.refresh()
    })

  return (
    <div className="chiave-form">
      {!modifica ? (
        <div className="chiave-stato-riga">
          <span style={{ fontSize: 13 }}>
            {impostataDaApp ? (
              <>Chiave impostata qui nell’app <span className="chiave-pallino ok" /></>
            ) : daHub ? (
              <>Presa dalla cassaforte di deluxy-hub <span className="chiave-pallino ok" /></>
            ) : daEnv ? (
              <>Collegata tramite la variabile del server <code className="app-var">{variabileEnv}</code></>
            ) : (
              <>Nessuna chiave</>
            )}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn secondary small" onClick={() => setModifica(true)} disabled={inCorso}>
              {impostataDaApp ? 'Cambia' : 'Inserisci qui'}
            </button>
            {impostataDaApp && (
              <button type="button" className="btn secondary small" onClick={rimuovi} disabled={inCorso}>
                Rimuovi
              </button>
            )}
          </span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="password"
              value={valore}
              onChange={(e) => setValore(e.target.value)}
              placeholder={`Incolla la chiave di ${etichetta}`}
              autoComplete="off"
              style={{ flex: 1, minWidth: 220, fontSize: 13 }}
            />
            <button type="button" className="btn primary small" onClick={salva} disabled={inCorso || !valore.trim()}>
              {inCorso ? 'Salvo…' : 'Salva'}
            </button>
            {(impostataDaApp || daEnv) && (
              <button type="button" className="btn secondary small" onClick={() => { setModifica(false); setValore('') }} disabled={inCorso}>
                Annulla
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
            La chiave viene cifrata sul server. In alternativa puoi impostare la variabile{' '}
            <code className="app-var">{variabileEnv}</code> su Vercel.
          </div>
        </>
      )}

      {stato && (
        <div style={{ fontSize: 12.5, marginTop: 8, color: stato.ok ? 'var(--green)' : 'var(--red)' }}>
          {stato.testo}
        </div>
      )}
    </div>
  )
}
