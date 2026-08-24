import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STATI_APERTI, sincronizzaChargeback } from '@/lib/chargeback'
import type { ProveOrdine } from '@/lib/prove-chargeback'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Le contestazioni di pagamento. `?stato=aperti` (di suo) o `tutti`.
export async function GET(req: NextRequest) {
  const stato = (req.nextUrl.searchParams.get('stato') ?? 'aperti').trim()
  const dove = stato === 'tutti' ? {} : { stato: { in: STATI_APERTI } }
  const righe = await db.chargeback.findMany({
    where: dove,
    // Prima chi ha la scadenza più vicina: è l'unico ordinamento che conta
    // quando la posta in gioco è «rispondere entro».
    orderBy: [{ scadenzaProve: 'asc' }],
  })
  const aperti = await db.chargeback.count({ where: { stato: { in: STATI_APERTI } } })
  const soldiAperti = (
    await db.chargeback.findMany({
      where: { stato: { in: STATI_APERTI } },
      select: { importo: true },
    })
  ).reduce((s, r) => s + r.importo, 0)

  // ── CHE COSA ABBIAMO IN MANO ──
  //
  // ⚠️⚠️ La pagina sapeva dire quanto manca alla scadenza e sapeva mandare le
  // prove, ma non se le prove ESISTONO: chi la apriva trovava «da rispondere,
  // 12 giorni» e un riquadro vuoto, e per sapere se c'era qualcosa da opporre
  // doveva cercare ordine, conversazioni e fornitore uno per uno. È il motivo
  // per cui dieci contestazioni erano state perse per 2.087,66 € con le prove
  // mai partite: non per una decisione, ma perché rispondere cominciava con
  // mezz'ora di ricerche.
  //
  // ⚠️ Solo sulle contestazioni APERTE: su una già chiusa sarebbe lavoro per
  // niente, e su una persa sarebbe un rimprovero.
  const daIstruire = righe.filter((r) => STATI_APERTI.includes(r.stato))
  const prove: Record<string, ProveOrdine> = {}
  for (const c of daIstruire) {
    const numero = (c.ordineNumero || '').replace('#', '')
    if (!numero) {
      prove[c.id] = vuota()
      continue
    }
    const o = await db.ordine.findFirst({
      where: { numero: { in: [numero, `#${numero}`] } },
      select: {
        id: true,
        gestione: true,
        gestioneIl: true,
        gestioneDaNome: true,
        fornitoreNome: true,
        fornitoreCosto: true,
        dataConsegna: true,
        fasciaConsegna: true,
        citta: true,
      },
    })
    if (!o) {
      prove[c.id] = vuota()
      continue
    }
    const conv = await db.conversazione.findMany({
      where: { ordineNumero: { in: [numero, `#${numero}`] } },
      select: { ultimoMessaggioIl: true },
      orderBy: { ultimoMessaggioIl: 'desc' },
      take: 50,
    })
    prove[c.id] = {
      trovato: true,
      gestione: o.gestione,
      gestioneIl: o.gestioneIl ? o.gestioneIl.toISOString() : null,
      gestioneDaNome: o.gestioneDaNome,
      fornitoreNome: o.fornitoreNome,
      dataConsegna: o.dataConsegna ? o.dataConsegna.toISOString() : null,
      fasciaConsegna: o.fasciaConsegna ?? '',
      citta: o.citta ?? '',
      conversazioni: conv.length,
      ultimoMessaggioIl: conv[0]?.ultimoMessaggioIl
        ? conv[0].ultimoMessaggioIl.toISOString()
        : null,
      pagatoAlFornitore: o.fornitoreCosto,
    }
  }

  return NextResponse.json({ chargeback: righe, aperti, soldiAperti, prove })
}

/** Quando dell'ordine non sappiamo niente: si dice, non si finge. */
function vuota(): ProveOrdine {
  return {
    trovato: false, gestione: '', gestioneIl: null, gestioneDaNome: '',
    fornitoreNome: '', dataConsegna: null, fasciaConsegna: '', citta: '',
    conversazioni: 0, ultimoMessaggioIl: null, pagatoAlFornitore: null,
  }
}

// Rilegge da Shopify, adesso.
export async function POST() {
  try {
    const esito = await sincronizzaChargeback()
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json(
      { errore: `Non sono riuscito a leggere da Shopify: ${(e as Error).message}` },
      { status: 502 }
    )
  }
}
