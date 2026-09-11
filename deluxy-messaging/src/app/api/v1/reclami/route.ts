import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { autentica } from '@/lib/api-auth'
import { codaTelefono, etichetteReclami, reclamoPubblico } from '@/lib/reclami-api'
import { intervalloPeriodo, periodoValido } from '@/lib/periodo'

export const dynamic = 'force-dynamic'

// ⭐ I RECLAMI, DETTI ALLE ALTRE APP (11/09/2026, utente dal CRM: «aggiungi
// sezione reclami all'app e fatti passare i reclami dall'app customer
// service»). La casa del reclamo è QUI: si apre, si lavora e si chiude nel
// Customer Service. Le altre app lo LEGGONO — nessuna copia, nessun conteggio
// rifatto in casa (Standard §7).
//
//   GET /api/v1/reclami
//     cliente   email o telefono della persona (è il filtro del CRM: «i
//               reclami di questo cliente»). Il telefono si confronta sulle
//               ultime 9 cifre, così +39 347… e 0347… sono la stessa persona.
//     ordine    numero dell'ordine (#1234 o 1234)
//     stato     aperti | aperto | in_lavorazione | risolto | chiuso
//     colpa     valet | partner | azienda | cliente | nessuno
//     gravita   1 | 2 | 3
//     q         testo su ordine, cliente, casistica, colpa, negozio, descrizione
//     periodo   mese | scorso | trimestre | anno (sulla data di apertura)
//     page      1… (limit 1-200, default 50)
//
//   → { reclami, totale, page, limit, pagine, perStato, etichette }
//
// `domandeAperte` per reclamo viaggia con la riga: un reclamo fermo perché
// aspetta la risposta di qualcuno si vede senza aprire la scheda.
// Sola lettura: un reclamo non si apre da fuori. Chi legge ha il link alla
// scheda vera (`link`), dove si lavora.
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const p = req.nextUrl.searchParams
  const cliente = (p.get('cliente') ?? '').trim()
  const ordine = (p.get('ordine') ?? '').trim().replace(/^#/, '')
  const stato = (p.get('stato') ?? '').trim()
  const colpa = (p.get('colpa') ?? '').trim()
  const gravita = Number(p.get('gravita') ?? '')
  const q = (p.get('q') ?? '').trim()
  const page = Math.max(1, Number(p.get('page')) || 1)
  const limit = Math.min(200, Math.max(1, Number(p.get('limit')) || 50))

  const dove: Prisma.ReclamoWhereInput = {}
  const e: Prisma.ReclamoWhereInput[] = []

  // Il CLIENTE: email uguale (senza badare a maiuscole) o telefono che finisce
  // come il suo. ⚠️ Un `cliente=` che non assomiglia né a un'email né a un
  // telefono non deve tornare TUTTI i reclami: meglio zero che i reclami di
  // altri dentro la scheda di questa persona.
  if (cliente) {
    const oppure: Prisma.ReclamoWhereInput[] = []
    if (cliente.includes('@')) oppure.push({ email: { equals: cliente, mode: 'insensitive' } })
    const coda = codaTelefono(cliente)
    if (coda.length >= 6) oppure.push({ telefono: { contains: coda } })
    if (!oppure.length) {
      return NextResponse.json(
        { reclami: [], totale: 0, page, limit, pagine: 0, perStato: {}, etichette: etichetteReclami() },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
    e.push({ OR: oppure })
  }
  if (ordine) e.push({ ordineNumero: { contains: ordine, mode: 'insensitive' } })
  if (stato === 'aperti') dove.stato = { in: ['aperto', 'in_lavorazione'] }
  else if (stato) dove.stato = stato
  if (colpa) dove.colpaTipo = colpa
  if (gravita === 1 || gravita === 2 || gravita === 3) dove.gravita = gravita
  const intervallo = intervalloPeriodo(periodoValido(p.get('periodo')))
  if (intervallo) dove.creatoIl = { gte: intervallo.da, lt: intervallo.a }
  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    e.push({
      OR: [
        { ordineNumero: testo },
        { clienteNome: testo },
        { telefono: { contains: q } },
        { casistica: testo },
        { colpaNome: testo },
        { negozioNome: testo },
        { descrizione: testo },
      ],
    })
  }
  if (e.length) dove.AND = e

  const [righe, totale, conteggi] = await Promise.all([
    db.reclamo.findMany({ where: dove, orderBy: { creatoIl: 'desc' }, skip: (page - 1) * limit, take: limit }),
    db.reclamo.count({ where: dove }),
    // I conteggi per stato sullo STESSO filtro dell'elenco: un numero in cima
    // che contasse altro non si potrebbe usare per decidere niente.
    db.reclamo.groupBy({ by: ['stato'], where: dove, _count: { _all: true } }),
  ])

  // Le domande ancora senza risposta, per i reclami di questa pagina.
  const ids = righe.map((r) => r.id)
  const messaggi = ids.length
    ? await db.messaggioReclamo.findMany({
        where: { reclamoId: { in: ids } },
        select: { id: true, reclamoId: true, domanda: true, rispostaA: true },
      })
    : []
  const risposte = new Set(messaggi.map((m) => m.rispostaA).filter(Boolean))
  const domande: Record<string, number> = {}
  for (const m of messaggi) {
    if (!m.domanda || risposte.has(m.id)) continue
    domande[m.reclamoId] = (domande[m.reclamoId] ?? 0) + 1
  }

  return NextResponse.json(
    {
      reclami: righe.map((r) => reclamoPubblico(r, domande[r.id] ?? 0)),
      totale,
      page,
      limit,
      pagine: Math.ceil(totale / limit),
      perStato: Object.fromEntries(conteggi.map((c) => [c.stato, c._count._all])),
      etichette: etichetteReclami(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
