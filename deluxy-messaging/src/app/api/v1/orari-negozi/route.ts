import { NextRequest, NextResponse } from 'next/server'
import { autentica } from '@/lib/api-auth'
import { orariDeiNegozi } from '@/lib/orari-negozi'
import { etichettaFascia, giornoSelezionabile, primoGiornoAperto } from '@/lib/orari-regole'

export const dynamic = 'force-dynamic'

// GET /api/v1/orari-negozi[?dominio=fb72b1-2.myshopify.com][&data=2026-12-25]
//
// ⭐ La CASA degli orari dei negozi è il Customer Service: le altre app (siti,
// Orders, piattaforma) li LEGGONO da qui con la loro chiave, non se ne tengono
// una copia. Per ogni negozio: i giorni aperti, le fasce (con orario minimo e
// massimo, e l'etichetta come la scrivono i siti: «08-12»), le chiusure, e il
// primo giorno in cui si può consegnare. Con `data=` si risponde anche alla
// domanda secca «questa data si può scegliere?», col motivo se no.
//
// ⚠️ `configurato: false` = nessuno ha ancora scritto niente per quel negozio e
// vale il predefinito: chi legge lo sa, e non lo prende per una decisione.
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client
  const dominio = (req.nextUrl.searchParams.get('dominio') ?? '').trim().toLowerCase()
  const data = (req.nextUrl.searchParams.get('data') ?? '').trim()
  const tutti = await orariDeiNegozi()
  const scelti = dominio ? tutti.filter((n) => n.negozio.dominio.toLowerCase() === dominio) : tutti
  if (dominio && !scelti.length) return NextResponse.json({ errore: 'Nessun negozio con questo dominio.' }, { status: 404 })
  return NextResponse.json({
    negozi: scelti.map((n) => ({
      id: n.negozio.id,
      nome: n.negozio.nome,
      dominio: n.negozio.dominio,
      attivo: n.negozio.attivo,
      configurato: n.configurato,
      giorniApertura: n.orario.giorniApertura,
      fasce: n.orario.fasce.map((f) => ({ ...f, etichetta: etichettaFascia(f) })),
      giorniChiusura: n.orario.giorniChiusura,
      primoGiornoAperto: primoGiornoAperto(n.orario),
      ...(data ? { data: { valore: data, ...giornoSelezionabile(n.orario, data) } } : {}),
    })),
  })
}
