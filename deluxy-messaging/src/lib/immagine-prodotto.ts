// Scaricare la foto di un prodotto per allegarla a una mail.
//
// ⚠️⚠️ LISTA BIANCA, come in `/api/immagine`. Una funzione che prende un URL da
// chi la chiama e va a scaricarlo è un **proxy aperto**: da fuori la si usa per
// raggiungere indirizzi interni (169.254.169.254, localhost, la rete privata)
// passando dal nostro server. Qui si accettano soltanto gli host da cui
// arrivano davvero le immagini dei prodotti — sui 5.076 URL del registro sono
// tutti `cdn.shopify.com`. Aggiungerne uno è una decisione di sicurezza.

const HOST_AMMESSI = new Set(['cdn.shopify.com'])

/** Quanto grande può essere una foto da allegare. Oltre, si manda senza. */
const LIMITE_BYTE = 8 * 1024 * 1024

export type Allegato = { nome: string; contenuto: Buffer; tipo?: string }

/** Il nome del file: leggibile, e senza caratteri che i sistemi rifiutano. */
function nomeFile(nome: string, url: string): string {
  const estensione = (/\.(jpe?g|png|webp|gif|avif)(?:\?|$)/i.exec(url)?.[1] ?? 'jpg').toLowerCase()
  const pulito = (nome || 'prodotto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${pulito || 'prodotto'}.${estensione}`
}

/**
 * La foto, pronta da allegare. `null` quando non si può o non si deve:
 * l'indirizzo non è ammesso, non risponde, o pesa troppo.
 *
 * ⚠️ Torna `null` invece di sollevare: una mail che parte **senza** la foto è
 * un problema piccolo; una mail che non parte perché il CDN era lento è un
 * fornitore che non riceve la richiesta.
 */
export async function scaricaImmagineProdotto(
  url: string,
  nome: string
): Promise<Allegato | null> {
  const pulito = (url || '').trim()
  if (!pulito) return null
  let u: URL
  try {
    u = new URL(pulito)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !HOST_AMMESSI.has(u.hostname)) return null

  try {
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(10000), cache: 'no-store' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > LIMITE_BYTE) return null
    return {
      nome: nomeFile(nome, u.pathname),
      contenuto: buf,
      tipo: res.headers.get('content-type') ?? undefined,
    }
  } catch {
    return null
  }
}
