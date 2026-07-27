import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { brandPerNumero } from '@/lib/numeri-whatsapp'

export const dynamic = 'force-dynamic'

// Elenco conversazioni per l'inbox (protetto dal middleware di sessione).
export async function GET() {
  const [righe, brand] = await Promise.all([
    db.conversazione.findMany({
      where: { archiviata: false },
      orderBy: { ultimoMessaggioIl: 'desc' },
      take: 200,
    }),
    brandPerNumero(),
  ])
  // Il brand va aggiunto anche qui e non solo nella pagina: l'elenco si
  // aggiorna da questa rotta, e senza l'etichetta il brand spariva al primo
  // aggiornamento automatico.
  const conversazioni = righe.map((c) => ({ ...c, brand: brand.get(c.numeroId) ?? '' }))
  return NextResponse.json({ conversazioni })
}
