import { CsAiLista } from '@/components/CsAiLista'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function PaginaCsAi() {
  // I brand arrivano dal server: sono tre righe che cambiano una volta l'anno,
  // e servono subito per disegnare le tendine. Una rotta API in più solo per
  // questo sarebbe una chiamata che parte a ogni apertura di pagina.
  const brand = await db.negozioShopify.findMany({
    where: { attivo: true },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  })
  return <CsAiLista brand={brand} />
}
