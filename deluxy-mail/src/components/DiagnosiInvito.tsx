'use client'

import { useEffect, useState } from 'react'
import { diagnosiInvito } from '@/lib/actions'

/**
 * Com'è fatta questa mail secondo il server IMAP. Compare solo aggiungendo
 * `?diagnosi=1` all'indirizzo del messaggio: è uno strumento, non una funzione.
 *
 * Esiste perché «i tasti Accetta/Rifiuta non compaiono» ha cause diverse e
 * dall'esterno indistinguibili — uid perso, cartella sbagliata, parte non
 * dichiarata, download fallito, iCal senza data. Senza vedere le parti si va a
 * tentativi, un deploy per ipotesi.
 */
export function DiagnosiInvito({ messaggioId }: { messaggioId: string }) {
  const [testo, setTesto] = useState('Leggo la struttura della mail dal server…')

  useEffect(() => {
    let vivo = true
    diagnosiInvito(messaggioId)
      .then((t) => {
        if (vivo) setTesto(t)
      })
      .catch((e) => {
        if (vivo) setTesto(`Diagnosi non riuscita: ${String(e?.message || e)}`)
      })
    return () => {
      vivo = false
    }
  }, [messaggioId])

  return (
    <div className="ai-box" style={{ marginBottom: 14 }}>
      <div className="ai-box-title">Diagnosi invito (struttura della mail)</div>
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: 'var(--text-secondary)',
        }}
      >
        {testo}
      </pre>
    </div>
  )
}
