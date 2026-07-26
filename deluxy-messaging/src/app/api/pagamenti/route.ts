import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stringaPagamento, verificaIban } from '@/lib/iban'

export const dynamic = 'force-dynamic'

// Le richieste di pagamento salvate.
export async function GET() {
  const richieste = await db.richiestaPagamento.findMany({
    orderBy: { creatoIl: 'desc' },
    take: 200,
  })
  return NextResponse.json({
    richieste: richieste.map((r) => ({ ...r, stringa: stringaPagamento(r) })),
  })
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    iban?: string
    intestatario?: string
    importo?: number
    valuta?: string
    causale?: string
    note?: string
    origine?: string
    ordineNumero?: string
  }

  const esitoIban = verificaIban(c.iban ?? '')
  if (!esitoIban.normalizzato) {
    return NextResponse.json({ errore: 'Serve un IBAN.' }, { status: 400 })
  }
  if (!(c.intestatario ?? '').trim()) {
    return NextResponse.json({ errore: 'Serve l’intestatario del conto.' }, { status: 400 })
  }

  // Un IBAN che non supera il checksum si può salvare lo stesso (magari va
  // completato a mano), ma resta marcato come non valido: mai spacciarlo per buono.
  const richiesta = await db.richiestaPagamento.create({
    data: {
      iban: esitoIban.normalizzato,
      intestatario: (c.intestatario ?? '').trim(),
      importo: Number(c.importo) || 0,
      valuta: (c.valuta || 'EUR').toUpperCase(),
      causale: (c.causale ?? '').trim(),
      note: (c.note ?? '').trim(),
      ibanValido: esitoIban.valido,
      ibanPaese: esitoIban.paese,
      origine: c.origine || 'manuale',
      ordineNumero: (c.ordineNumero ?? '').trim(),
    },
  })

  return NextResponse.json({
    richiesta: { ...richiesta, stringa: stringaPagamento(richiesta) },
    motivoIban: esitoIban.motivo,
  })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.richiestaPagamento.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
