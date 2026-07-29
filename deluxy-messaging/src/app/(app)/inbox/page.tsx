import { db } from '@/lib/db'
import { Inbox, type ConversazioneDto } from '@/components/Inbox'
import { risolutoreMarchio } from '@/lib/marchio-conversazione'

export const dynamic = 'force-dynamic'

export default async function PaginaInbox() {
  const [conversazioni, marchioDi, negozi] = await Promise.all([
    db.conversazione.findMany({
      where: { archiviata: false },
      orderBy: { ultimoMessaggioIl: 'desc' },
      take: 200,
    }),
    // A chi ha scritto il cliente: cambia tono, firma e chi risponde.
    risolutoreMarchio(),
    // Tutti i marchi dell'app, non solo quelli con un account collegato: una
    // colonna vuota dice «oggi non ha scritto nessuno», che è un'informazione;
    // una colonna che manca fa credere che il marchio non esista.
    db.negozioShopify.findMany({
      where: { attivo: true },
      select: { nome: true },
      orderBy: { nome: 'asc' },
    }),
  ])

  const iniziali: ConversazioneDto[] = conversazioni.map((c) => ({
    id: c.id,
    canale: c.canale,
    nome: c.nome,
    idEsterno: c.idEsterno,
    ultimoTesto: c.ultimoTesto,
    ultimoMessaggioIl: c.ultimoMessaggioIl.toISOString(),
    nonLetti: c.nonLetti,
    numeroNostro: c.numeroNostro,
    brand: marchioDi(c),
  }))

  const brandNoti = [...new Set(negozi.map((n) => n.nome).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'it')
  )

  return <Inbox conversazioniIniziali={iniziali} brandNoti={brandNoti} />
}
