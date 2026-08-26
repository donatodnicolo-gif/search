import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { componiIstruzioni, valeNellAmbito, valePerBrand } from '@/lib/cs-ai'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// COSA LEGGE DAVVERO L'AI: il blocco di istruzioni esatto che finisce nel
// prompt, per un contesto (chat/mail) e per un brand.
//
// Non è un vezzo: senza, chi scrive un'istruzione non ha modo di sapere se è
// arrivata, dove si è collocata e se un'altra la contraddice. Un'istruzione che
// si crede attiva e non lo è, è peggio di un'istruzione che manca.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const contesto = p.get('contesto') === 'email' ? 'email' : 'chat'
  const negozioId = (p.get('negozioId') ?? '').trim()

  const [istruzioni, negozio] = await Promise.all([
    db.istruzioneAI.findMany({
      where: { attiva: true },
      orderBy: [{ ordine: 'asc' }, { categoria: 'asc' }, { titolo: 'asc' }],
    }),
    negozioId
      ? db.negozioShopify.findUnique({ where: { id: negozioId }, select: { id: true, nome: true } })
      : Promise.resolve(null),
  ])

  const brand = negozio ?? null
  return NextResponse.json({
    contesto,
    brand: brand?.nome ?? null,
    quante: istruzioni.filter(
      (i) => valeNellAmbito(i.ambito, contesto) && valePerBrand(i.negozioId, brand)
    ).length,
    // Le regole di brand lasciate fuori perché si sta guardando un altro brand
    // (o nessuno): dirlo previene la domanda «perché la mia istruzione non c'è?».
    escluseDiAltriBrand: istruzioni.filter((i) => i.negozioId && !valePerBrand(i.negozioId, brand))
      .length,
    prompt: componiIstruzioni(istruzioni, contesto, brand),
  })
}
