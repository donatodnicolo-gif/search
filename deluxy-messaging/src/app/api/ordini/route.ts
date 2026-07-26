import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { googleAccessToken } from '@/lib/contatti'
import { brandRicercaDaNegozio } from '@/lib/negozi'
import { ultimoImportOrders } from '@/lib/orders'

export const dynamic = 'force-dynamic'

// Lista ordini per la pagina Ordini, con ricerca e filtri:
//   q        testo su numero, cliente, telefono, email, indirizzo
//   negozio  id del negozio
//   contatto "si" | "no" (contatto già salvato in rubrica o no)
// Torna anche se Google è collegato (per abilitare i bottoni "Salva contatto").
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const negozio = (p.get('negozio') ?? '').trim()
  const contatto = (p.get('contatto') ?? '').trim()

  const gestione = (p.get('gestione') ?? '').trim()
  const tipoCliente = (p.get('tipoCliente') ?? '').trim()

  const dove: Prisma.OrdineWhereInput = {}
  if (negozio) dove.negozioId = negozio
  // `ignoto` = gli ordini di cui Orders non sa dire il tipo di cliente: sono
  // quelli senza email, telefono né nome, e vale la pena poterli isolare.
  if (tipoCliente === 'ignoto') dove.clienteTipo = ''
  else if (tipoCliente) dove.clienteTipo = tipoCliente
  if (contatto === 'si') dove.contattoSalvato = true
  if (contatto === 'no') dove.contattoSalvato = false
  // `aperti` = tutto ciò che non è ancora gestito: è la vista di lavoro.
  if (gestione === 'aperti') dove.gestione = { not: 'gestito' }
  else if (gestione) dove.gestione = gestione

  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [
      { numero: testo },
      { clienteNome: testo },
      { telefono: testo },
      { email: testo },
      { indirizzo: testo },
      { negozioNome: testo },
    ]
    // Cercando un numero di telefono, chi scrive spesso usa spazi o il prefisso:
    // confrontiamo anche le sole cifre, così "+39 333 12" trova "+393331234567".
    const cifre = q.replace(/[^\d]/g, '')
    if (cifre.length >= 4) dove.OR.push({ telefono: { contains: cifre } })
  }

  const [ordini, totale, token, negoziDb, gruppi, ultimaSync, esitoSync, importOrders, perTipo] =
    await Promise.all([
    db.ordine.findMany({ where: dove, orderBy: { data: 'desc' }, take: 200 }),
    db.ordine.count({ where: dove }),
    googleAccessToken().catch(() => null),
    db.negozioShopify.findMany({ orderBy: { nome: 'asc' } }),
    // Conteggio e valore per negozio sull'INTERO filtro: sono le intestazioni
    // delle colonne, non devono fermarsi ai 200 mostrati.
    db.ordine.groupBy({
      by: ['negozioId'],
      where: dove,
      _count: { _all: true },
      _sum: { totale: true },
    }),
    // Quando è passato l'ultimo giro automatico: serve a far vedere che il cron
    // dei 15 minuti sta girando (o che si è fermato).
    db.impostazione.findUnique({ where: { chiave: 'ordiniSyncUltimo' } }),
    // Com'è andato l'ultimo giro: se è fallito bisogna dirlo, altrimenti
    // «aggiornati 3 minuti fa» rassicura mentre in realtà non arriva più niente.
    db.impostazione.findUnique({ where: { chiave: 'ordiniSyncEsito' } }),
    // E quando Orders ha scaricato da Shopify: è l'anello a monte della catena.
    ultimoImportOrders(),
    // Da che tipo di cliente arrivano gli ordini del filtro in corso: è la
    // domanda per cui il campo esiste, quindi la risposta la si dà qui.
    db.ordine.groupBy({ by: ['clienteTipo'], where: dove, _count: { _all: true } }),
  ])

  const statistiche = Object.fromEntries(
    gruppi.map((g) => [g.negozioId, { conteggio: g._count._all, valore: g._sum.totale ?? 0 }])
  )

  const negozi = negoziDb.map((n) => ({
    id: n.id,
    nome: n.nome,
    // il brand serve al bottone "Fornitore" (deep link verso Ricerca fornitori)
    brandRicerca: brandRicercaDaNegozio(n.nome, n.dominio, n.brandRicerca),
    conteggio: statistiche[n.id]?.conteggio ?? 0,
    valore: statistiche[n.id]?.valore ?? 0,
  }))

  return NextResponse.json({
    ordini,
    totale, // quanti corrispondono in tutto (la lista è tagliata a 200)
    negozi,
    googleCollegato: !!token,
    ultimaSync: ultimaSync?.valore ?? '',
    // Esito dell'ultimo giro ("ok: 31 ordini…" oppure il messaggio d'errore):
    // un aggiornamento fallito deve vedersi, non nascondersi dietro un orario.
    esitoSync: esitoSync?.valore ?? '',
    // Quando Orders ha scaricato da Shopify: l'anello a monte della catena.
    ultimoImportOrders: importOrders ?? '',
    // { privato: 120, azienda: 8, '': 3 } — '' sono quelli senza tipo noto
    perTipoCliente: Object.fromEntries(perTipo.map((t) => [t.clienteTipo, t._count._all])),
  })
}
