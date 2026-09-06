import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PROVINCE, siglaProvincia } from '@/lib/province'
import { utenteCorrente } from '@/lib/sessione'
import { SCONTI_PREDEFINITI, scontoTerritorio } from '@/lib/vendite'

export const dynamic = 'force-dynamic'

// Gli SCONTI PER PROVINCIA (Vendite → Sconti). Lettura per tutti gli operatori,
// scrittura per l'amministratore: il cancello sta qui, non nel menu.
async function admin() {
  const io = await utenteCorrente()
  if (!io) return { errore: NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 }) }
  if (io.ruolo !== 'admin') return { errore: NextResponse.json({ errore: 'Serve un amministratore.' }, { status: 403 }) }
  return { io }
}

export async function GET() {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const righe = await db.scontoProvincia.findMany()
  const perSigla = new Map(righe.map((r) => [r.provincia, r]))
  const sigle = Object.keys(PROVINCE).sort()
  return NextResponse.json({
    predefiniti: SCONTI_PREDEFINITI,
    province: sigle.map((s) => {
      const r = perSigla.get(s)
      return {
        provincia: s,
        nome: PROVINCE[s],
        conPartner: r?.conPartner ?? null,
        senzaPartner: r?.senzaPartner ?? null,
        predefinitoConPartner: scontoTerritorio(s, true).sconto,
        predefinitoSenzaPartner: scontoTerritorio(s, false).sconto,
        nota: r?.nota ?? '',
        aggiornatoIl: r?.aggiornatoIl ?? null,
      }
    }),
  })
}

// PUT { provincia, conPartner: number|null, senzaPartner: number|null, nota }
// null = torna al predefinito (la riga si cancella se resta vuota).
export async function PUT(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const body = (await req.json().catch(() => null)) as { provincia?: string; conPartner?: number | null; senzaPartner?: number | null; nota?: string } | null
  const sigla = siglaProvincia(body?.provincia ?? '')
  if (!sigla) return NextResponse.json({ errore: 'Provincia non riconosciuta.' }, { status: 400 })
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
  const con = num(body?.conPartner)
  const senza = num(body?.senzaPartner)
  for (const v of [con, senza]) if (v !== null && !(Number.isFinite(v) && v >= 0 && v <= 100)) return NextResponse.json({ errore: 'Lo sconto è una percentuale fra 0 e 100.' }, { status: 400 })
  const nota = (body?.nota ?? '').trim().slice(0, 300)
  if (con === null && senza === null && !nota) {
    await db.scontoProvincia.deleteMany({ where: { provincia: sigla } })
    return NextResponse.json({ ok: true, provincia: sigla, tornataAlPredefinito: true })
  }
  const riga = await db.scontoProvincia.upsert({
    where: { provincia: sigla },
    create: { provincia: sigla, conPartner: con, senzaPartner: senza, nota, modificatoDa: g.io.nome ?? null },
    update: { conPartner: con, senzaPartner: senza, nota, modificatoDa: g.io.nome ?? null },
  })
  return NextResponse.json({ ok: true, riga })
}
