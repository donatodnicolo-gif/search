import type { Regola } from '@prisma/client'
import type { MessaggioScaricato } from './imap'

export type EsitoRegole = {
  sezioneId: string | null
  regolaId: string | null
  creaAttivita: boolean
  creaBozza: boolean
  segnaLetta: boolean
  archivia: boolean
  /** Istruzioni in italiano delle regole che hanno agganciato il messaggio. */
  istruzioniAI: string[]
}

function contiene(testo: string, ago: string | null): boolean {
  if (!ago) return true // condizione non impostata = non filtra
  return testo.toLowerCase().includes(ago.toLowerCase())
}

/** Vero se tutte le condizioni deterministiche valorizzate sono soddisfatte. */
function scatta(regola: Regola, msg: MessaggioScaricato): boolean {
  const haCondizioni = Boolean(regola.seMittente || regola.seOggetto || regola.seContiene)
  if (!haCondizioni) return false
  return (
    contiene(`${msg.mittenteNome ?? ''} ${msg.mittente}`, regola.seMittente) &&
    contiene(msg.oggetto, regola.seOggetto) &&
    contiene(msg.corpoTesto, regola.seContiene)
  )
}

/**
 * Applica le regole dell'utente prima di chiamare l'AI.
 *
 * Le regole deterministiche decidono da sole (niente token spesi, risultato
 * sempre uguale); quelle scritte in italiano non decidono qui, vengono
 * raccolte e passate al modello come istruzioni.
 */
export function applicaRegole(regole: Regola[], msg: MessaggioScaricato): EsitoRegole {
  const esito: EsitoRegole = {
    sezioneId: null,
    regolaId: null,
    creaAttivita: false,
    creaBozza: false,
    segnaLetta: false,
    archivia: false,
    istruzioniAI: [],
  }

  const ordinate = [...regole]
    .filter((r) => r.attiva)
    .sort((a, b) => b.priorita - a.priorita)

  for (const regola of ordinate) {
    // Una regola di sole istruzioni AI vale sempre: è contesto, non un filtro.
    const soloAI = !regola.seMittente && !regola.seOggetto && !regola.seContiene
    if (soloAI) {
      if (regola.istruzioneAI) esito.istruzioniAI.push(regola.istruzioneAI)
      continue
    }

    if (!scatta(regola, msg)) continue

    if (regola.sezioneId && !esito.sezioneId) {
      esito.sezioneId = regola.sezioneId
      esito.regolaId = regola.id
    }
    esito.creaAttivita ||= regola.creaAttivita
    esito.creaBozza ||= regola.creaBozza
    esito.segnaLetta ||= regola.segnaLetta
    esito.archivia ||= regola.archivia
    if (regola.istruzioneAI) esito.istruzioniAI.push(regola.istruzioneAI)

    if (regola.fermaQui) break
  }

  return esito
}
