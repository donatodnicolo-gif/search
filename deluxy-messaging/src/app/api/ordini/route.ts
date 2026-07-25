import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { googleAccessToken } from '@/lib/contatti'

export const dynamic = 'force-dynamic'

// Lista ordini per la pagina Ordini, con ricerca e filtri:
//   q        testo su numero, cliente, telefono, email, indirizzo
//   negozio  id del negozio
//   contatto "si" | "no" (contatto già salvato in rubrica o no)
// Torna anche se Google è collegato (per abilitare i bottoni "Salva contatto").
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const negozio = (p.get('negozio') ?? '').trim()
  const contatto = (p.get('contatto') ?? '').trim()

  const dove: Prisma.OrdineWhereInput = {}
  if (negozio) dove.negozioId = negozio
  if (contatto === 'si') dove.contattoSalvato = true
  if (contatto === 'no') dove.contattoSalvato = false

  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [
      { numero: testo },
      { clienteNome: testo },
      { telefono: testo },
      { email: testo },
      { indirizzo: testo },
      { negozioNome: testo },
    ]
    // Cercando un numero di telefono, chi scrive spesso usa spazi o il prefisso:
    // confrontiamo anche le sole cifre, così "+39 333 12" trova "+393331234567".
    const cifre = q.replace(/[^\d]/g, '')
    if (cifre.length >= 4) dove.OR.push({ telefono: { contains: cifre } })
  }

  const [ordini, totale, token, negozi] = await Promise.all([
    db.ordine.findMany({ where: dove, orderBy: { data: 'desc' }, take: 200 }),
    db.ordine.count({ where: dove }),
    googleAccessToken().catch(() => null),
    db.negozioShopify.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])

  return NextResponse.json({
    ordini,
    totale, // quanti corrispondono in tutto (la lista è tagliata a 200)
    negozi,
    googleCollegato: !!token,
  })
}
