import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { autentica } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/v1/feedback — quello che il Customer Service sa degli ORDINI, per le
// altre app (oggi: il registro Orders, che lo mostra sull'ordine e sul cliente).
//
// Escono due cose diverse, e restano distinte perché non valgono uguale:
//  - `reclami`: un problema aperto su un ordine (casistica, colpa, gravità,
//    stato, esito). È un fatto operativo.
//  - `voti`: il giudizio 1-5 di una persona su un valet o un partner, quando è
//    legato a un ordine. È un'opinione, e senza numero d'ordine non esce di qui
//    (a un registro di ordini non serve un voto che non sa dove attaccare).
//
// Parametri:
//   da     ISO (facoltativo) — solo ciò che è cambiato da allora: è l'import
//          incrementale. Sui reclami guarda l'ultima modifica, sui voti la
//          creazione (un voto non si modifica).
//   page   1.. (default 1) · limit 1..500 (default 200)
//
// Le due liste sono paginate INDIPENDENTEMENTE con gli stessi page/limit:
// `pagine` è il massimo delle due, così chi importa cicla finché page < pagine.
//
// SOLA LETTURA: da qui non si aprono né si chiudono reclami. Un reclamo nasce
// dove c'è la persona che ha parlato col cliente, non in un'app a valle.
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const p = req.nextUrl.searchParams
  const daTesto = p.get('da')?.trim()
  const da = daTesto ? new Date(daTesto) : null
  if (da && Number.isNaN(da.getTime())) {
    return NextResponse.json({ errore: `Data "da" non valida: ${daTesto}` }, { status: 400 })
  }
  const page = Math.max(1, Number(p.get('page') ?? '1') || 1)
  const limit = Math.min(500, Math.max(1, Number(p.get('limit') ?? '200') || 200))
  const salta = (page - 1) * limit

  const doveReclami: Prisma.ReclamoWhereInput = da ? { aggiornatoIl: { gte: da } } : {}
  // Un voto senza ordine non serve a un registro di ordini: si esclude qui,
  // invece di farlo scartare a valle senza che nessuno sappia perché.
  const doveVoti: Prisma.FeedbackWhereInput = {
    ordineNumero: { not: '' },
    ...(da ? { creatoIl: { gte: da } } : {}),
  }

  const [reclami, totaleReclami, voti, totaleVoti] = await Promise.all([
    db.reclamo.findMany({ where: doveReclami, orderBy: { aggiornatoIl: 'asc' }, skip: salta, take: limit }),
    db.reclamo.count({ where: doveReclami }),
    db.feedback.findMany({ where: doveVoti, orderBy: { creatoIl: 'asc' }, skip: salta, take: limit }),
    db.feedback.count({ where: doveVoti }),
  ])

  const pagine = Math.max(
    1,
    Math.ceil(totaleReclami / limit),
    Math.ceil(totaleVoti / limit),
  )

  return NextResponse.json({
    page,
    limit,
    pagine,
    totali: { reclami: totaleReclami, voti: totaleVoti },
    reclami: reclami.map((r) => ({
      id: r.id,
      ordine: { id: r.ordineId || null, numero: r.ordineNumero, negozio: r.negozioNome },
      cliente: { nome: r.clienteNome, email: r.email, telefono: r.telefono },
      casistica: r.casistica, // nome denormalizzato sul reclamo
      casisticaId: r.casisticaId,
      colpaTipo: r.colpaTipo,
      colpaNome: r.colpaNome,
      gravita: r.gravita, // 1 lieve · 2 media · 3 grave
      stato: r.stato, // aperto | in_lavorazione | risolto | chiuso
      descrizione: r.descrizione,
      azioni: r.azioni,
      esito: r.esito,
      risoltoIl: r.risoltoIl,
      creatoIl: r.creatoIl,
      aggiornatoIl: r.aggiornatoIl,
    })),
    voti: voti.map((f) => ({
      id: f.id,
      ordine: { id: null, numero: f.ordineNumero, negozio: '' },
      cliente: { nome: f.clienteNome, email: '', telefono: '' },
      voto: f.voto, // 1 pessimo … 5 ottimo
      testo: f.testo,
      origine: f.origine, // telefono | whatsapp | email | reclamo | altro
      soggettoTipo: f.soggettoTipo, // valet | partner
      soggettoNome: f.soggettoNome,
      creatoIl: f.creatoIl,
      aggiornatoIl: f.creatoIl, // un voto non si modifica: vale la creazione
    })),
  })
}
