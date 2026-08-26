import { NextRequest, NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Scarica la foto di un prodotto passando da noi, per due motivi:
//  1. il browser IGNORA l'attributo `download` sui link verso un altro dominio,
//     quindi un link diretto al CDN Shopify APRE la foto invece di salvarla —
//     e chi la deve mandare al fornitore la vuole come file;
//  2. così l'header `Content-Disposition: attachment` lo mettiamo noi, col nome
//     del prodotto invece di `susy-3324701.png`.
//
// ⚠️ LISTA BIANCA OBBLIGATORIA. Una rotta che scarica un URL arbitrario scelto da
// chi chiama è un proxy aperto: la si usa per raggiungere indirizzi interni
// (169.254.169.254, localhost, la rete privata) passando dal nostro server, che
// da fuori non sono raggiungibili. Qui si accettano SOLO gli host da cui
// arrivano davvero le immagini dei prodotti — sui 5.076 URL nel registro sono
// tutti `cdn.shopify.com`. Aggiungere un host è una decisione di sicurezza, non
// una configurazione.
const HOST_AMMESSI = new Set(['cdn.shopify.com'])

/** Nome del file da salvare: leggibile, e senza caratteri che i sistemi rifiutano. */
function nomeFile(nome: string, url: string): string {
  const estensione = (/\.(jpe?g|png|webp|gif|avif)(?:\?|$)/i.exec(url)?.[1] ?? 'jpg').toLowerCase()
  const pulito = (nome || 'prodotto')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // via gli accenti (forma esplicita: i segni combinanti)
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${pulito || 'prodotto'}.${estensione}`
}

export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const grezzo = (p.get('url') ?? '').trim()
  const nome = (p.get('nome') ?? '').trim()
  if (!grezzo) return NextResponse.json({ errore: 'Serve l’URL della foto.' }, { status: 400 })

  let url: URL
  try {
    url = new URL(grezzo)
  } catch {
    return NextResponse.json({ errore: 'URL non valido.' }, { status: 400 })
  }
  if (url.protocol !== 'https:' || !HOST_AMMESSI.has(url.hostname)) {
    return NextResponse.json(
      { errore: `Non scarico da ${url.hostname}: sono ammesse solo le foto dei prodotti Shopify.` },
      { status: 400 }
    )
  }

  let risposta: Response
  try {
    risposta = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
  } catch (e) {
    const err = e as Error
    return NextResponse.json(
      {
        errore:
          err.name === 'TimeoutError'
            ? 'La foto non è arrivata in tempo.'
            : `Foto non raggiungibile: ${err.message}`,
      },
      { status: 502 }
    )
  }
  if (!risposta.ok) {
    return NextResponse.json({ errore: `La foto ha risposto ${risposta.status}.` }, { status: 502 })
  }

  const tipo = risposta.headers.get('content-type') ?? 'image/jpeg'
  // Non si rimanda al browser qualcosa che non è un'immagine, anche se arriva da
  // un host ammesso: il tipo lo decide chi risponde, non noi.
  if (!tipo.startsWith('image/')) {
    return NextResponse.json({ errore: 'Il file non è un’immagine.' }, { status: 502 })
  }

  return new NextResponse(risposta.body, {
    headers: {
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nomeFile(nome, url.pathname)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
