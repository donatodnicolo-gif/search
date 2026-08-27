'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { normalizzaSlug, salvaSitoWidget } from '@/lib/widget-siti'
import { soloAmministratore } from '@/lib/sessione'

// Salva l'aspetto e i testi del widget per UN sito.
export async function salvaAspettoSito(formData: FormData) {
  // ⚠️⚠️ Una server action è un ENDPOINT: nascondere la voce di menu non
  // impedisce a nessuno di chiamarla. Il cancello sta qui dentro, in ogni
  // azione, non solo nella pagina — vedi il motivo per esteso in
  // `src/lib/sessione.ts`.
  await soloAmministratore()
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
    selettoreApri: String(formData.get('selettoreApri') ?? ''),
    mostraBottone: String(formData.get('mostraBottone') ?? '1') !== '0',
    // ⚠️ Il default qui è '0', al contrario di `mostraBottone`: un salvataggio
    // che non manda il campo non deve accendere un rimando verso un sito dove
    // il widget potrebbe non esserci.
    apreSulSito: String(formData.get('apreSulSito') ?? '0') === '1',
    // I link rapidi arrivano come JSON dal campo nascosto: se è storto,
    // `salvaSitoWidget` li ripulisce e quello che non si capisce non entra.
    linkRapidi: (() => {
      try {
        const d = JSON.parse(String(formData.get('linkRapidi') ?? '[]'))
        return Array.isArray(d) ? d : []
      } catch {
        return []
      }
    })(),
  })

  revalidatePath('/aspetto-widget')
  // Il marchio delle conversazioni del widget dipende da questa tabella: senza,
  // l'inbox continuerebbe a mostrare le colonne di prima fino al riavvio.
  revalidatePath('/inbox')

  // ⚠️ SI TORNA SUL SITO CHE SI STAVA CONFIGURANDO, e si dice che è salvato.
  //
  // Senza il `?sito=`, dopo il salvataggio la pagina ripartiva dal PRIMO sito
  // dell'elenco: chi aveva appena tolto il bottone tondo a Cakedesign si
  // ritrovava davanti Deluxy, con la sua spunta accesa, e sembrava che
  // l'impostazione si riattivasse da sola. Il dato era giusto in tabella; a
  // mentire era la schermata.
  redirect(`/aspetto-widget?sito=${normalizzaSlug(slug)}&salvato=1`)
}
