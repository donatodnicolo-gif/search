import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  statoReclamoValido,
  colpaValida,
  gravitaValida,
  reclamoAperto,
} from '@/lib/reclami'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I reclami, con ricerca e filtri:
//   q       testo su ordine, cliente, telefono, casistica, colpa
//   stato   aperti | aperto | in_lavorazione | risolto | chiuso
//   colpa   valet | partner | azienda | cliente | nessuno
//   gravita 1 | 2 | 3
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const stato = (p.get('stato') ?? '').trim()
  const colpa = (p.get('colpa') ?? '').trim()
  const gravita = (p.get('gravita') ?? '').trim()
  /** 'aperte' = solo i reclami che hanno almeno una domanda senza risposta. */
  const domande = (p.get('domande') ?? '').trim()

  const dove: Prisma.ReclamoWhereInput = {}
  // `aperti` = tutto ciò che non è ancora chiuso/risolto: la vista di lavoro.
  if (stato === 'aperti') dove.stato = { in: ['aperto', 'in_lavorazione'] }
  else if (stato) dove.stato = stato
  if (colpa) dove.colpaTipo = colpa
  if (gravita) dove.gravita = Number(gravita)
  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [
      { ordineNumero: testo },
      { clienteNome: testo },
      { telefono: { contains: q } },
      { casistica: testo },
      { colpaNome: testo },
      { negozioNome: testo },
      { descrizione: testo },
    ]
  }

  // ── LE DOMANDE APERTE, SU TUTTO L'ARCHIVIO ──
  //
  // ⚠️⚠️ Si contano su TUTTI i reclami e non su quelli filtrati, come i
  // conteggi per stato qui sotto: una domanda che aspetta risposta su un
  // reclamo «chiuso» aspetta lo stesso, e un numero che cambia insieme ai
  // filtri non si può usare per decidere se c'è qualcosa da sbloccare.
  //
  // ⚠️ Due query piccole invece di caricare tutti i messaggi: le domande, e gli
  // id di quelle a cui qualcuno ha già risposto.
  const [domandeTutte, risposteTutte] = await Promise.all([
    db.messaggioReclamo.findMany({ where: { domanda: true }, select: { id: true, reclamoId: true } }),
    db.messaggioReclamo.findMany({ where: { NOT: { rispostaA: '' } }, select: { rispostaA: true } }),
  ])
  const rispostoA = new Set(risposteTutte.map((r) => r.rispostaA))
  const domandeSenzaRisposta = domandeTutte.filter((d) => !rispostoA.has(d.id))
  const reclamiConDomande = [...new Set(domandeSenzaRisposta.map((d) => d.reclamoId))]

  // ⚠️ Il filtro NON è un altro modo di contare: restringe l'elenco agli stessi
  // reclami che il numero in cima dichiara. Se i due divergessero, il numero
  // smetterebbe di voler dire qualcosa.
  if (domande === 'aperte') dove.id = { in: reclamiConDomande }

  const [reclami, totale, conteggi] = await Promise.all([
    db.reclamo.findMany({ where: dove, orderBy: { creatoIl: 'desc' }, take: 300 }),
    db.reclamo.count({ where: dove }),
    // Conteggi per stato sull'INTERO archivio (non solo il filtro): reggono i KPI.
    db.reclamo.groupBy({ by: ['stato'], _count: { _all: true } }),
  ])

  const perStato = Object.fromEntries(conteggi.map((c) => [c.stato, c._count._all]))

  // ── LE DOMANDE ANCORA SENZA RISPOSTA, per ogni reclamo ──
  //
  // ⚠️⚠️ Sta nell'ELENCO e non solo dentro la scheda perché è la cosa che
  // aspetta qualcuno: un reclamo con una domanda aperta non è fermo per
  // pigrizia, dipende da un altro — e chi guarda la lista deve poterlo vedere
  // senza aprire sei schede una per una.
  //
  // ⚠️ Due query e non una per riga: l'elenco arriva a 300.
  const ids = reclami.map((r) => r.id)
  const messaggi = ids.length
    ? await db.messaggioReclamo.findMany({
        where: { reclamoId: { in: ids } },
        select: { id: true, reclamoId: true, domanda: true, rispostaA: true },
      })
    : []
  const risposte = new Set(messaggi.map((m) => m.rispostaA).filter(Boolean))
  const domandeAperte: Record<string, number> = {}
  for (const m of messaggi) {
    if (!m.domanda || risposte.has(m.id)) continue
    domandeAperte[m.reclamoId] = (domandeAperte[m.reclamoId] ?? 0) + 1
  }

  return NextResponse.json({
    reclami,
    totale,
    perStato,
    domandeAperte,
    // Quante domande aspettano una risposta, e su quanti reclami: il primo
    // numero è il lavoro, il secondo è quante persone bisogna andare a cercare.
    domandeAperteTotali: {
      domande: domandeSenzaRisposta.length,
      reclami: reclamiConDomande.length,
    },
  })
}

// Crea o aggiorna un reclamo. Il cambio di stato passa da qui o dalla rotta
// dedicata /api/reclami/[id]/stato.
export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    ordineId?: string
    ordineNumero?: string
    negozioNome?: string
    clienteNome?: string
    telefono?: string
    email?: string
    casisticaId?: string
    casistica?: string
    colpaTipo?: string
    colpaId?: string
    colpaNome?: string
    gravita?: number
    descrizione?: string
    azioni?: string
    stato?: string
    esito?: string
  }

  const casistica = (c.casistica ?? '').trim()
  if (!casistica) {
    return NextResponse.json({ errore: 'Scegli una casistica per il reclamo.' }, { status: 400 })
  }

  const colpaTipo = colpaValida((c.colpaTipo ?? '').trim()) ? (c.colpaTipo as string).trim() : 'nessuno'
  const gravita = gravitaValida(Number(c.gravita)) ? Number(c.gravita) : 2
  const stato = statoReclamoValido((c.stato ?? '').trim()) ? (c.stato as string).trim() : 'aperto'

  const dati = {
    ordineId: (c.ordineId ?? '').trim(),
    ordineNumero: (c.ordineNumero ?? '').trim(),
    negozioNome: (c.negozioNome ?? '').trim(),
    clienteNome: (c.clienteNome ?? '').trim(),
    telefono: (c.telefono ?? '').trim(),
    email: (c.email ?? '').trim(),
    casisticaId: (c.casisticaId ?? '').trim(),
    casistica,
    colpaTipo,
    // La colpa ha senso solo se è un soggetto identificabile: altrimenti azzero.
    colpaId: colpaTipo === 'nessuno' ? '' : (c.colpaId ?? '').trim(),
    colpaNome: colpaTipo === 'nessuno' ? '' : (c.colpaNome ?? '').trim(),
    gravita,
    descrizione: (c.descrizione ?? '').trim(),
    azioni: (c.azioni ?? '').trim(),
    stato,
    esito: (c.esito ?? '').trim(),
    // Marca la data di risoluzione quando entra in uno stato chiuso.
    risoltoIl: reclamoAperto(stato) ? null : new Date(),
  }

  const reclamo = c.id
    ? await db.reclamo.update({ where: { id: c.id }, data: dati })
    : await db.reclamo.create({ data: dati })
  return NextResponse.json({ reclamo })
}

export async function DELETE(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.reclamo.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
