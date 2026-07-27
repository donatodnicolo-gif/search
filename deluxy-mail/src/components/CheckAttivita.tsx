'use client'

import { useEffect, useState, useTransition } from 'react'
import { segnaAttivita } from '@/lib/actions'

/**
 * La spunta di un'attività.
 *
 * ⚠️ SI MUOVE SUBITO. Prima `checked` veniva dal server e la casella era
 * `disabled` durante la chiamata: il segno di spunta non compariva finché non
 * aveva finito il giro completo — server action, database in Europa,
 * allineamento col registro Attività, `router.refresh()` dell'intera pagina.
 * Una spunta che non si muove al clic sembra rotta anche quando sta solo
 * aspettando.
 *
 * Ora lo stato è locale e ottimistico: si segna all'istante e il server insegue.
 * Niente `router.refresh()` — la riga è già giusta a video, e ricostruire tutta
 * la pagina per aggiornare un contatore laterale costa molto più di quanto valga
 * (i contatori si riallineano alla prossima navigazione).
 *
 * Se il salvataggio non riesce la spunta torna indietro: meglio vedersela
 * tornare da fare che crederla salvata.
 */
export function CheckAttivita({ id, fatta }: { id: string; fatta: boolean }) {
  const [segnata, setSegnata] = useState(fatta)
  const [, start] = useTransition()

  // Se il server cambia idea (ricarico, modifica da un'altra scheda, o la task
  // chiusa dentro Deluxy Tasks), la casella si riallinea.
  useEffect(() => setSegnata(fatta), [fatta])

  return (
    <input
      type="checkbox"
      checked={segnata}
      aria-label={segnata ? 'Segna da fare' : 'Segna fatta'}
      style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--ink)', cursor: 'pointer' }}
      onChange={(e) => {
        const nuovo = e.target.checked
        setSegnata(nuovo)
        start(async () => {
          try {
            await segnaAttivita(id, nuovo)
          } catch {
            setSegnata(!nuovo) // non salvata: la casella torna com'era
          }
        })
      }}
    />
  )
}
