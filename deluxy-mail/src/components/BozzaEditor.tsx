'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviaBozza, salvaBozza } from '@/lib/actions'
import { EditorRicco } from './EditorRicco'
import { Allegati } from './Allegati'
import { mostraFlash } from './Flash'

type Props = {
  bozza: { id: string; oggetto: string; corpo: string; inviata: boolean; modificata: boolean }
  destinatario: string
  mittente: string
}

export function BozzaEditor({ bozza, destinatario, mittente }: Props) {
  const [oggetto, setOggetto] = useState(bozza.oggetto)
  const [corpo, setCorpo] = useState(bozza.corpo)
  const [allegati, setAllegati] = useState<File[]>([])
  const [stato, setStato] = useState<string | null>(null)
  // L'invio è irreversibile: prima di partire chiediamo conferma esplicita.
  const [confermaInvio, setConfermaInvio] = useState(false)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  if (bozza.inviata) {
    return (
      <>
        <div className="ai-box-title">Risposta</div>
        <div className="badge green" style={{ marginTop: 8 }}>
          <span className="dot" />
          Inviata a {destinatario}
        </div>
        <div className="mail-body" style={{ marginTop: 14 }}>
          {corpo}
        </div>
      </>
    )
  }

  function salva() {
    setStato(null)
    startTransition(async () => {
      await salvaBozza(bozza.id, oggetto, corpo)
      setStato('Bozza salvata.')
      router.refresh()
    })
  }

  function invia() {
    setStato(null)
    startTransition(async () => {
      await salvaBozza(bozza.id, oggetto, corpo)
      const form = new FormData()
      for (const f of allegati) form.append('allegati', f)
      const esito = await inviaBozza(bozza.id, form)
      setStato(esito.messaggio)
      setConfermaInvio(false)
      if (esito.ok) mostraFlash(esito.messaggio)
      router.refresh()
    })
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div className="ai-box-title" style={{ margin: 0 }}>
          Risposta proposta dall’AI
        </div>
        {bozza.modificata && <span className="badge neutral">modificata da te</span>}
      </div>

      <div className="form-grid">
        <div className="full">
          <label className="field-label">Da</label>
          <input type="text" value={mittente} disabled />
        </div>
        <div className="full">
          <label className="field-label">A</label>
          <input type="text" value={destinatario} disabled />
        </div>
        <div className="full">
          <label className="field-label">Oggetto</label>
          <input type="text" value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
        </div>
        <div className="full">
          <label className="field-label">Testo</label>
          <EditorRicco valoreIniziale={bozza.corpo} onChange={setCorpo} minAltezza={220} />
        </div>
        <div className="full">
          <Allegati files={allegati} onChange={setAllegati} />
        </div>
      </div>

      {stato && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>{stato}</div>
      )}

      <div className="form-footer">
        <button className="btn secondary" onClick={salva} disabled={inCorso}>
          Salva bozza
        </button>
        {confermaInvio ? (
          <>
            <button className="btn secondary" onClick={() => setConfermaInvio(false)} disabled={inCorso}>
              Annulla
            </button>
            <button className="btn primary" onClick={invia} disabled={inCorso}>
              {inCorso ? 'Invio…' : `Confermi l’invio a ${destinatario}?`}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => setConfermaInvio(true)} disabled={inCorso}>
            Invia risposta
          </button>
        )}
      </div>
    </>
  )
}
