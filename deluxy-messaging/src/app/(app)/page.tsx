import { db } from '@/lib/db'
import { Inbox, type ConversazioneDto } from '@/components/Inbox'

export const dynamic = 'force-dynamic'

export default async function PaginaInbox() {
  const conversazioni = await db.conversazione.findMany({
    where: { archiviata: false },
    orderBy: { ultimoMessaggioIl: 'desc' },
    take: 200,
  })

  const iniziali: ConversazioneDto[] = conversazioni.map((c) => ({
    id: c.id,
    canale: c.canale,
    nome: c.nome,
    idEsterno: c.idEsterno,
    ultimoTesto: c.ultimoTesto,
    ultimoMessaggioIl: c.ultimoMessaggioIl.toISOString(),
    nonLetti: c.nonLetti,
  }))

  return <Inbox conversazioniIniziali={iniziali} />
}
