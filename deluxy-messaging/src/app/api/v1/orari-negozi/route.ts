import { NextRequest, NextResponse } from 'next/server'
import { autentica } from '@/lib/api-auth'
import { orariDeiNegozi } from '@/lib/orari-negozi'
import { adessoRoma, calendarioConsegna, fasceDelGiorno, primoGiornoAperto } from '@/lib/orari-regole'

export const dynamic = 'force-dynamic'

// GET /api/v1/orari-negozi[?dominio=fb72b1-2.myshopify.com][&data=2026-12-25][&giorni=14]
//
// ⭐ La CASA degli orari dei negozi è il Customer Service: le altre app (Orders,
// piattaforma, CRM) li LEGGONO da qui con la loro chiave, non se ne tengono una
// copia. Per ogni negozio: i giorni aperti, le REGOLE delle fasce (finestra,
// durate, salto, ora limite), le chiusure, il primo giorno in cui si può
// consegnare e il calendario dei prossimi `giorni` (14) con le fasce calcolate
// ADESSO (ora italiana). Con `data=` la risposta secca su quella data: si può
// scegliere, con quali fasce, o perché no.
//
// ⚠️ `configurato: false` = nessuno ha ancora scritto niente per quel negozio:
// nessuna regola vale, e chi legge lo sa. (I SITI Shopify usano invece la rotta
// pubblica /api/pubblico/consegna, senza chiave, dal browser del cliente.)
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client
  const p = req.nextUrl.searchParams
  const dominio = (p.get('dominio') ?? '').trim().toLowerCase()
  const data = (p.get('data') ?? '').trim()
  const giorniN = Math.min(366, Math.max(1, Number(p.get('giorni')) || 14))
  const tutti = await orariDeiNegozi()
  const scelti = dominio ? tutti.filter((n) => n.negozio.dominio.toLowerCase() === dominio) : tutti
  if (dominio && !scelti.length) return NextResponse.json({ errore: 'Nessun negozio con questo dominio.' }, { status: 404 })
  const adesso = adessoRoma()
  return NextResponse.json({
    adesso,
    negozi: scelti.map((n) => ({
      id: n.negozio.id,
      nome: n.negozio.nome,
      dominio: n.negozio.dominio,
      attivo: n.negozio.attivo,
      configurato: n.configurato,
      giorniApertura: n.orario.giorniApertura,
      regole: n.orario.regole,
      giorniChiusura: n.orario.giorniChiusura,
      primoGiornoAperto: n.configurato ? primoGiornoAperto(n.orario, adesso.data) : null,
      calendario: n.configurato ? calendarioConsegna(n.orario, adesso, {}, giorniN).map((g) => ({ data: g.data, quando: g.quando, ok: g.ok, motivo: g.motivo, fasce: g.etichette })) : [],
      ...(data && n.configurato ? { data: (({ data: d, ok, motivo, etichette, quando }) => ({ valore: d, ok, motivo, fasce: etichette, quando }))(fasceDelGiorno(n.orario, data, adesso)) } : {}),
    })),
  })
}
