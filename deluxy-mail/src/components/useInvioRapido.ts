'use client'

import { useEffect } from 'react'

/**
 * `Ctrl+Invio` (o `Cmd+Invio` sul Mac) mentre scrivi una mail.
 *
 * ⚠️ Qui il modificatore ci vuole, e non contraddice la regola «lettere
 * singole, mai Ctrl» delle scorciatoie generali (`components/Scorciatoie.tsx`):
 * quella regola esiste perché `Ctrl+R`, `Ctrl+F`, `Ctrl+S` sono del browser e
 * rubarle rompe abitudini di vent'anni. `Ctrl+Invio` non è di nessuno, ed è
 * quello che fanno Gmail e Outlook. Al contrario, una **lettera singola** qui
 * sarebbe impossibile: si sta scrivendo, ogni tasto è testo.
 *
 * ⚠️ E NON manda la mail da sola: fa esattamente quello che fa il clic —
 * primo `Ctrl+Invio` chiede conferma («Confermi l'invio a…?»), secondo
 * `Ctrl+Invio` spedisce. L'invio è irreversibile: la conferma non si salta
 * perché si è usata la tastiera invece del mouse.
 */
export function useInvioRapido({
  attivo,
  pronto,
  conferma,
  chiediConferma,
  invia,
}: {
  /** Falso quando un invio è già in corso o la mail è partita. */
  attivo: boolean
  /** Falso finché manca il destinatario (come il bottone disabilitato). */
  pronto: boolean
  /** Siamo già al passo «Confermi l'invio a…?». */
  conferma: boolean
  chiediConferma: () => void
  invia: () => void
}) {
  useEffect(() => {
    if (!attivo) return
    const su = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey) return
      if (!pronto) return
      // Dentro il riquadro di Renè `Invio` fa già un'altra cosa (gli chiede di
      // scrivere): lì la mail non si spedisce, o si spedirebbe quello che si
      // stava per far riscrivere.
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-senza-invio-rapido]')) return
      // Dentro l'editor ricco `Ctrl+Invio` inserirebbe una riga: lo fermiamo.
      e.preventDefault()
      if (conferma) invia()
      else chiediConferma()
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  }, [attivo, pronto, conferma, chiediConferma, invia])
}
