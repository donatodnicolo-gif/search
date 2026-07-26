'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cambiaThreadChiuso, cestinaThread } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * Le azioni rapide sotto una riga dei «Top thread»: apri, chiudi, cestina tutto.
 *
 * La colonna dei Top thread è un posto da cui si SMALTISCE: le conversazioni che
 * stanno lì sono quelle grosse, e quasi sempre o le si apre o si dichiara finita
 * la pratica o si butta via tutto. Prima bisognava aprire la conversazione per
 * fare l'una o l'altra cosa.
 *
 * Sia «Chiudi» sia «Cestina tutto» tolgono la conversazione dai Top thread, e
 * infatti la riga sparisce subito. Niente `router.refresh()`: la riga se n'è già
 * andata e la server action ha già invalidato la cache — rifare la pagina qui
 * significherebbe rileggere e raggruppare tutta la posta a ogni clic.
 */
export function AzioniTopThread({ messaggioId, quante }: { messaggioId: string; quante: number }) {
  const [via, setVia] = useState(false)
  const [conferma, setConferma] = useState(false)
  const [inCorso, start] = useTransition()

  if (via) return null

  const chiudi = () =>
    start(async () => {
      const esito = await cambiaThreadChiuso(messaggioId, true)
      mostraFlash(esito.messaggio)
      if (esito.ok) setVia(true)
    })

  const cestina = () =>
    start(async () => {
      setVia(true)
      const esito = await cestinaThread(messaggioId)
      mostraFlash(esito.messaggio)
    })

  // Cestinare tocca molte mail in un colpo: si chiede conferma, dicendo quante.
  if (conferma) {
    return (
      <div className="riga-azioni" style={{ marginTop: 6, gap: '6px 12px' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {quante} mail nel cestino?
        </span>
        <button type="button" className="azione-riga" disabled={inCorso} onClick={() => setConferma(false)}>
          No
        </button>
        <button
          type="button"
          className="azione-riga"
          style={{ color: 'var(--red)' }}
          disabled={inCorso}
          onClick={cestina}
        >
          Sì, cestina
        </button>
      </div>
    )
  }

  return (
    <div className="riga-azioni" style={{ marginTop: 6, gap: '6px 14px' }}>
      <Link href={`/messaggio/${messaggioId}`} className="azione-riga">
        Apri
      </Link>
      <button
        type="button"
        className="azione-riga"
        disabled={inCorso}
        title="Pratica finita: esce dai Top thread e prende l’etichetta «Chiuso». Le mail restano dove sono."
        onClick={chiudi}
      >
        {inCorso ? '…' : 'Chiudi'}
      </button>
      <button
        type="button"
        className="azione-riga"
        disabled={inCorso}
        title={`Sposta nel cestino tutte le ${quante} mail della conversazione (si recuperano dal Cestino)`}
        onClick={() => setConferma(true)}
      >
        Cestina tutto
      </button>
    </div>
  )
}
