// I mittenti che non devono finire nell'inbox.
//
// IL PROBLEMA, misurato il 30/07/2026: nella colonna Deluxy 85 conversazioni e
// 107 messaggi non letti, e quasi tutti sono newsletter e notifiche di
// piattaforme — TikTok, chatbot Shopify, agenzie immobiliari, fornitori di
// raffrescatori. Il lavoro vero («Ordine #1742», «Re: Order #2599 confirmed»)
// sta in mezzo e si perde.
//
// ⚠️ QUI NON C'È NESSUN «ANTISPAM». Non si indovina se una mail è pubblicità: si
// ignorano i mittenti che UNA PERSONA ha messo in elenco. Un filtro che decide
// da sé, il giorno che sbaglia, fa sparire la mail di un cliente e nessuno se ne
// accorge — perché il posto dove cercarla non esiste.
//
// E non si cancella niente: le mail dei mittenti in elenco entrano **già
// archiviate** e senza contare fra i non letti. Restano nell'archivio, dove si
// possono cercare e da cui si riportano indietro con un clic.

import { leggiImpostazioni, salvaImpostazione } from './impostazioni'

const CHIAVE = 'mittentiIgnorati'

/** L'elenco come lo scrive una persona: un mittente per riga. */
export async function elencoMittentiIgnorati(): Promise<string> {
  const c = await leggiImpostazioni([CHIAVE])
  return c[CHIAVE] ?? ''
}

export async function salvaMittentiIgnorati(testo: string): Promise<void> {
  // Si normalizza (minuscole, senza righe vuote né doppioni) ma si salva come
  // testo: chi lo rilegge deve ritrovare la sua lista, non un JSON.
  const righe = [...new Set(righeValide(testo))]
  await salvaImpostazione(CHIAVE, righe.join('\n'))
}

function righeValide(testo: string): string[] {
  return (testo ?? '')
    .split('\n')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
    // I commenti servono: «# newsletter» spiega perché una riga è là.
    .filter((r) => !r.startsWith('#'))
}

/**
 * Un mittente va ignorato?
 *
 * Si accettano tre forme, dalla più precisa alla più larga:
 *  · `info@tiktok.com` — quell'indirizzo;
 *  · `@tiktok.com` — tutto il dominio;
 *  · `tiktok` — un pezzo dell'indirizzo, per i mittenti che cambiano casella a
 *    ogni invio (`no-reply-7f3a@…`). ⚠️ È la forma da usare con più prudenza:
 *    «info» dentro l'elenco farebbe sparire mezzo mondo.
 */
export function daIgnorare(mittente: string, elenco: string): boolean {
  const chi = (mittente ?? '').trim().toLowerCase()
  if (!chi) return false
  return righeValide(elenco).some((regola) => {
    if (regola.includes('@') && !regola.startsWith('@')) return chi === regola
    if (regola.startsWith('@')) return chi.endsWith(regola)
    return chi.includes(regola)
  })
}
