'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviaNuovaMail, salvaMinuta } from '@/lib/actions'
import { EditorRicco } from './EditorRicco'
import { Allegati } from './Allegati'
import { CampoDestinatari, type ContattoRubrica } from './CampoDestinatari'
import { mettiFlash } from './Flash'

type Props = {
  da: string
  iniziale: { a: string; cc: string; oggetto: string; corpo: string }
  /** Valorizzato quando si sta riprendendo una bozza già salvata. */
  bozzaId?: string
  /** La rubrica, per suggerire i destinatari mentre scrivi. */
  contatti?: ContattoRubrica[]
}

/** Scrittura di una mail da zero (nessun messaggio d'origine). */
export function ComposizioneNuova({ da, iniziale, bozzaId, contatti = [] }: Props) {
  const [a, setA] = useState(iniziale.a)
  const [cc, setCc] = useState(iniziale.cc)
  const [oggetto, setOggetto] = useState(iniziale.oggetto)
  const [corpo, setCorpo] = useState(iniziale.corpo)
  const [allegati, setAllegati] = useState<File[]>([])
  const [stato, setStato] = useState<{ ok: boolean; messaggio: string } | null>(null)
  // L'invio è irreversibile: prima di partire si conferma.
  const [conferma, setConferma] = useState(false)
  // Salvando due volte non si devono creare due bozze: dal primo salvataggio
  // in poi si aggiorna quella.
  const [idBozza, setIdBozza] = useState(bozzaId)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function campi(conAllegati: boolean) {
    const form = new FormData()
    if (idBozza) form.set('bozzaId', idBozza)
    form.set('modo', 'nuova')
    form.set('a', a)
    form.set('cc', cc)
    form.set('oggetto', oggetto)
    form.set('corpo', corpo)
    if (conAllegati) for (const f of allegati) form.append('allegati', f)
    return form
  }

  function salva() {
    setStato(null)
    startTransition(async () => {
      const esito = await salvaMinuta(campi(false))
      setStato(esito)
      if (esito.id) setIdBozza(esito.id)
      router.refresh()
    })
  }

  function invia() {
    setStato(null)
    startTransition(async () => {
      const esito = await inviaNuovaMail(campi(true))
      setStato(esito)
      setConferma(false)
      if (esito.ok) {
        mettiFlash(esito.messaggio)
        router.push('/inviata')
        router.refresh()
      }
    })
  }

  return (
    <div className="card">
      <div className="form-grid">
        <div className="full">
          <label className="field-label">Da</label>
          <input type="text" value={da} disabled />
        </div>

        <div className="full">
          <label className="field-label">
            A <span className="req">*</span>
          </label>
          <CampoDestinatari
            value={a}
            onChange={setA}
            contatti={contatti}
            placeholder="Nome o email (dalla rubrica)"
            autoFocus
          />
        </div>

        <div className="full">
          <label className="field-label">Cc</label>
          <CampoDestinatari value={cc} onChange={setCc} contatti={contatti} />
        </div>

        <div className="full">
          <label className="field-label">Oggetto</label>
          <input type="text" value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
        </div>

        <div className="full">
          <label className="field-label">Messaggio</label>
          <EditorRicco valoreIniziale={iniziale.corpo} onChange={setCorpo} />
        </div>

        <div className="full">
          <Allegati files={allegati} onChange={setAllegati} />
        </div>
      </div>

      {stato && (
        <div
          style={{
            fontSize: 13,
            marginTop: 14,
            color: stato.ok ? 'var(--green)' : 'var(--red)',
          }}
        >
          {stato.messaggio}
        </div>
      )}

      <div className="form-footer">
        <button
          className="btn secondary"
          onClick={() => router.push('/')}
          disabled={inCorso}
          type="button"
        >
          Annulla
        </button>

        <button className="btn secondary" onClick={salva} disabled={inCorso} type="button">
          Salva bozza
        </button>

        {conferma ? (
          <>
            <button
              className="btn secondary"
              onClick={() => setConferma(false)}
              disabled={inCorso}
              type="button"
            >
              Torna a modificare
            </button>
            <button className="btn primary" onClick={invia} disabled={inCorso} type="button">
              {inCorso ? 'Invio…' : `Confermi l’invio a ${a || '…'}?`}
            </button>
          </>
        ) : (
          <button
            className="btn primary"
            onClick={() => setConferma(true)}
            disabled={inCorso || !a.trim()}
            type="button"
          >
            Invia
          </button>
        )}
      </div>
    </div>
  )
}
