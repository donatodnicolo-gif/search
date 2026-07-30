'use server'

import { revalidatePath } from 'next/cache'
import { salvaSitoWidget } from '@/lib/widget-siti'

// Salva l'aspetto e i testi del widget per UN sito.
export async function salvaAspettoSito(formData: FormData) {
  const slug = String(formData.get('slug') ?? '').trim()
  if (!slug) return

  await salvaSitoWidget({
    slug,
    nome: String(formData.get('nome') ?? ''),
    dominio: String(formData.get('dominio') ?? ''),
    negozioId: String(formData.get('negozioId') ?? '') || null,
    tema: String(formData.get('tema') ?? 'chiaro'),
    accento: String(formData.get('accento') ?? ''),
    posizione: String(formData.get('posizione') ?? 'destra'),
    etichetta: String(formData.get('etichetta') ?? ''),
    titolo: String(formData.get('titolo') ?? ''),
    saluto: String(formData.get('saluto') ?? ''),
  })

  revalidatePath('/aspetto-widget')
  // Il marchio delle conversazioni del widget dipende da questa tabella: senza,
  // l'inbox continuerebbe a mostrare le colonne di prima fino al riavvio.
  revalidatePath('/inbox')
}
