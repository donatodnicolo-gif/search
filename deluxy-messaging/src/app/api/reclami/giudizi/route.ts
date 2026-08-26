import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  colpaGiudicabile,
  giudizioAutomatico,
  riepilogaReclami,
} from '@/lib/reclami'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I GIUDIZI: aggregano i reclami per soggetto (valet o partner) e, per ognuno,
// calcolano il giudizio automatico. Ci attacchiamo anche il giudizio manuale
// registrato dall'operatore, se c'è.
//
// I nomi dei soggetti sono denormalizzati sul reclamo (colpaNome), quindi non
// serve richiamare Anagrafiche per i partner.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const tipo = (req.nextUrl.searchParams.get('tipo') ?? '').trim() // valet | partner | ''

  const [reclami, manuali] = await Promise.all([
    db.reclamo.findMany({
      where: { colpaTipo: tipo || { in: ['valet', 'partner'] }, colpaId: { not: '' } },
      select: { colpaTipo: true, colpaId: true, colpaNome: true, gravita: true, stato: true },
    }),
    db.giudizio.findMany(),
  ])

  // Raggruppo per soggetto (tipo+id).
  const mappa = new Map<
    string,
    { tipo: string; id: string; nome: string; reclami: { gravita: number; stato: string }[] }
  >()
  for (const r of reclami) {
    if (!colpaGiudicabile(r.colpaTipo)) continue
    const chiave = `${r.colpaTipo}:${r.colpaId}`
    let voce = mappa.get(chiave)
    if (!voce) {
      voce = { tipo: r.colpaTipo, id: r.colpaId, nome: r.colpaNome, reclami: [] }
      mappa.set(chiave, voce)
    }
    // tiene il nome non vuoto più recente incontrato
    if (r.colpaNome) voce.nome = r.colpaNome
    voce.reclami.push({ gravita: r.gravita, stato: r.stato })
  }

  const manualiMappa = new Map(manuali.map((g) => [`${g.soggettoTipo}:${g.soggettoId}`, g]))

  const soggetti = [...mappa.values()].map((v) => {
    const auto = giudizioAutomatico(v.reclami)
    const riepilogo = riepilogaReclami(v.reclami)
    const manuale = manualiMappa.get(`${v.tipo}:${v.id}`)
    return {
      tipo: v.tipo,
      id: v.id,
      nome: v.nome || '(senza nome)',
      punteggio: auto.punteggio,
      fascia: auto.fascia,
      riepilogo,
      manuale: manuale ? { voto: manuale.voto, nota: manuale.nota } : null,
    }
  })

  // Ordino dal più problematico (punteggio alto) al meno.
  soggetti.sort((a, b) => b.punteggio - a.punteggio)
  return NextResponse.json({ soggetti })
}

// Registra o aggiorna il giudizio MANUALE di un soggetto (upsert).
export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    soggettoTipo?: string
    soggettoId?: string
    soggettoNome?: string
    voto?: number
    nota?: string
  }
  const soggettoTipo = (c.soggettoTipo ?? '').trim()
  const soggettoId = (c.soggettoId ?? '').trim()
  if (!colpaGiudicabile(soggettoTipo) || !soggettoId) {
    return NextResponse.json({ errore: 'Soggetto del giudizio non valido.' }, { status: 400 })
  }
  const voto = Math.min(5, Math.max(1, Math.round(Number(c.voto) || 3)))
  const dati = {
    soggettoNome: (c.soggettoNome ?? '').trim(),
    voto,
    nota: (c.nota ?? '').trim(),
  }
  const giudizio = await db.giudizio.upsert({
    where: { soggettoTipo_soggettoId: { soggettoTipo, soggettoId } },
    create: { soggettoTipo, soggettoId, ...dati },
    update: dati,
  })
  return NextResponse.json({ giudizio })
}
