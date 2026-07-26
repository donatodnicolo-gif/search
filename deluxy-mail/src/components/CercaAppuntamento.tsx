'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cercaAppuntamento } from '@/lib/actions'

/**
 * «Questa mail fissa un appuntamento?» — per le mail che invitano A PAROLE.
 *
 * I tasti Accetta/Forse/Rifiuta compaiono solo con un invito iCalendar vero
 * (la parte `text/calendar` di Outlook/Google/Apple): lì c'è un organizzatore a
 * cui rispondere. Un biglietto HTML — «ti aspettiamo giovedì alle 10» — per il
 * protocollo non è un invito, quindi quel riquadro non c'è e non ci può essere.
 * Ma il bisogno resta lo stesso: metterlo in agenda, o lasciar perdere.
 *
 * Da qui la data la cerca l'AI; se la trova compare «Aggiungi al calendario».
 */
export function CercaAppuntamento({ messaggioId }: { messaggioId: string }) {
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const cerca = () =>
    start(async () => {
      setStato(null)
      const r = await cercaAppuntamento(messaggioId)
      setStato(r.messaggio)
      if (r.ok) router.refresh()
    })

  return (
    <div style={{ marginBottom: 14 }}>
      <button type="button" className="azione-riga" disabled={inCorso} onClick={cerca}>
        {inCorso ? 'Cerco la data…' : '📅 Questa mail fissa un appuntamento?'}
      </button>
      {stato && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>{stato}</div>
      )}
    </div>
  )
}
