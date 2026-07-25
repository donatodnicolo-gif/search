'use server'

import { revalidatePath } from 'next/cache'
import { eliminaNegozio, salvaNegozio } from '@/lib/negozi'

export async function salvaNegozioAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim() || null
  const nome = String(formData.get('nome') ?? '')
  const dominio = String(formData.get('dominio') ?? '')
  const token = String(formData.get('token') ?? '')
  const clientId = String(formData.get('clientId') ?? '')
  const clientSecret = String(formData.get('clientSecret') ?? '')
  // `attivo` si tocca solo se il form lo include (pulsante Sospendi/Riattiva).
  const attivo = formData.has('attivo') ? formData.get('attivo') === '1' : undefined
  if (!dominio.trim()) return
  await salvaNegozio(id, { nome, dominio, token, clientId, clientSecret, attivo })
  revalidatePath('/negozi')
}

export async function eliminaNegozioAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return
  await eliminaNegozio(id)
  revalidatePath('/negozi')
}
