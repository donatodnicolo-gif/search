'use server'

import { redirect } from 'next/navigation'
import { salvaImpostazione } from '@/lib/impostazioni'

// Campi "segreti": se il form li lascia vuoti, il valore salvato resta com'è
// (così non serve reincollare i token a ogni modifica).
// Nota: la configurazione Shopify (multi-store) vive nella tabella NegozioShopify
// e si gestisce nella pagina Negozi, non qui.
const SEGRETI = [
  'waToken',
  'fbPageToken',
  'igToken',
  'metaAppSecret',
  'googleClientSecret',
  'ordersApiKey',
]
const IN_CHIARO = [
  'waPhoneNumberId',
  'metaVerifyToken',
  'widgetTitolo',
  'widgetMessaggio',
  'googleClientId',
  'ordersUrl',
]

export async function salvaImpostazioni(formData: FormData) {
  for (const chiave of IN_CHIARO) {
    const v = formData.get(chiave)
    if (typeof v === 'string') await salvaImpostazione(chiave, v.trim())
  }
  for (const chiave of SEGRETI) {
    const v = formData.get(chiave)
    if (typeof v === 'string' && v.trim()) await salvaImpostazione(chiave, v.trim())
  }
  redirect('/impostazioni?salvato=1')
}
