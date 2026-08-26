import { db } from '@/lib/db'
import { Inbox, type ConversazioneDto } from '@/components/Inbox'
import { risolutoreMarchio } from '@/lib/marchio-conversazione'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

export default async function PaginaInbox() {
  const io = await utenteCorrente()
  const [conversazioni, marchi, negozi] = await Promise.all([
    db.conversazione.findMany({
      where: { archiviata: false, eliminataIl: null },
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
    ordineNumero: c.ordineNumero,
    origine: c.origine,
    origineDettaglio: c.origineDettaglio,
    paginaIngresso: c.paginaIngresso,
    nomeRubrica: c.nomeRubrica,
    idEsterno: c.idEsterno,
    ultimoTesto: c.ultimoTesto,
    ultimoMessaggioIl: c.ultimoMessaggioIl.toISOString(),
    nonLetti: c.nonLetti,
    daRileggere: c.daRileggere,
    numeroNostro: c.numeroNostro,
    presaDaId: c.presaDaId,
    presaDaNome: c.presaDaNome,
    brand: marchi.marchioDi(c),
    etichettaAccount: marchi.etichettaDi(c),
  }))

  const brandNoti = [...new Set(negozi.map((n) => n.nome).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'it')
  )

  // Chi sono io serve al client per distinguere «me ne occupo io» da «se ne sta
  // occupando Federica»: senza, l'unica cosa che si potrebbe mostrare è un nome,
  // e il filtro «Mie» non esisterebbe.
  return (
    <Inbox
      conversazioniIniziali={iniziali}
      brandNoti={brandNoti}
      ioId={io?.id ?? ''}
      ioNome={io?.nome ?? ''}
      amministratore={io?.ruolo === 'admin'}
    />
  )
}
