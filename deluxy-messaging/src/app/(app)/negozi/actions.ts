'use server'

import { revalidatePath } from 'next/cache'
import { eliminaNegozio, salvaNegozio } from '@/lib/negozi'

export async function salvaNegozioAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim() || null
  const nome = String(formData.get('nome') ?? '')
  const prefisso = String(formData.get('prefisso') ?? '')
  const brandRicerca = String(formData.get('brandRicerca') ?? '')
  const dominio = String(formData.get('dominio') ?? '')
  // Nessuna credenziale Shopify: gli ordini li scarica solo l'app Deluxy Orders
  // (vedi la regola in testa a src/lib/negozi.ts).
  // `attivo` si tocca solo se il form lo include (pulsante Sospendi/Riattiva).
  const attivo = formData.has('attivo') ? formData.get('attivo') === '1' : undefined
  if (!dominio.trim()) return
  await salvaNegozio(id, { nome, prefisso, brandRicerca, dominio, attivo })
  revalidatePath('/negozi')
}

export async function eliminaNegozioAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return
  await eliminaNegozio(id)
  revalidatePath('/negozi')
}
