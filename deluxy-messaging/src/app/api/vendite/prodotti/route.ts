import { NextRequest, NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { importaPrezziDallaPiattaforma, listaProdotto, righePrezzo, salvaPreventivo } from '@/lib/liste-prodotto'

export const dynamic = 'force-dynamic'

// ⭐ 06/09/2026 sera — LISTE DI PRODOTTO (Vendite → Liste di prodotto).
// GET  ?tipologia=&provincia=&cerca=   → le righe del registro
// GET  ?codice=&provincia=&mestiere=   → la lista di UN prodotto: i partner in ordine di
//                                        priorità, con il prezzo di chi ce l'ha e il vuoto
//                                        di chi non l'ha ancora dato (a lui si telefona)
// POST                                 → importa dalla piattaforma i prezzi già praticati
// PUT  { codice, prodotto, partnerId, partner, prezzo, … } → scrive il PREVENTIVO
// Guardare è di tutti; scrivere e importare è dell'amministratore.

async function admin() {
  const io = await utenteCorrente()
  if (!io) return { errore: NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 }) }
  if (io.ruolo !== 'admin') return { errore: NextResponse.json({ errore: 'Serve un amministratore.' }, { status: 403 }) }
  return { io }
}

export async function GET(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const codice = p.get('codice')?.trim()
  if (codice) {
    const provincia = p.get('provincia')?.trim() ?? ''
    if (!provincia) return NextResponse.json({ errore: 'Serve la provincia: il prezzo di un partner vale dove lavora.' }, { status: 400 })
    return NextResponse.json(await listaProdotto(codice, provincia, p.get('mestiere')?.trim() || undefined))
  }
  return NextResponse.json({
    righe: await righePrezzo({
      tipologia: p.get('tipologia')?.trim() || undefined,
      provincia: p.get('provincia')?.trim() || undefined,
      cerca: p.get('cerca')?.trim() || undefined,
    }),
  })
}

export async function POST(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const provincia = req.nextUrl.searchParams.get('provincia')?.trim() || undefined
  const esito = await importaPrezziDallaPiattaforma(provincia)
  if (esito.errore) return NextResponse.json({ errore: esito.errore, ...esito }, { status: 502 })
  return NextResponse.json({ ...esito, righe: await righePrezzo({}) })
}

export async function PUT(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const body = (await req.json().catch(() => null)) as {
    codice?: string; prodotto?: string; variante?: string; tipologia?: string; mestiere?: string
    provincia?: string; partnerId?: string; partner?: string; prezzo?: number; unita?: string; nota?: string
  } | null
  if (!body?.codice?.trim()) return NextResponse.json({ errore: 'Manca il codice del prodotto.' }, { status: 400 })
  if (!body.partnerId?.trim()) return NextResponse.json({ errore: 'Manca il partner.' }, { status: 400 })
  const prezzo = Number(body.prezzo)
  if (!Number.isFinite(prezzo) || prezzo <= 0) return NextResponse.json({ errore: 'Il preventivo è un prezzo maggiore di zero.' }, { status: 400 })
  const riga = await salvaPreventivo({
    codice: body.codice,
    prodotto: String(body.prodotto ?? body.codice).slice(0, 200),
    variante: body.variante,
    tipologia: body.tipologia,
    mestiere: body.mestiere,
    provincia: body.provincia,
    partnerId: body.partnerId,
    partner: String(body.partner ?? '').slice(0, 120),
    prezzo,
    unita: body.unita,
    nota: body.nota,
    chi: g.io.nome ?? undefined,
  })
  return NextResponse.json({ ok: true, riga })
}
