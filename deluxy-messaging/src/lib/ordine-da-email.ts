// Smistare per sito le mail che parlano di un ordine.
//
// IL PROBLEMA: le notifiche d'ordine dei tre siti arrivano tutte sulla stessa
// casella. `[cakedesign] Ordine #1742 effettuato da Rrenja Tafe` finiva nella
// colonna della CASELLA che l'ha ricevuta — «Deluxy», perché la posta arriva a
// cs@deluxy.it — e non in quella del sito che ha venduto la torta.
//
// COME SI RISOLVE, e in che ordine:
//
//  1. **Il numero d'ordine.** Se nell'oggetto c'è `#1742` e quel numero esiste
//     nella nostra tabella ordini, il marchio è quello dell'ordine. Non è una
//     deduzione dal testo: è una RICERCA in una tabella che arriva da Shopify.
//     Misurato il 30/07/2026: 981 ordini, **zero numeri ripetuti** fra i siti
//     (Deluxy 12121–12684, Cake 1623–1742, Flowers 2318–2614).
//  2. **Il tag fra parentesi quadre**, solo se combacia con l'identità di UN
//     solo negozio (`[cakedesign]` → dominio `cakedesign-5921.myshopify.com`).
//     Se combacia con due o con nessuno non si assegna niente: meglio «senza
//     marchio» che il marchio sbagliato — una risposta col tono di un altro
//     brand è un danno, una colonna vuota è solo una colonna vuota.
//
// ⚠️ La tabella ordini locale tiene solo gli ultimi ~60 giorni: per una mail che
// parla di un ordine più vecchio il passo 1 non trova niente, e si scende al 2.

import { db } from './db'

/** Il numero d'ordine citato, in forma `#1742`. Vuoto se non ce n'è. */
export function numeroOrdineDa(testo: string): string {
  // `#` seguito da 3-7 cifre. Il tetto basso taglia gli id lunghi (tracking,
  // codici Shopify), quello alto tiene i numeri a cinque cifre di deluxy.it.
  const m = (testo ?? '').match(/#(\d{3,7})\b/)
  return m ? `#${m[1]}` : ''
}

/** Il tag del sito in testa all'oggetto: `[cakedesign] Ordine…` → cakedesign. */
export function tagSitoDa(oggetto: string): string {
  const m = (oggetto ?? '').match(/^\s*\[([a-z0-9. _-]{3,30})\]/i)
  return m ? m[1].toLowerCase().replace(/[^a-z0-9]/g, '') : ''
}

type NegozioMinimo = { id: string; nome: string; dominio: string; brandRicerca: string }

/**
 * Il negozio a cui punta il tag, se è UNO solo.
 *
 * Il confronto è su lettere e cifre: «cakedesign» sta in
 * «cakedesign-5921.myshopify.com», «deluxy» in «deluxygifts.myshopify.com».
 * Se il tag pesca due negozi si torna null — un tag ambiguo non è
 * un'informazione.
 */
export function negozioDaTag(tag: string, negozi: NegozioMinimo[]): string | null {
  if (!tag) return null
  const semplice = (v: string) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const candidati = negozi.filter((n) => {
    const dominio = semplice(n.dominio)
    const nome = semplice(n.nome)
    const ricerca = semplice(n.brandRicerca)
    return (
      (dominio && dominio.startsWith(tag)) ||
      (nome && nome === tag) ||
      (ricerca && ricerca.startsWith(tag))
    )
  })
  return candidati.length === 1 ? candidati[0].id : null
}

export type EsitoSmistamento = {
  ordineNumero: string
  negozioId: string | null
  /** Come lo abbiamo saputo: serve a fidarsi (o a non fidarsi) del risultato. */
  come: 'ordine' | 'tag' | 'niente'
}

/**
 * A quale sito appartiene questa mail. Guarda prima l'oggetto — è lì che stanno
 * il tag e il numero — e poi il corpo, dove il numero ricompare quando l'oggetto
 * è generico («Re: Ordine confermato»).
 */
export async function smistaMailPerSito(
  oggetto: string,
  testo: string
): Promise<EsitoSmistamento> {
  const numero = numeroOrdineDa(oggetto) || numeroOrdineDa(testo.slice(0, 4000))
  if (numero) {
    const ordine = await db.ordine.findFirst({
      where: { numero },
      select: { negozioId: true },
    })
    if (ordine) return { ordineNumero: numero, negozioId: ordine.negozioId, come: 'ordine' }
  }

  const tag = tagSitoDa(oggetto)
  if (tag) {
    const negozi = await db.negozioShopify.findMany({
      select: { id: true, nome: true, dominio: true, brandRicerca: true },
    })
    const id = negozioDaTag(tag, negozi)
    if (id) return { ordineNumero: numero, negozioId: id, come: 'tag' }
  }

  return { ordineNumero: numero, negozioId: null, come: 'niente' }
}
