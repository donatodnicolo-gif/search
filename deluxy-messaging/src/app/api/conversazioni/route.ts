import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { risolutoreMarchio } from '@/lib/marchio-conversazione'

export const dynamic = 'force-dynamic'

// Elenco conversazioni per l'inbox (protetto dal middleware di sessione).
//
// `?archiviate=1` mostra l'archivio invece della posta in arrivo: è lo stesso
// elenco, con lo stesso raggruppamento per marchio, filtrato al contrario.
// Il conteggio dell'archivio torna SEMPRE, anche quando si sta guardando la
// posta in arrivo: serve al numero sulla linguetta «Archiviate», che altrimenti
// si saprebbe solo dopo averci cliccato.
export async function GET(req: NextRequest) {
  const archiviate = req.nextUrl.searchParams.get('archiviate') === '1'
  const [righe, marchi, quanteArchiviate] = await Promise.all([
    db.conversazione.findMany({
      where: { archiviata: archiviate },
      orderBy: { ultimoMessaggioIl: 'desc' },
      take: 200,
    }),
    risolutoreMarchio(),
    db.conversazione.count({ where: { archiviata: true } }),
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
  return NextResponse.json({ conversazioni, archiviate: quanteArchiviate })
}
