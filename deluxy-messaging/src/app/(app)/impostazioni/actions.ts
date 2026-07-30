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
  redirect('/impostazioni?salvato=1')
}
