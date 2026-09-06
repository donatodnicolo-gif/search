import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { importaListeDallaPiattaforma, listeArea } from '@/lib/vendite'

export const dynamic = 'force-dynamic'

// Le LISTE DI PRIORITÀ PER AREA COMMERCIALE (Vendite → Liste).
// GET: tutte. POST: importa dalla piattaforma (le modificate a mano restano).
// PUT { id, partner: [{id, insegna}] }: riordina/toglie/aggiunge; PUT { id, ripristina: true }
// torna alla prossima importazione. Scrittura solo per l'amministratore.
async function admin() {
  const io = await utenteCorrente()
  if (!io) return { errore: NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 }) }
  if (io.ruolo !== 'admin') return { errore: NextResponse.json({ errore: 'Serve un amministratore.' }, { status: 403 }) }
  return { io }
}

export async function GET() {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  return NextResponse.json({ liste: await listeArea() })
}

export async function POST() {
  const g = await admin()
  if ('errore' in g) return g.errore
  const esito = await importaListeDallaPiattaforma()
  if (esito.errore) return NextResponse.json({ errore: esito.errore, ...esito }, { status: 502 })
  return NextResponse.json({ ...esito, liste: await listeArea() })
}

export async function PUT(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const body = (await req.json().catch(() => null)) as { id?: string; partner?: { id: string; insegna: string }[]; ripristina?: boolean } | null
  if (!body?.id) return NextResponse.json({ errore: 'Manca la lista.' }, { status: 400 })
  const gia = await db.listaPrioritaArea.findUnique({ where: { id: body.id } })
  if (!gia) return NextResponse.json({ errore: 'Lista non trovata.' }, { status: 404 })
  if (body.ripristina) {
    await db.listaPrioritaArea.update({ where: { id: gia.id }, data: { modificataIl: null, modificataDa: null } })
    return NextResponse.json({ ok: true, liste: await listeArea() })
  }
  if (!Array.isArray(body.partner)) return NextResponse.json({ errore: 'Manca l\'elenco dei partner.' }, { status: 400 })
  const visti = new Set<string>()
  const puliti = body.partner.filter((p) => p && typeof p.id === 'string' && !visti.has(p.id) && visti.add(p.id)).map((p) => ({ id: p.id, insegna: String(p.insegna ?? '').slice(0, 120) }))
  await db.listaPrioritaArea.update({ where: { id: gia.id }, data: { partner: JSON.stringify(puliti), modificataIl: new Date(), modificataDa: g.io.nome ?? null } })
  return NextResponse.json({ ok: true, liste: await listeArea() })
}
