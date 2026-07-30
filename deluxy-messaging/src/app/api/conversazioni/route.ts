import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { risolutoreMarchio } from '@/lib/marchio-conversazione'

export const dynamic = 'force-dynamic'

// Elenco conversazioni per l'inbox (protetto dal middleware di sessione).
//
// `?vista=archivio` mostra le archiviate, `?vista=cestino` quelle buttate: è lo
// stesso elenco, con lo stesso raggruppamento per marchio, filtrato in tre modi.
// I conteggi di archivio e cestino tornano SEMPRE, anche stando in arrivo:
// servono ai numeri sulle linguette, che altrimenti si saprebbero solo dopo
// averci cliccato.
export async function GET(req: NextRequest) {
  const vista = req.nextUrl.searchParams.get('vista') ?? ''
  const dove =
    vista === 'cestino'
      ? { eliminataIl: { not: null } }
      : vista === 'archivio'
        ? { archiviata: true, eliminataIl: null }
        : { archiviata: false, eliminataIl: null }

  const [righe, marchi, quanteArchiviate, quanteNelCestino] = await Promise.all([
    db.conversazione.findMany({
      where: dove,
      // Nel cestino conta quando è stata buttata: la prima riga è quella che
      // scade prima, ed è quella che vale la pena guardare.
      orderBy: vista === 'cestino' ? { eliminataIl: 'asc' } : { ultimoMessaggioIl: 'desc' },
      take: 200,
    }),
    risolutoreMarchio(),
    db.conversazione.count({ where: { archiviata: true, eliminataIl: null } }),
    db.conversazione.count({ where: { eliminataIl: { not: null } } }),
  ])
  // Il marchio va aggiunto anche qui e non solo nella pagina: l'elenco si
  // aggiorna da questa rotta, e senza l'etichetta spariva al primo
  // aggiornamento automatico — che, con l'inbox a colonne, vuol dire vedere la
  // conversazione cambiare colonna da sola.
  const conversazioni = righe.map((c) => ({
    ...c,
    brand: marchi.marchioDi(c),
    etichettaAccount: marchi.etichettaDi(c),
  }))
  return NextResponse.json({
    conversazioni,
    archiviate: quanteArchiviate,
    nelCestino: quanteNelCestino,
  })
}
