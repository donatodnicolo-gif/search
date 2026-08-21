import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STATI_APERTI, sincronizzaChargeback } from '@/lib/chargeback'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Le contestazioni di pagamento. `?stato=aperti` (di suo) o `tutti`.
export async function GET(req: NextRequest) {
  const stato = (req.nextUrl.searchParams.get('stato') ?? 'aperti').trim()
  const dove = stato === 'tutti' ? {} : { stato: { in: STATI_APERTI } }
  const righe = await db.chargeback.findMany({
    where: dove,
    // Prima chi ha la scadenza più vicina: è l'unico ordinamento che conta
    // quando la posta in gioco è «rispondere entro».
    orderBy: [{ scadenzaProve: 'asc' }],
  })
  const aperti = await db.chargeback.count({ where: { stato: { in: STATI_APERTI } } })
  const soldiAperti = (
    await db.chargeback.findMany({
      where: { stato: { in: STATI_APERTI } },
      select: { importo: true },
    })
  ).reduce((s, r) => s + r.importo, 0)
  return NextResponse.json({ chargeback: righe, aperti, soldiAperti })
}

// Rilegge da Shopify, adesso.
export async function POST() {
  try {
    const esito = await sincronizzaChargeback()
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json(
      { errore: `Non sono riuscito a leggere da Shopify: ${(e as Error).message}` },
      { status: 502 }
    )
  }
}
