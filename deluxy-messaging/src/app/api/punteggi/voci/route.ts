import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fonteValida, soggettoVoceValido } from '@/lib/punteggi'

export const dynamic = 'force-dynamic'

// Le VOCI della pagella: cosa si misura, per chi, da dove e quanto pesa. Sono
// la parte configurabile del punteggio — aggiungere una variabile nuova significa
// aggiungere una voce qui, non modificare il codice del calcolo.
export async function GET(req: NextRequest) {
  const soloAttive = req.nextUrl.searchParams.get('attive') === '1'
  const voci = await db.vocePunteggio.findMany({
    where: soloAttive ? { attiva: true } : undefined,
    orderBy: [{ attiva: 'desc' }, { peso: 'desc' }, { nome: 'asc' }],
  })
  return NextResponse.json({ voci })
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    nome?: string
    descrizione?: string
    soggetto?: string
    fonte?: string
    peso?: number
    soglia?: number
    attiva?: boolean
  }
  const nome = (c.nome ?? '').trim()
  if (!nome) return NextResponse.json({ errore: 'Serve il nome della voce.' }, { status: 400 })

  const fonte = fonteValida((c.fonte ?? '').trim()) ? (c.fonte as string).trim() : 'manuale'
  const soggetto = soggettoVoceValido((c.soggetto ?? '').trim())
    ? (c.soggetto as string).trim()
    : 'tutti'
  // La puntualità si misura solo sulle consegne: su un partner non avrebbe dati.
  if (fonte === 'puntualita' && soggetto === 'partner') {
    return NextResponse.json(
      { errore: 'La puntualità si misura sulle consegne: vale per i valet, non per i partner.' },
      { status: 400 }
    )
  }

  const dati = {
    nome,
    descrizione: (c.descrizione ?? '').trim(),
    soggetto,
    fonte,
    // Peso negativo non ha senso; 0 = voce presente ma esclusa dalla media.
    peso: Math.max(0, Math.round(Number(c.peso) || 0)),
    soglia: Math.max(0, Number(c.soglia) || 0),
    ...(c.attiva === undefined ? {} : { attiva: c.attiva }),
  }

  const voce = c.id
    ? await db.vocePunteggio.update({ where: { id: c.id }, data: dati })
    : await db.vocePunteggio.create({ data: dati })
  return NextResponse.json({ voce })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  // I valori manuali di quella voce non servono più a nessuno.
  await db.metricaManuale.deleteMany({ where: { voceId: id } })
  await db.vocePunteggio.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
