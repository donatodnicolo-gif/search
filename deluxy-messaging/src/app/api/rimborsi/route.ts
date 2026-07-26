import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import {
  controllaImporto,
  rimborsoImpegna,
  statoRimborsoValido,
  tipoRimborso,
} from '@/lib/rimborsi'

export const dynamic = 'force-dynamic'

// Le richieste di rimborso. Questa rotta NON rimborsa: registra la richiesta e
// la sua decisione. I soldi li muove una persona (Shopify o banca) e poi si
// segna "eseguito" — come per i pagamenti, nessuna app Deluxy paga da sola.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const stato = (p.get('stato') ?? '').trim()
  const ordineId = (p.get('ordineId') ?? '').trim()

  const dove: Prisma.RimborsoWhereInput = {}
  if (ordineId) dove.ordineId = ordineId
  // `aperti` = da approvare o approvati ma non ancora pagati: la vista di lavoro.
  if (stato === 'aperti') dove.stato = { in: ['richiesto', 'approvato'] }
  else if (stato) dove.stato = stato
  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [
      { ordineNumero: testo },
      { clienteNome: testo },
      { telefono: { contains: q } },
      { motivo: testo },
      { negozioNome: testo },
    ]
  }

  const [rimborsi, totale, perStato, sommaAperti] = await Promise.all([
    db.rimborso.findMany({ where: dove, orderBy: { creatoIl: 'desc' }, take: 300 }),
    db.rimborso.count({ where: dove }),
    db.rimborso.groupBy({ by: ['stato'], _count: { _all: true }, _sum: { importo: true } }),
    db.rimborso.aggregate({
      where: { stato: { in: ['richiesto', 'approvato'] } },
      _sum: { importo: true },
    }),
  ])

  return NextResponse.json({
    rimborsi,
    totale,
    perStato: Object.fromEntries(
      perStato.map((s) => [s.stato, { conteggio: s._count._all, importo: s._sum.importo ?? 0 }])
    ),
    // Quanto denaro è promesso ma non ancora uscito: è il numero che interessa
    // a chi tiene la cassa.
    importoDaPagare: sommaAperti._sum.importo ?? 0,
  })
}

/** Quanto è già impegnato su un ordine, escludendo una richiesta (se si modifica). */
async function giaImpegnato(ordineId: string, ordineNumero: string, escludiId?: string) {
  if (!ordineId && !ordineNumero) return 0
  const altri = await db.rimborso.findMany({
    where: {
      ...(ordineId ? { ordineId } : { ordineNumero }),
      ...(escludiId ? { id: { not: escludiId } } : {}),
    },
    select: { importo: true, stato: true },
  })
  return altri.filter((r) => rimborsoImpegna(r.stato)).reduce((s, r) => s + r.importo, 0)
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    ordineId?: string
    ordineNumero?: string
    negozioNome?: string
    clienteNome?: string
    telefono?: string
    email?: string
    importoOrdine?: number
    importo?: number
    valuta?: string
    motivo?: string
    reclamoId?: string
    stato?: string
    note?: string
    esito?: string
  }

  const ordineNumero = (c.ordineNumero ?? '').trim()
  const ordineId = (c.ordineId ?? '').trim()
  if (!ordineNumero && !ordineId) {
    return NextResponse.json({ errore: 'Serve l’ordine da rimborsare.' }, { status: 400 })
  }
  const motivo = (c.motivo ?? '').trim()
  if (!motivo) {
    // Un rimborso senza motivo scritto è impossibile da difendere dopo:
    // è denaro uscito e nessuno sa più perché.
    return NextResponse.json({ errore: 'Scrivi perché si rimborsa.' }, { status: 400 })
  }

  // Il totale dell'ordine: si prende dal nostro registro quando c'è, così il
  // tetto non dipende da quello che arriva dal browser.
  const ordine = ordineId ? await db.ordine.findUnique({ where: { id: ordineId } }) : null
  const totaleOrdine = ordine?.totale ?? Number(c.importoOrdine) ?? 0
  const valuta = ordine?.valuta || c.valuta || 'EUR'

  const importo = Number(c.importo)
  const impegnato = await giaImpegnato(ordineId, ordineNumero, c.id)
  const controllo = controllaImporto(importo, totaleOrdine, impegnato)
  if (!controllo.ok) return NextResponse.json({ errore: controllo.errore }, { status: 400 })

  const stato = statoRimborsoValido((c.stato ?? '').trim()) ? (c.stato as string).trim() : 'richiesto'
  const utente = await utenteCorrente()

  const dati = {
    ordineId,
    ordineNumero,
    negozioNome: (c.negozioNome ?? ordine?.negozioNome ?? '').trim(),
    clienteNome: (c.clienteNome ?? ordine?.clienteNome ?? '').trim(),
    telefono: (c.telefono ?? ordine?.telefono ?? '').trim(),
    email: (c.email ?? ordine?.email ?? '').trim(),
    importoOrdine: totaleOrdine,
    importo,
    valuta,
    tipo: tipoRimborso(importo, totaleOrdine),
    motivo,
    reclamoId: (c.reclamoId ?? '').trim(),
    stato,
    note: (c.note ?? '').trim(),
    esito: (c.esito ?? '').trim(),
  }

  const rimborso = c.id
    ? await db.rimborso.update({ where: { id: c.id }, data: dati })
    : await db.rimborso.create({ data: { ...dati, richiestoDa: utente?.nome ?? '' } })
  return NextResponse.json({ rimborso })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.rimborso.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
