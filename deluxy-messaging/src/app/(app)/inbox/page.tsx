import { db } from '@/lib/db'
import { Inbox, type ConversazioneDto } from '@/components/Inbox'
import { brandPerNumero } from '@/lib/numeri-whatsapp'

export const dynamic = 'force-dynamic'

export default async function PaginaInbox() {
  const [conversazioni, brand] = await Promise.all([
    db.conversazione.findMany({
      where: { archiviata: false },
      orderBy: { ultimoMessaggioIl: 'desc' },
      take: 200,
    }),
    // Numero → brand: con più WhatsApp Business, sapere a chi ha scritto il
    // cliente è la prima cosa da vedere — cambia tono, firma e chi risponde.
    brandPerNumero(),
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
    brand: brand.get(c.numeroId) ?? '',
  }))

  return <Inbox conversazioniIniziali={iniziali} />
}
