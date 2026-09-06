import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listaEscluse } from '@/lib/dettaglio-ordine'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// SCOLLEGA una consegna della piattaforma da quest'ordine (utente, 06/09/2026:
// «1834 ha un'associazione all'app delivery sbagliata»).
//
//   POST /api/ordini/<id>/scollega-consegna   { consegnaId: "…" }
//
// ⚠️ Non tocca la piattaforma: la consegna di là resta com'è, appartiene a
// un altro ordine. Qui si toglie l'aggancio (se era questa) e si segna l'id
// fra le escluse, così la lettura per DDT non la ripropone al prossimo giro.
export async function POST(req: NextRequest, { params }: Params) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const corpo = (await req.json().catch(() => ({}))) as { consegnaId?: string }
  const consegnaId = (corpo.consegnaId ?? '').trim()
  if (!consegnaId) return NextResponse.json({ errore: 'Manca la consegna da scollegare.' }, { status: 400 })
  const o = await db.ordine.findUnique({
    where: { id },
    select: { id: true, appConsegnaId: true, appConsegneEscluse: true },
  })
  if (!o) return NextResponse.json({ errore: 'Ordine non trovato.' }, { status: 404 })

  const escluse = new Set(listaEscluse(o.appConsegneEscluse))
  escluse.add(consegnaId)
  const eraAgganciata = o.appConsegnaId === consegnaId
  await db.ordine.update({
    where: { id: o.id },
    data: {
      appConsegneEscluse: [...escluse].join('\n'),
      ...(eraAgganciata
        ? { appConsegnaId: '', appConsegnaNumero: '', appConsegnaStato: '', appConsegnaData: null, appConsegnaFascia: '' }
        : {}),
    },
  })
  return NextResponse.json({
    ok: true,
    eraAgganciata,
    messaggio: eraAgganciata
      ? 'Consegna scollegata: non è più agganciata a quest ordine. Il passo di lavorazione resta quello che è — cambialo tu se serve.'
      : 'Consegna scollegata: non compare più su quest ordine.',
  })
}
