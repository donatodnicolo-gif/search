'use server'

import { redirect } from 'next/navigation'
import { salvaImpostazione } from '@/lib/impostazioni'
import { soloAmministratore } from '@/lib/sessione'
import { CAMPI_INDIRIZZO, indirizzoAmmesso } from '@/lib/indirizzi-app'

// Campi "segreti": se il form li lascia vuoti, il valore salvato resta com'è
// (così non serve reincollare i token a ogni modifica).
//
// ⚠️ Proprio per quella comodità non c'era modo di TOGLIERE un segreto: un token
// revocato o incollato per errore restava lì a far fallire le chiamate, e
// l'unica mossa era sovrascriverlo con un altro. Ora ogni campo segreto ha
// accanto una casella «cancella», che arriva qui come `svuota_<chiave>`:
// spuntata, il valore si azzera.
//
// Nota: la configurazione Shopify (multi-store) vive nella tabella NegozioShopify
// e si gestisce nella pagina Negozi, non qui.
const SEGRETI = [
  'waToken',
  'fbPageToken',
  'igToken',
  'metaAppSecret',
  'igAppSecret',
  'googleClientSecret',
  'googleMapsApiKey',
  'ordersApiKey',
  'searchApiKey',
  'anthropicApiKey',
  'openaiApiKey',
  'partnerApiKey',
  'anagraficheApiKey',
]
const IN_CHIARO = [
  'waPhoneNumberId',
  'waBusinessAccountId',
  'metaVerifyToken',
  'widgetTitolo',
  'widgetMessaggio',
  'googleClientId',
  'giorniBozzaScaduta',
  'euroPerKmFuoriCitta',
  'cittaDiPartenza',
  'ordersUrl',
  'searchUrl',
  'partnerUrl',
  'anagraficheUrl',
  'openaiModello',
  'openaiModelloImmagini',
  'openaiModelloRisposte',
]

/**
 * ⚠️⚠️ SALVA E POI COLLEGA, in un gesto solo.
 *
 * Il bottone «Ricollega Google» era un LINK: chi incollava un Client Secret
 * nuovo e lo premeva se ne andava dalla pagina **buttando via quello che aveva
 * appena scritto**, e Google continuava a rispondere `invalid_client` col
 * segreto vecchio. Successo davvero, e due volte di fila.
 *
 * Il codice lo sapeva — c'era scritto «prima salva le credenziali, poi collega»
 * in un commento. Ma una regola sull'ORDINE dei gesti che vive in un commento
 * non la può conoscere chi ha il modulo davanti: o la sa il bottone, o non la sa
 * nessuno.
 */
export async function salvaECollegaGoogle(formData: FormData) {
  // ⚠️⚠️ Una server action è un ENDPOINT: nascondere la voce di menu non
  // impedisce a nessuno di chiamarla. Il cancello sta qui dentro, in ogni
  // azione, non solo nella pagina — vedi il motivo per esteso in
  // `src/lib/sessione.ts`.
  await soloAmministratore()
  await scriviTutto(formData)
  redirect('/api/google/connetti')
}

export async function salvaImpostazioni(formData: FormData) {
  // ⚠️⚠️ Una server action è un ENDPOINT: nascondere la voce di menu non
  // impedisce a nessuno di chiamarla. Il cancello sta qui dentro, in ogni
  // azione, non solo nella pagina — vedi il motivo per esteso in
  // `src/lib/sessione.ts`.
  await soloAmministratore()
  await scriviTutto(formData)
  redirect('/impostazioni?salvato=1')
}

/** Scrive tutto quello che il modulo porta. Non reindirizza: decide chi chiama. */
async function scriviTutto(formData: FormData) {
  for (const chiave of IN_CHIARO) {
    const v = formData.get(chiave)
    if (typeof v !== 'string') continue
    // ⚠️ Un indirizzo non ammesso NON si scrive, e non si scrive nemmeno a metà:
    // si salta e si lascia quello di prima. Meglio un'impostazione che non
    // cambia che una chiave che parte verso un server sconosciuto.
    if (CAMPI_INDIRIZZO.has(chiave) && !indirizzoAmmesso(v)) continue
    await salvaImpostazione(chiave, v.trim())
  }
  for (const chiave of SEGRETI) {
    // La cancellazione viene prima: se qualcuno spunta «cancella» e per abitudine
    // incolla anche un valore, l'intenzione dichiarata è quella della casella.
    if (formData.get(`svuota_${chiave}`) === '1') {
      await salvaImpostazione(chiave, '')
      continue
    }
    const v = formData.get(chiave)
    if (typeof v === 'string' && v.trim()) await salvaImpostazione(chiave, v.trim())
  }

  // ── Lingue e traduzione ──
  //
  // ⚠️ Le caselle NON spuntate non arrivano nel form: sono indistinguibili da
  // «campo assente». Senza il segnale `sezioneLingue`, togliere una lingua o
  // spegnere la traduzione automatica sarebbe impossibile — l'impostazione si
  // comporterebbe come un interruttore che si accende e non si spegne.
  if (formData.get('sezioneLingue') === '1') {
    const lingue = formData
      .getAll('lingueLette')
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
    // L'italiano c'è sempre: non è una scelta, è la lingua in cui si lavora.
    await salvaImpostazione('lingueLette', ['italiano', ...lingue].join(', '))
    await salvaImpostazione('traduzioneAuto', formData.get('traduzioneAuto') ? 'si' : '')
  }

  // ── Risposta di primo contatto ──
  //
  // Stesso motivo della sezione lingue: la casella non spuntata non arriva, e
  // senza il segnale della sezione la funzione si accenderebbe e basta. Qui la
  // differenza pesa più che altrove — è l'interruttore di un messaggio che
  // parte da solo verso i clienti.
  if (formData.get('sezionePrimoContatto') === '1') {
    await salvaImpostazione('primoContattoAttivo', formData.get('primoContattoAttivo') ? 'si' : '')
    const testo = formData.get('primoContattoTesto')
    if (typeof testo === 'string') await salvaImpostazione('primoContattoTesto', testo.trim())
  }

  // ── Piattaforma consegne ──
  //
  // ⚠️ L'indirizzo passa dallo stesso filtro degli altri (`indirizzoAmmesso`):
  // anche verso la piattaforma parte una chiave nell'header.
  {
    const v = formData.get('piattaformaUrl')
    if (typeof v === 'string' && indirizzoAmmesso(v)) await salvaImpostazione('piattaformaUrl', v.trim())
  }
  // ⚠️⚠️ La chiave adesso è un `CampoSegreto`, e i campi segreti seguono la
  // regola dei segreti: **vuoto vuol dire «non l'ho toccata»**, non «cancellala»
  // — il campo arriva sempre vuoto perché il valore non viene mai stampato a
  // video. Per cancellarla c'è la casella «Cancella il valore salvato», come per
  // tutte le altre quindici. Scritta come prima (`if typeof v === 'string'`),
  // il primo salvataggio della pagina l'avrebbe azzerata in silenzio.
  if (formData.get('svuota_piattaformaApiKey') === '1') {
    await salvaImpostazione('piattaformaApiKey', '')
  } else {
    const k = formData.get('piattaformaApiKey')
    if (typeof k === 'string' && k.trim()) await salvaImpostazione('piattaformaApiKey', k.trim())
  }

  // ── Merchandising: la scheda del prodotto (04/09/2026) ──
  {
    const v = formData.get('merchandisingUrl')
    if (typeof v === 'string' && indirizzoAmmesso(v)) {
      await salvaImpostazione('merchandisingUrl', v.trim())
    }
  }
  // ⚠️ Come per la piattaforma: campo segreto vuoto = «non l'ho toccata».
  if (formData.get('svuota_merchandisingApiKey') === '1') {
    await salvaImpostazione('merchandisingApiKey', '')
  } else {
    const k = formData.get('merchandisingApiKey')
    if (typeof k === 'string' && k.trim()) await salvaImpostazione('merchandisingApiKey', k.trim())
  }

  // ── Fuori turno risponde l'AI ──
  //
  // ⚠️⚠️ Stesso meccanismo del primo contatto, e qui pesa ancora di più: è
  // l'interruttore di un'app che scrive ai clienti da sola, di notte. Senza il
  // segnale di sezione una casella non spuntata non arriverebbe nella form, e la
  // funzione una volta accesa non si potrebbe più spegnere.
  //
  // ⚠️⚠️ E questa riga era il BUCO più imbarazzante dei tre: `/api/ai-fuori-turno`
  // riserva all'amministratore l'accensione con un 403 e un commento che spiega
  // perché — «è una decisione di chi risponde di quello che l'azienda dice» — e
  // qui la stessa chiave si scriveva senza chiedere niente a nessuno. Il cron
  // gira ogni dieci minuti, quindi non serviva nemmeno far partire il giro a
  // mano: bastava accendere e aspettare. Adesso il cancello sta in cima
  // all'azione, come nell'altra porta.
  if (formData.get('sezioneAiFuoriTurno') === '1') {
    await salvaImpostazione('aiFuoriTurnoAttivo', formData.get('aiFuoriTurnoAttivo') ? 'si' : '')
  }
}
