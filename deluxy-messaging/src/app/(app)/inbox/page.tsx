import { db } from '@/lib/db'
import { Inbox, type ConversazioneDto } from '@/components/Inbox'
import { brandPerNumero } from '@/lib/numeri-whatsapp'
import { brandPerPagina } from '@/lib/pagine-meta'

export const dynamic = 'force-dynamic'

export default async function PaginaInbox() {
  const [conversazioni, brandNumeri, brandPagine] = await Promise.all([
    db.conversazione.findMany({
      where: { archiviata: false },
      orderBy: { ultimoMessaggioIl: 'desc' },
      take: 200,
    }),
    // Account nostro → brand: con più WhatsApp Business, più Pagine Facebook e
    // più profili Instagram, sapere a chi ha scritto il cliente è la prima cosa
    // da vedere — cambia tono, firma e chi risponde.
    brandPerNumero(),
    brandPerPagina(),
  ])
  // Una mappa sola: `numeroId` porta il numero WhatsApp o l'id dell'account
  // Meta a seconda del canale, e qui la distinzione non serve più.
  const brand = new Map([...brandNumeri, ...brandPagine])

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

  // I marchi che possono ricevere: la loro colonna si vede anche a zero
  // messaggi, così «oggi nessuno ha scritto a Cake» non si confonde con
  // «Cake non è collegato».
  const brandNoti = [...new Set([...brand.values()])].filter(Boolean).sort((a, b) =>
    a.localeCompare(b, 'it')
  )

  return <Inbox conversazioniIniziali={iniziali} brandNoti={brandNoti} />
}
