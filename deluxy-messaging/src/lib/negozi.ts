import { db } from './db'

// I negozi (brand) di Deluxy. Servono alle colonne della bacheca, alla sigla in
// rubrica e al bottone Fornitore, e si creano da soli quando il sync incontra un
// brand nuovo di Deluxy Orders.
//
// ⚠️ REGOLA NON NEGOZIABILE: **gli ordini li scarica da Shopify SOLO l'app
// Deluxy Orders.** Quest'app li legge dal registro (`src/lib/orders.ts`) e non
// deve poterli prendere altrove: due sorgenti vorrebbero dire due verità sullo
// stesso ordine, con classificazioni diverse a seconda dell'app che si guarda.
//
// Per questo il client Shopify di quest'app è stato **cancellato**
// (`src/lib/shopify.ts`, che conteneva `scaricaOrdini` e `risolviToken`) e le
// credenziali Admin non si chiedono né si salvano più: la regola è tolta dalle
// possibilità, non affidata alla memoria di chi passerà di qui. Le colonne
// `token`/`clientId`/`clientSecret` restano sulla tabella coi valori storici, ma
// nessuno le legge più.

/**
 * Il brand come lo conosce l'app Ricerca fornitori (search-deluxy): serve al
 * bottone "Fornitore" sotto ogni ordine. Il nostro dominio .myshopify.com non
 * le dice nulla, quindi si traduce nel dominio pubblico del marchio.
 */
export function brandRicercaDaNegozio(nome: string, dominio: string, brandRicerca = ''): string {
  if (brandRicerca.trim()) return brandRicerca.trim()
  const t = `${nome} ${dominio}`.toLowerCase()
  // ⚠️⚠️ BUSINESS PRIMA DI DELUXY, e non è pignoleria: «business.deluxy.it»
  // contiene «deluxy», quindi con l'ordine di prima il quarto negozio veniva
  // cercato come **deluxy.it** — il negozio regali. Nessun errore: l'ordine
  // semplicemente non si trovava, o peggio se ne trovava un altro con lo stesso
  // numero. Una regola scritta su tre valori non dice «non lo so» quando i
  // valori diventano quattro: dice il terzo.
  if (/business/.test(t)) return 'business.deluxy.it'
  if (/flower|fior/.test(t)) return 'deluxyflowers.com'
  if (/cake|pasticc|torta/.test(t)) return 'cakedesign.me'
  if (/deluxy/.test(t)) return 'deluxy.it'
  return ''
}

/** Link diretto all'app Ricerca fornitori con l'ordine già impostato. */
export function linkRicercaFornitori(brandRicerca: string, numero: string): string {
  const base = process.env.SEARCH_URL || 'https://search-deluxy.vercel.app'
  const p = new URLSearchParams({ brand: brandRicerca, ordine: numero.replace(/^#/, '').trim() })
  return `${base.replace(/\/$/, '')}/?${p}`
}

/**
 * Sigla del negozio davanti al nome in rubrica: FL (Flowers), CK (Cake),
 * BS (Business, il B2B), DL (Deluxy). Si deduce da nome+dominio; "Deluxy
 * Flowers" → FL, perché il marchio più specifico vince su "deluxy" — ed è la
 * stessa ragione per cui "business.deluxy.it" si prova **prima** di "deluxy":
 * altrimenti il quarto negozio porterebbe la sigla del terzo e in rubrica i due
 * marchi sarebbero indistinguibili.
 */
export function prefissoDaNegozio(nome: string, dominio: string, prefisso = ''): string {
  if (prefisso.trim()) return prefisso.trim().toUpperCase()
  const t = `${nome} ${dominio}`.toLowerCase()
  if (/business/.test(t)) return 'BS'
  if (/flower|fior/.test(t)) return 'FL'
  if (/cake|pasticc|torta/.test(t)) return 'CK'
  if (/deluxy/.test(t)) return 'DL'
  return (nome.trim().slice(0, 2) || 'XX').toUpperCase()
}

type DatiNegozio = {
  nome: string
  prefisso?: string
  brandRicerca?: string
  dominio: string
  /** phone_number_id del WhatsApp Business di questo brand (solo cifre). */
  waPhoneNumberId?: string
  attivo?: boolean // se undefined, non si tocca
}

/** Crea o aggiorna un negozio. */
export async function salvaNegozio(id: string | null, dati: DatiNegozio): Promise<void> {
  const dominio = dati.dominio.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  // Niente credenziali Shopify: quest'app non scarica ordini (vedi la regola in
  // testa al file). I campi storici sulla tabella non si toccano.
  const base = {
    nome: dati.nome.trim() || dominio,
    prefisso: (dati.prefisso ?? '').trim().toUpperCase(),
    brandRicerca: (dati.brandRicerca ?? '').trim(),
    // Il phone_number_id del WhatsApp Business di questo brand: solo cifre.
    // Serve a sapere a QUALE marchio ha scritto un cliente in inbox, e da
    // quale numero rispondergli.
    waPhoneNumberId: (dati.waPhoneNumberId ?? '').replace(/\D/g, ''),
    dominio,
    ...(dati.attivo === undefined ? {} : { attivo: dati.attivo }),
  }

  if (id) {
    await db.negozioShopify.update({ where: { id }, data: base })
  } else {
    await db.negozioShopify.create({ data: base })
  }
}

export async function eliminaNegozio(id: string): Promise<void> {
  await db.negozioShopify.delete({ where: { id } })
}

export async function impostaAttivo(id: string, attivo: boolean): Promise<void> {
  await db.negozioShopify.update({ where: { id }, data: { attivo } })
}
