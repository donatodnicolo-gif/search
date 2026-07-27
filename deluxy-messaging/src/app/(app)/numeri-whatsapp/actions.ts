'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { cifra } from '@/lib/crypto'

/**
 * Crea o aggiorna un numero WhatsApp collegato.
 *
 * ⚠️ Il token si salva CIFRATO e solo se ne arriva uno nuovo: il campo del form
 * parte vuoto anche quando un token c'è già, così salvare le altre voci (nome,
 * marchio) non lo cancella per distrazione. È la stessa regola delle password
 * delle caselle di posta.
 */
export async function salvaNumeroAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim() || null
  const nome = String(formData.get('nome') ?? '').trim()
  // Solo cifre: da Meta si copia spesso con spazi o a capo intorno.
  const phoneNumberId = String(formData.get('phoneNumberId') ?? '').replace(/\D/g, '')
  const numeroVisibile = String(formData.get('numeroVisibile') ?? '').trim()
  const wabaId = String(formData.get('wabaId') ?? '').replace(/\D/g, '')
  const negozioId = String(formData.get('negozioId') ?? '').trim() || null
  const token = String(formData.get('token') ?? '').trim()
  const attivo = formData.has('attivo') ? formData.get('attivo') === '1' : undefined

  // Senza Phone Number ID il numero non serve a niente: è la chiave con cui il
  // webhook riconosce su quale linea è arrivato un messaggio.
  if (!phoneNumberId) return

  const dati = {
    nome: nome || numeroVisibile || phoneNumberId,
    phoneNumberId,
    numeroVisibile,
    wabaId,
    negozioId,
    ...(token ? { token: cifra(token) } : {}),
    ...(attivo === undefined ? {} : { attivo }),
  }

  if (id) await db.numeroWhatsApp.update({ where: { id }, data: dati })
  else await db.numeroWhatsApp.create({ data: dati })
  revalidatePath('/numeri-whatsapp')
  revalidatePath('/inbox')
}

export async function eliminaNumeroAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return
  // Le conversazioni restano: portano il `numeroId` scritto dal webhook e non
  // si perdono. Perdono solo l'etichetta del marchio, che è meno grave di
  // cancellare messaggi di clienti.
  await db.numeroWhatsApp.delete({ where: { id } })
  revalidatePath('/numeri-whatsapp')
  revalidatePath('/inbox')
}
