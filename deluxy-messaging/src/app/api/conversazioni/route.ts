import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { risolutoreMarchio } from '@/lib/marchio-conversazione'

export const dynamic = 'force-dynamic'

// Elenco conversazioni per l'inbox (protetto dal middleware di sessione).
export async function GET() {
  const [righe, marchi] = await Promise.all([
    db.conversazione.findMany({
      where: { archiviata: false },
      orderBy: { ultimoMessaggioIl: 'desc' },
      take: 200,
    }),
    risolutoreMarchio(),
  ])
  // Il marchio va aggiunto anche qui e non solo nella pagina: l'elenco si
  // aggiorna da questa rotta, e senza l'etichetta spariva al primo
  // aggiornamento automatico — che adesso, con l'inbox a colonne, vuol dire
  // vedere la conversazione cambiare colonna da sola.
  const conversazioni = righe.map((c) => ({
    ...c,
    brand: marchi.marchioDi(c),
    etichettaAccount: marchi.etichettaDi(c),
  }))
  return NextResponse.json({ conversazioni })
}
