'use client'

import { mostraFlash } from './Flash'
import type { EsitoSpostamento } from '@/lib/actions'

/**
 * Cosa succede DOPO aver spostato una mail in una sezione, quando la sezione
 * ha un'azione APP DELUXY agganciata. Sta qui e non in tre componenti perché
 * lo spostamento si fa da tre posti (riga della posta, riga degli inviati,
 * mail aperta) e deve comportarsi allo stesso modo in tutti e tre.
 */
export function dopoSpostamento(messaggioId: string, esito: EsitoSpostamento | void) {
  if (!esito) return
  if (esito.chiedi) {
    // Stessa strada del tasto «→ App»: il dialogo è montato nel layout.
    window.dispatchEvent(
      new CustomEvent('aimail:app', {
        detail: { messaggioId, azioneId: esito.chiedi.azioneId },
      })
    )
    return
  }
  if (esito.avviata) {
    mostraFlash(
      `${esito.avviata.app} — «${esito.avviata.nome}»: la mando io. L’esito lo trovi sotto la mail, in «Risposte dalle app».`
    )
  }
}
