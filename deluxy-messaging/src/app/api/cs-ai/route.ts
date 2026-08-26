import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ambitoValido } from '@/lib/cs-ai'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le istruzioni con cui l'AI parla ai clienti: tono, firma, cosa non promettere.
// I paletti di sicurezza NON stanno qui — sono nel codice (src/lib/cs-ai.ts) e
// non si possono cancellare da questa rotta.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const ambito = (p.get('ambito') ?? '').trim()

  const negozioId = (p.get('negozioId') ?? '').trim()

  const dove: Prisma.IstruzioneAIWhereInput = {}
  if (ambito) dove.ambito = ambito
  // Filtrando per brand escono le sue regole PIÙ quelle generali: sono le due
  // cose che valgono insieme quando si scrive per quel brand. Mostrare solo le
  // sue farebbe credere che siano tutte.
  if (negozioId) dove.AND = [{ OR: [{ negozioId }, { negozioId: null }] }]
  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [{ titolo: testo }, { testo }, { categoria: testo }]
  }

  const istruzioni = await db.istruzioneAI.findMany({
    where: dove,
    orderBy: [{ attiva: 'desc' }, { ordine: 'asc' }, { categoria: 'asc' }, { titolo: 'asc' }],
    include: {
      negozio: { select: { id: true, nome: true } },
      documento: { select: { id: true, nome: true } },
    },
  })
  return NextResponse.json({ istruzioni })
}

export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    titolo?: string
    categoria?: string
    testo?: string
    ambito?: string
    negozioId?: string | null
    sostituisceId?: string | null
    ordine?: number
    attiva?: boolean
  }

  const titolo = (c.titolo ?? '').trim()
  const testo = (c.testo ?? '').trim()
  if (!titolo) return NextResponse.json({ errore: 'Serve un titolo.' }, { status: 400 })
  if (!testo) {
    return NextResponse.json(
      { errore: 'Serve il testo dell’istruzione: è quello che legge l’AI.' },
      { status: 400 }
    )
  }

  const dati = {
    titolo,
    categoria: (c.categoria ?? '').trim() || 'Generale',
    testo,
    ambito: ambitoValido((c.ambito ?? '').trim()) ? (c.ambito as string).trim() : 'tutti',
    // Vuoto = vale per tutti i brand. Un id inesistente lo rifiuta il vincolo
    // di chiave esterna, e va bene così: meglio un errore che una regola
    // agganciata a un brand che non c'è e che quindi non si applicherebbe mai.
    negozioId: (c.negozioId ?? '')?.trim() || null,
    // «Sostituisce» ha senso SOLO su una regola di brand: senza brand vorrebbe
    // dire spegnere una regola per tutti, e per quello c'è il tasto Elimina.
    sostituisceId: (c.negozioId ?? '')?.trim() ? (c.sostituisceId ?? '')?.trim() || null : null,
    ordine: Number.isFinite(Number(c.ordine)) ? Math.round(Number(c.ordine)) : 0,
    ...(c.attiva === undefined ? {} : { attiva: c.attiva }),
  }

  const istruzione = c.id
    ? await db.istruzioneAI.update({ where: { id: c.id }, data: dati })
    : await db.istruzioneAI.create({ data: dati })
  return NextResponse.json({ istruzione })
}

export async function DELETE(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.istruzioneAI.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
