import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Ordini di un mese per DATA DI CONSEGNA (non data d'ordine): è la domanda
// operativa del calendario — cosa esce, e in che giorno.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const mese = (p.get('mese') ?? '').trim() // YYYY-MM
  const negozio = (p.get('negozio') ?? '').trim()

  const oggi = new Date()
  const [anno, m] = mese.match(/^\d{4}-\d{2}$/)
    ? mese.split('-').map(Number)
    : [oggi.getFullYear(), oggi.getMonth() + 1]

  // Due modi di guardare le consegne:
  //  - "agenda": da OGGI in avanti (quello che serve tutti i giorni)
  //  - mese: gli estremi del mese richiesto (visione d'insieme)
  const giorni = Number(p.get('giorni') ?? 0)
  const daOggi = giorni > 0

  // La consegna è salvata a mezzanotte UTC.
  const dal = daOggi
    ? new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate(), 0, 0, 0))
    : new Date(Date.UTC(anno, m - 1, 1, 0, 0, 0))
  const al = daOggi
    ? new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + giorni, 23, 59, 59))
    : new Date(Date.UTC(anno, m, 0, 23, 59, 59))

  const dove: Prisma.OrdineWhereInput = { dataConsegna: { gte: dal, lte: al } }
  if (negozio) dove.negozioId = negozio

  const [ordini, negozi, senzaData] = await Promise.all([
    db.ordine.findMany({
      where: dove,
      orderBy: [{ dataConsegna: 'asc' }, { fasciaConsegna: 'asc' }],
      select: {
        id: true,
        numero: true,
        negozioNome: true,
        clienteNome: true,
        citta: true,
        totale: true,
        valuta: true,
        dataConsegna: true,
        fasciaConsegna: true,
        statoChiave: true,
        statoNome: true,
        statoColore: true,
        // ── COME LO STIAMO LAVORANDO NOI ──
        //
        // ⚠️⚠️ È una cosa DIVERSA dallo stato che c'era già (`statoNome`), che
        // viene dalla pipeline di Orders/Shopify. Quello dice a che punto è
        // l'ordine per il negozio; questo dice a che punto siamo NOI: se
        // abbiamo trovato il fornitore, se l'abbiamo pagato, se è chiuso. Su un
        // calendario di consegne è la seconda la domanda vera — «cosa esce
        // giovedì, e cosa mi manca ancora da fare».
        gestione: true,
        gestioneDaNome: true,
        // Chi lo prepara: su una consegna imminente senza fornitore, è la cosa
        // che va vista senza aprire l'ordine.
        fornitoreNome: true,
      },
    }),
    db.negozioShopify.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    // quanti ordini non hanno una data di consegna: vanno detti, non nascosti
    db.ordine.count({ where: { dataConsegna: null } }),
  ])

  // ── QUALI ORDINI RISULTANO PAGATI ──
  // Una query per tutto il mese, non una per ordine.
  const pagati = new Set<string>()
  try {
    const righe = await db.richiestaPagamento.findMany({
      where: {
        pagataIl: { not: null },
        ordineNumero: { in: ordini.map((o) => o.numero).filter(Boolean) },
      },
      select: { ordineNumero: true },
    })
    for (const r of righe) pagati.add(r.ordineNumero)
  } catch {
    // ⚠️ Contorno: se fallisce, il calendario si apre lo stesso senza i bollini.
  }

  // Legenda: gli stati presenti nel mese, col loro colore.
  // ⚠️ La legenda della GESTIONE, accanto a quella degli stati Shopify: serve a
  // rispondere «quanti ordini di questo mese non ho ancora lavorato?» senza
  // contarli a occhio.
  const gestioni = new Map<string, number>()
  for (const o of ordini) gestioni.set(o.gestione || 'da_gestire', (gestioni.get(o.gestione || 'da_gestire') ?? 0) + 1)

  const stati = new Map<string, { chiave: string; nome: string; colore: string; quanti: number }>()
  for (const o of ordini) {
    const chiave = o.statoChiave || 'senza-stato'
    const gia = stati.get(chiave)
    if (gia) gia.quanti++
    else
      stati.set(chiave, {
        chiave,
        nome: o.statoNome || 'Senza stato',
        colore: o.statoColore || '#6e6e73',
        quanti: 1,
      })
  }

  return NextResponse.json({
    mese: `${anno}-${String(m).padStart(2, '0')}`,
    ordini: ordini.map((o) => ({
      ...o,
      giorno: o.dataConsegna ? o.dataConsegna.toISOString().slice(0, 10) : '',
      pagato: pagati.has(o.numero),
    })),
    stati: [...stati.values()].sort((a, b) => b.quanti - a.quanti),
    gestioni: [...gestioni.entries()].map(([chiave, quanti]) => ({ chiave, quanti })),
    negozi,
    senzaData,
  })
}
