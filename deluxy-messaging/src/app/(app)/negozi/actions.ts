'use server'

import { revalidatePath } from 'next/cache'
import { eliminaNegozio, salvaNegozio } from '@/lib/negozi'
import { soloAmministratore } from '@/lib/sessione'

export async function salvaNegozioAction(formData: FormData) {
  // ⚠️⚠️ Una server action è un ENDPOINT: nascondere la voce di menu non
  // impedisce a nessuno di chiamarla. Il cancello sta qui dentro, in ogni
  // azione, non solo nella pagina — vedi il motivo per esteso in
  // `src/lib/sessione.ts`.
  await soloAmministratore()
  const id = String(formData.get('id') ?? '').trim() || null
  const nome = String(formData.get('nome') ?? '')
  // ⚠️⚠️ `undefined` = il form non conteneva il campo, quindi non si tocca. Il
  // bottone «Sospendi» manda solo id, nome, dominio e attivo: leggendo gli altri
  // con `?? ''` sospendere un negozio gli cancellava sigla, brand di Ricerca
  // fornitori e phone_number_id di WhatsApp, in silenzio.
  const forse = (campo: string) => (formData.has(campo) ? String(formData.get(campo) ?? '') : undefined)
  const prefisso = forse('prefisso')
  const brandRicerca = forse('brandRicerca')
  const dominio = String(formData.get('dominio') ?? '')
  const waPhoneNumberId = forse('waPhoneNumberId')
  const telefonoChiamate = forse('telefonoChiamate')
  // Nessuna credenziale Shopify: gli ordini li scarica solo l'app Deluxy Orders
  // (vedi la regola in testa a src/lib/negozi.ts).
  // `attivo` si tocca solo se il form lo include (pulsante Sospendi/Riattiva).
  const attivo = formData.has('attivo') ? formData.get('attivo') === '1' : undefined
  if (!dominio.trim()) return
  await salvaNegozio(id, {
    nome,
    prefisso,
    brandRicerca,
    dominio,
    waPhoneNumberId,
    telefonoChiamate,
    attivo,
  })
  revalidatePath('/negozi')
  // Il numero del marchio decide a quale colonna finisce una chiamata.
  revalidatePath('/chiamate')
}

export async function eliminaNegozioAction(formData: FormData) {
  // ⚠️⚠️ Una server action è un ENDPOINT: nascondere la voce di menu non
  // impedisce a nessuno di chiamarla. Il cancello sta qui dentro, in ogni
  // azione, non solo nella pagina — vedi il motivo per esteso in
  // `src/lib/sessione.ts`.
  await soloAmministratore()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return
  await eliminaNegozio(id)
  revalidatePath('/negozi')
}
