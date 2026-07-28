'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { cifra } from '@/lib/crypto'

/**
 * Crea o aggiorna una Pagina Facebook o un account Instagram collegato.
 *
 * ⚠️ Il token si salva CIFRATO e solo se ne arriva uno nuovo: il campo del form
 * parte vuoto anche quando un token c'è già, così salvare le altre voci (nome,
 * marchio) non lo cancella per distrazione. È la stessa regola delle password
 * delle caselle di posta e dei numeri WhatsApp.
 */
export async function salvaPaginaAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim() || null
  const canale = String(formData.get('canale') ?? '').trim()
  // Solo cifre: da Meta si copia spesso con spazi o a capo intorno.
  const idPagina = String(formData.get('idPagina') ?? '').replace(/\D/g, '')
  const nome = String(formData.get('nome') ?? '').trim()
  const riferimento = String(formData.get('riferimento') ?? '').trim()
  const negozioId = String(formData.get('negozioId') ?? '').trim() || null
  const token = String(formData.get('token') ?? '').trim()
  const attivo = formData.has('attivo') ? formData.get('attivo') === '1' : undefined

  // Senza id dell'account la riga non serve a niente: è la chiave con cui il
  // webhook riconosce a chi ha scritto il cliente.
  if (!idPagina) return
  if (canale !== 'messenger' && canale !== 'instagram') return

  const dati = {
    canale,
    idPagina,
    nome: nome || riferimento || idPagina,
    riferimento,
    negozioId,
    ...(token ? { token: cifra(token) } : {}),
    ...(attivo === undefined ? {} : { attivo }),
  }

  if (id) await db.paginaMeta.update({ where: { id }, data: dati })
  else await db.paginaMeta.create({ data: dati })
  revalidatePath('/account-meta')
  revalidatePath('/inbox')
}

export async function eliminaPaginaAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return
  // Le conversazioni restano: portano l'id dell'account scritto dal webhook e
  // non si perdono. Perdono solo l'etichetta del marchio, che è meno grave di
  // cancellare messaggi di clienti.
  await db.paginaMeta.delete({ where: { id } })
  revalidatePath('/account-meta')
  revalidatePath('/inbox')
}
