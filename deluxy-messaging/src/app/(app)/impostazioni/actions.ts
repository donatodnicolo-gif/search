'use server'

import { redirect } from 'next/navigation'
import { salvaImpostazione } from '@/lib/impostazioni'

// Campi "segreti": se il form li lascia vuoti, il valore salvato resta com'è
// (così non serve reincollare i token a ogni modifica).
const SEGRETI = ['waToken', 'fbPageToken', 'igToken', 'metaAppSecret']
const IN_CHIARO = ['waPhoneNumberId', 'metaVerifyToken', 'widgetTitolo', 'widgetMessaggio']

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
