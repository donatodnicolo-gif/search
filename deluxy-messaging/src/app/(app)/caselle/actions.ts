'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { salvaCasella } from '@/lib/email'

export async function salvaCasellaAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim() || null
  const indirizzo = String(formData.get('indirizzo') ?? '').trim()
  if (!indirizzo) return

  await salvaCasella(id, {
    nome: String(formData.get('nome') ?? ''),
    indirizzo,
    nomeMittente: String(formData.get('nomeMittente') ?? ''),
    password: String(formData.get('password') ?? ''),
    imapHost: String(formData.get('imapHost') ?? ''),
    imapPort: Number(formData.get('imapPort') ?? 993) || 993,
    smtpHost: String(formData.get('smtpHost') ?? ''),
    smtpPort: Number(formData.get('smtpPort') ?? 465) || 465,
    // Sulla 587 si usa STARTTLS: la connessione parte in chiaro e si cifra dopo.
    smtpSicuro: Number(formData.get('smtpPort') ?? 465) !== 587,
    predefinita: formData.get('predefinita') === '1',
    negozioId: String(formData.get('negozioId') ?? ''),
    firma: String(formData.get('firma') ?? ''),
  })
  revalidatePath('/caselle')
  // L'inbox raggruppa per marchio: cambiare la casella cambia le colonne.
  revalidatePath('/inbox')
}

export async function eliminaCasellaAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return
  await db.casellaEmail.delete({ where: { id } })
  revalidatePath('/caselle')
}
