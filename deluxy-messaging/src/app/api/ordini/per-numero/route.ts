import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { formeNumero } from '@/lib/diario'

export const dynamic = 'force-dynamic'

// Un ordine, cercato per numero — per collegarlo a una richiesta di pagamento.
//
//   GET /api/ordini/per-numero?q=2785
//
// ⚠️⚠️ Torna un ELENCO, non un ordine. Lo stesso numero esiste su più negozi
// («#1733» è sia di Cake sia di Deluxy): scegliere il primo vorrebbe dire
// calcolare il margine sul valore di un altro ordine, e mostrarlo come se fosse
// quello giusto. Se ce n'è più d'uno, sceglie una persona.
//
// ⚠️ Si cerca in tutte e due le forme del numero: in tabella stanno col
// cancelletto, a mano si scrivono senza. Senza questo, «2785» non troverebbe
// «#2785» e la casella sembrerebbe rotta.

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const cifre = q.replace(/\D/g, '')
  if (cifre.length < 2) return NextResponse.json({ ordini: [] })

  const ordini = await db.ordine.findMany({
    where: {
      OR: [
        { numero: { in: formeNumero(cifre) } },
        // ⚠️ Anche «comincia per», ma solo se si è scritto abbastanza: con due
        // cifre mezzo archivio corrisponde, e un elenco di cinquanta ordini non
        // è una risposta.
        ...(cifre.length >= 3 ? [{ numero: { contains: cifre } }] : []),
      ],
    },
    orderBy: { data: 'desc' },
    take: 8,
    select: {
      id: true,
      numero: true,
      negozioNome: true,
      clienteNome: true,
      totale: true,
      valuta: true,
      data: true,
      fornitoreNome: true,
      fornitoreCosto: true,
    },
  })

  return NextResponse.json({
    ordini: ordini.map((o) => ({
      ...o,
      data: o.data.toISOString(),
    })),
  })
}
