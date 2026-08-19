'use server'

import { redirect } from 'next/navigation'
import { salvaImpostazione } from '@/lib/impostazioni'

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
  'ordersUrl',
  'searchUrl',
  'partnerUrl',
  'anagraficheUrl',
  'openaiModello',
  'openaiModelloImmagini',
  'openaiModelloRisposte',
]

export async function salvaImpostazioni(formData: FormData) {
  for (const chiave of IN_CHIARO) {
    const v = formData.get(chiave)
    if (typeof v === 'string') await salvaImpostazione(chiave, v.trim())
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

  redirect('/impostazioni?salvato=1')
}
