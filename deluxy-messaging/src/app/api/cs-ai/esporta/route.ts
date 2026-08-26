import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { inMarkdown, inHtml, nomeFile } from '@/lib/linee-guida'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le linee guida come documento: Markdown da scaricare, HTML da stampare o
// salvare in PDF dal browser.
//
// ?formato=md|html   ?negozioId=<id>|tutti   ?spente=1 (include le disattivate)
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const formato = p.get('formato') === 'html' ? 'html' : 'md'
  const negozioId = (p.get('negozioId') ?? '').trim()
  const conSpente = p.get('spente') === '1'

  const dove: Prisma.IstruzioneAIWhereInput = {}
  if (!conSpente) dove.attiva = true
  // Chiedendo un brand escono le sue regole PIÙ quelle generali: è quello che
  // legge l'AI quando scrive per quel brand, e il documento deve corrispondere.
  if (negozioId) dove.OR = [{ negozioId }, { negozioId: null }]

  const [righe, negozio] = await Promise.all([
    db.istruzioneAI.findMany({
      where: dove,
      orderBy: [{ ordine: 'asc' }, { categoria: 'asc' }, { titolo: 'asc' }],
      select: {
        id: true,
        titolo: true,
        categoria: true,
        testo: true,
        ambito: true,
        attiva: true,
        sostituisceId: true,
        negozio: { select: { nome: true } },
        documento: { select: { nome: true } },
      },
    }),
    negozioId
      ? db.negozioShopify.findUnique({ where: { id: negozioId }, select: { nome: true } })
      : Promise.resolve(null),
  ])

  if (negozioId && !negozio) {
    return NextResponse.json({ errore: 'Brand non trovato.' }, { status: 404 })
  }

  const quando = new Date()
  const testa = { brand: negozio?.nome ?? null, quando, soloAttive: !conSpente }

  if (formato === 'html') {
    // Inline, non allegato: dev'essere una pagina che si apre e si stampa in
    // PDF. Scaricare un .html da aprire a mano sarebbe un passaggio in più per
    // arrivare esattamente allo stesso posto.
    return new NextResponse(inHtml(righe, testa), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return new NextResponse(inMarkdown(righe, testa), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeFile(testa.brand, 'md', quando)}"`,
    },
  })
}
