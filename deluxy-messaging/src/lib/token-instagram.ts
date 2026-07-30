// Il token di Instagram scade ogni 60 giorni. Qui si rinnova da solo.
//
// ⚠️ IL PROBLEMA, in una riga: il token dell'«Instagram API con login di
// Instagram» nasce breve (un'ora), si scambia con uno «long-lived» che dura
// **60 giorni**, e quello NON si rinnova da sé. Al sessantesimo giorno i direct
// smettono di arrivare e da fuori sembra un guasto: token valido ieri, niente
// oggi, nessun messaggio d'errore da nessuna parte.
//
// Meta un endpoint di rinnovo lo dà — `graph.instagram.com/refresh_access_token`
// — con due condizioni: il token deve avere **più di 24 ore** e non essere
// ancora scaduto. Quindi il rinnovo va fatto PRIMA, e va fatto da qualcuno che
// se lo ricorda: il cron `/api/cron/token-meta`, ogni notte.
//
// ⚠️ NON vale per tutti i token. Un **Page Access Token generato da un utente di
// sistema non scade**, e su quello l'endpoint di rinnovo risponde con un errore:
// è la strada migliore e va detto invece di insistere. Per questo l'esito di ogni
// tentativo si scrive in `PaginaMeta.tokenEsito` e si legge in
// «Facebook e Instagram»: un rinnovo che non serve non è un guasto.

import { db } from './db'
import { cifra, decifra } from './crypto'

const RINNOVO = 'https://graph.instagram.com/refresh_access_token'

/** Quanti giorni prima della scadenza si prova a rinnovare. */
export const GIORNI_ANTICIPO = 15

export type EsitoRinnovo =
  | { ok: true; token: string; scadeIl: Date; giorni: number }
  | { ok: false; motivo: string }

/** Chiede a Meta un token nuovo a partire da quello che scade. */
export async function rinnovaTokenLungo(token: string): Promise<EsitoRinnovo> {
  try {
    const url = `${RINNOVO}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`
    const res = await fetch(url, { cache: 'no-store' })
    const dati = (await res.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number
      error?: { message?: string; code?: number }
    }
    if (!res.ok || !dati.access_token) {
      return {
        ok: false,
        motivo:
          dati.error?.message ||
          `Meta ha risposto ${res.status}. Se il token viene da un utente di sistema non scade e non va rinnovato.`,
      }
    }
    const secondi = dati.expires_in ?? 60 * 86400
    return {
      ok: true,
      token: dati.access_token,
      scadeIl: new Date(Date.now() + secondi * 1000),
      giorni: Math.round(secondi / 86400),
    }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'Errore di rete verso Meta' }
  }
}

export type RiepilogoRinnovi = {
  provati: number
  rinnovati: number
  dettagli: { account: string; esito: string }[]
}

/**
 * Rinnova i token Instagram che stanno per scadere.
 *
 * Si prova quando: la scadenza è entro `GIORNI_ANTICIPO`, oppure non la
 * conosciamo e non abbiamo mai provato. Non si prova ogni notte su tutto: se il
 * token viene da un utente di sistema l'endpoint risponde errore, e ripetere
 * l'errore ogni notte trasforma un'informazione in rumore.
 */
export async function rinnovaTokenInstagram(): Promise<RiepilogoRinnovi> {
  const account = await db.paginaMeta.findMany({
    where: { canale: 'instagram', attivo: true, NOT: { token: '' } },
    select: {
      id: true,
      nome: true,
      riferimento: true,
      token: true,
      tokenScadeIl: true,
      tokenRinnovatoIl: true,
      tokenEsito: true,
    },
  })

  const dettagli: RiepilogoRinnovi['dettagli'] = []
  let rinnovati = 0
  let provati = 0
  const fraPoco = new Date(Date.now() + GIORNI_ANTICIPO * 86400000)
  const unMese = new Date(Date.now() - 30 * 86400000)

  for (const a of account) {
    const nome = a.riferimento || a.nome || a.id
    const scadePresto = a.tokenScadeIl ? a.tokenScadeIl <= fraPoco : true
    const giaProvato = a.tokenRinnovatoIl ? a.tokenRinnovatoIl > unMese : false
    // Scadenza sconosciuta: si prova una volta al mese, non ogni notte.
    if (!scadePresto || (!a.tokenScadeIl && giaProvato)) continue

    provati++
    let token = ''
    try {
      token = decifra(a.token)
    } catch {
      dettagli.push({ account: nome, esito: 'token illeggibile (APP_SECRET cambiato)' })
      continue
    }

    const esito = await rinnovaTokenLungo(token)
    if (!esito.ok) {
      await db.paginaMeta.update({
        where: { id: a.id },
        data: { tokenRinnovatoIl: new Date(), tokenEsito: `non rinnovato: ${esito.motivo}` },
      })
      dettagli.push({ account: nome, esito: `non rinnovato: ${esito.motivo}` })
      continue
    }

    await db.paginaMeta.update({
      where: { id: a.id },
      data: {
        token: cifra(esito.token),
        tokenScadeIl: esito.scadeIl,
        tokenRinnovatoIl: new Date(),
        tokenEsito: `rinnovato: scade fra ${esito.giorni} giorni`,
      },
    })
    rinnovati++
    dettagli.push({ account: nome, esito: `rinnovato per ${esito.giorni} giorni` })
  }

  return { provati, rinnovati, dettagli }
}
