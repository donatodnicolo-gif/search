import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { componiIstruzioni } from '@/lib/cs-ai'

export const dynamic = 'force-dynamic'

// COSA LEGGE DAVVERO L'AI: il blocco di istruzioni esatto che finisce nel
// prompt, per le chat e per le mail.
//
// Non è un vezzo: senza, chi scrive un'istruzione non ha modo di sapere se è
// arrivata, dove si è collocata e se un'altra la contraddice. Un'istruzione che
// si crede attiva e non lo è, è peggio di un'istruzione che manca.
export async function GET(req: NextRequest) {
  const contesto = req.nextUrl.searchParams.get('contesto') === 'email' ? 'email' : 'chat'
  const istruzioni = await db.istruzioneAI.findMany({
    where: { attiva: true },
    orderBy: [{ ordine: 'asc' }, { categoria: 'asc' }, { titolo: 'asc' }],
  })
  return NextResponse.json({
    contesto,
    quante: istruzioni.filter((i) => i.ambito === 'tutti' || i.ambito === contesto).length,
    prompt: componiIstruzioni(istruzioni, contesto),
  })
}
