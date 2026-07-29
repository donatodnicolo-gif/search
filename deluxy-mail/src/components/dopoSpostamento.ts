'use client'

import { mostraFlash } from './Flash'
import { esitoAzioneMessaggio } from '@/lib/actions'
import type { EsitoSpostamento } from '@/lib/actions'

/**
 * Cosa succede DOPO aver spostato una mail in una sezione, quando la sezione
 * ha un'azione APP DELUXY agganciata. Sta qui e non in tre componenti perché
 * lo spostamento si fa da tre posti (riga della posta, riga degli inviati,
 * mail aperta) e deve comportarsi allo stesso modo in tutti e tre.
 *
 * ⚠️ Con l'azione **automatica** la chiamata all'app gira in `after()`, cioè
 * dopo la risposta: al ritorno dello spostamento l'esito non esiste ancora.
 * Perciò qui lo si va a chiedere, e si dice **com'è andata davvero** — «è
 * partita» non è una risposta, e dalla lista non si vedrebbe mai il seguito.
 */

const OGNI_MS = 2000
const ATTESA_MAX_MS = 45_000
/** Quanto si aspetta prima di concludere che non partirà un invio nuovo (cioè
 *  che era già stata mandata: in quel caso non si scrive nessuna riga). */
const PRIMA_DI_DIRE_GIA_FATTA = 8000

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
    const { app, nome, azioneId } = esito.avviata
    mostraFlash(`${app} — «${nome}»: sto mandando…`)
    void seguiEsito(messaggioId, azioneId, app)
  }
}

async function seguiEsito(messaggioId: string, azioneId: string, app: string) {
  const inizio = Date.now()
  // Margine sull'orologio: il server può essere avanti o indietro di qualche
  // secondo rispetto al browser, e qui si confrontano istanti.
  const soglia = inizio - 5000

  while (Date.now() - inizio < ATTESA_MAX_MS) {
    await attendi(OGNI_MS)
    let r: Awaited<ReturnType<typeof esitoAzioneMessaggio>>
    try {
      r = await esitoAzioneMessaggio(messaggioId, azioneId)
    } catch {
      continue // un giro a vuoto non è un errore
    }
    if (!r.trovato) continue

    const quando = r.quando ? new Date(r.quando).getTime() : 0
    if (quando >= soglia) {
      mostraFlash(
        `${app}: ${r.messaggio ?? (r.ok ? 'fatto.' : 'non riuscita.')}`,
        r.ok ? 'ok' : 'errore'
      )
      return
    }
    // C'è solo una riga VECCHIA: vuol dire che l'invio è stato saltato perché
    // questa mail era già stata mandata (non si manda due volte la stessa cosa).
    if (Date.now() - inizio > PRIMA_DI_DIRE_GIA_FATTA) {
      mostraFlash(`${app}: era già stata mandata. ${r.messaggio ?? ''}`.trim())
      return
    }
  }

  mostraFlash(
    `${app}: ci sta mettendo più del previsto. L’esito lo trovi sotto la mail, in «Risposte dalle app».`,
    'errore'
  )
}

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms))
