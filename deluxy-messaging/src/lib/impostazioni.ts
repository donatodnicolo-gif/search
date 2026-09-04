import { db } from './db'
import { cifra, decifra } from './crypto'

// Configurazione dei canali, salvata in tabella Impostazione.
// I token (chiavi che finiscono in "Token" tranne il verify token) sono cifrati.

// Chiavi usate:
// - metaVerifyToken   : il verify token del webhook Meta (lo scegli tu, in chiaro)
// - metaAppSecret     : App Secret dell'app Meta, per verificare la firma dei webhook (cifrato)
// - waToken           : token permanente WhatsApp Cloud API (cifrato)
// - waPhoneNumberId   : Phone Number ID del numero WhatsApp Business
// - fbPageToken       : Page Access Token per Messenger (cifrato)
// - igToken           : Page Access Token con permessi Instagram (cifrato)
// - widgetTitolo      : titolo mostrato nel widget di chat
// - widgetMessaggio   : messaggio di benvenuto del widget
// (i negozi Shopify NON stanno qui: sono nella tabella NegozioShopify, vedi src/lib/negozi.ts)
// - googleClientId    : OAuth Client ID del progetto Google Cloud
// - googleClientSecret: OAuth Client Secret (cifrato)
// - googleRefreshToken: refresh token ottenuto dopo il consenso (cifrato) — se
//                       c'è, l'app può salvare contatti da sola, anche in cron
// - ordersUrl         : URL dell'app Deluxy Orders (default deluxy-orders.vercel.app)
// - ordersApiKey      : chiave di sola lettura delle API di Orders (cifrata), per
//                       cercare gli ordini più vecchi di quelli scaricati da Shopify
// - anagraficheUrl    : URL del registro partner (default deluxy-anagrafiche.vercel.app)
// - anagraficheApiKey : chiave di sola lettura del registro (cifrata), per la pagina Partner
// - ordiniSyncUltimo  : quando ha girato l'ultimo aggiornamento automatico degli ordini
// - ordiniSyncEsito   : com'è andato (per capire se il cron dei 15 minuti si è fermato)

const CHIAVI_CIFRATE = new Set([
  'metaAppSecret',
  'waToken',
  'fbPageToken',
  'igToken',
  'googleClientSecret',
  'googleRefreshToken',
  'ordersApiKey',
  'searchApiKey',
  'emailPassword',
  'anthropicApiKey',
  'openaiApiKey',
  'partnerApiKey',
  'anagraficheApiKey',
  // ⚠️⚠️ Aggiunte il 27/08/2026 dopo una revisione: erano segreti a tutti gli
  // effetti e stavano **in chiaro** nella tabella `Impostazione` di un Postgres
  // condiviso con altre tredici app. `metaAppSecret` era cifrato e `igAppSecret`
  // no, nella stessa pagina, con lo stesso uso — verificare la firma dei webhook.
  'igAppSecret',
  'shopifyClientSecret',
  'googleMapsApiKey',
  'piattaformaApiKey',
  // La chiave di sola lettura di Merchandising (04/09/2026): serve alla scheda
  // prodotto che si apre dal dettaglio dell'ordine.
  'merchandisingApiKey',
])

/**
 * Ha la FORMA di un valore cifrato da `cifra()`?
 *
 * ⚠️⚠️ Serve a distinguere due cose che altrimenti si confondono: un valore
 * **ancora in chiaro** perché scritto prima che quella chiave entrasse
 * nell'elenco, e un valore cifrato che **non si riesce a decifrare** perché
 * `APP_SECRET` è cambiato. Al primo si risponde col valore, al secondo con
 * niente — e sbagliare a distinguerli vuol dire o rompere il webhook, o
 * restituire testo cifrato come se fosse un token.
 *
 * `cifra()` produce `base64(12 byte).base64(16 byte).base64(dati)`: le prime due
 * parti hanno una lunghezza fissa (16 e 24 caratteri), che nessun segreto
 * scritto a mano ha per caso.
 */
function sembraCifrato(v: string): boolean {
  const parti = v.split('.')
  return (
    parti.length === 3 &&
    parti[0].length === 16 &&
    parti[1].length === 24 &&
    parti.every((x) => /^[A-Za-z0-9+/=]+$/.test(x))
  )
}

/**
 * Il valore da restituire per una chiave che dovrebbe essere cifrata.
 *
 * ⚠️ Il ripiego sul valore in chiaro è **di transizione**: serve perché
 * aggiungere una chiave all'elenco senza migrare quello che c'è già la
 * spegnerebbe di colpo (il webhook smetterebbe di verificare le firme). Dopo
 * `scripts/cifra-segreti-in-chiaro.mjs` non lo usa più nessuno.
 */
function valoreDiChiaveCifrata(v: string): string {
  if (!sembraCifrato(v)) return v
  try {
    return decifra(v)
  } catch {
    return '' // APP_SECRET cambiato: il token va reinserito
  }
}

export async function leggiImpostazione(chiave: string): Promise<string> {
  const riga = await db.impostazione.findUnique({ where: { chiave } })
  if (!riga || !riga.valore) return ''
  if (CHIAVI_CIFRATE.has(chiave)) return valoreDiChiaveCifrata(riga.valore)
  return riga.valore
}

export async function salvaImpostazione(chiave: string, valore: string): Promise<void> {
  const daSalvare = valore && CHIAVI_CIFRATE.has(chiave) ? cifra(valore) : valore
  await db.impostazione.upsert({
    where: { chiave },
    update: { valore: daSalvare },
    create: { chiave, valore: daSalvare },
  })
}

/** Legge più impostazioni in un colpo solo (i token tornano decifrati). */
export async function leggiImpostazioni(chiavi: string[]): Promise<Record<string, string>> {
  const righe = await db.impostazione.findMany({ where: { chiave: { in: chiavi } } })
  const mappa: Record<string, string> = {}
  for (const c of chiavi) mappa[c] = ''
  for (const r of righe) {
    if (!r.valore) continue
    mappa[r.chiave] = CHIAVI_CIFRATE.has(r.chiave)
      ? valoreDiChiaveCifrata(r.valore)
      : r.valore
  }
  return mappa
}
