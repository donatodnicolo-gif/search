'use server'

import { revalidatePath } from 'next/cache'
import { richiediAdmin } from './sessione'
import { salvaCredenzialiDrive } from './drive'

/**
 * Salva le credenziali del client OAuth di Google Drive.
 * ⚠️ Solo admin: sono le credenziali con cui scrive TUTTA l'azienda, e il Drive
 * di destinazione è uno solo per tutti gli utenti.
 */
export async function salvaDriveAction(form: FormData): Promise<void> {
  await richiediAdmin()
  const id = String(form.get('clientId') ?? '').trim()
  const segreto = String(form.get('clientSegreto') ?? '').trim()
  if (!id || !segreto) return
  await salvaCredenzialiDrive(id, segreto)
  revalidatePath('/impostazioni-app')
}
