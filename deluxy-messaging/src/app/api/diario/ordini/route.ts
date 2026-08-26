import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { formeNumero } from '@/lib/diario'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Gli ordini ancora aperti, da suggerire sopra il diario.
//
// ⚠️ Servono a NON far ricordare il numero a memoria: chi scrive il diario ha
// in testa «quello di Bolzano», non «#12562». Con l'elenco davanti si clicca e
// si scrive la riga.
//
// ⚠️ Ogni ordine porta quante righe di diario ha già: così si vede a colpo
// d'occhio **quali sono scoperti**, che è la domanda vera quando si apre il
// quaderno la mattina.
export async function GET() {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const ordini = await db.ordine.findMany({
    where: { gestione: { not: 'gestito' } },
    select: {
      numero: true,
      clienteNome: true,
      negozioNome: true,
      dataConsegna: true,
      fasciaConsegna: true,
      gestione: true,
    },
    // Si prende un lotto ampio e si ordina qui sotto: l'ordine che serve non è
    // «per data crescente» (metterebbe in cima le consegne scadute da mesi).
    orderBy: [{ dataConsegna: 'asc' }],
    take: 200,
  })

  // ⚠️ L'ordine giusto è **quello del lavoro di oggi**: prima le consegne da
  // qui in avanti (oggi, domani, dopo), poi quelle senza data, e in fondo le
  // scadute — che sono lavoro vecchio, non lavoro urgente. Con 484 ordini
  // aperti, mettere in cima le scadute da due mesi vorrebbe dire una striscia
  // di suggerimenti che non si guarda.
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  const rango = (d: Date | null) => {
    if (!d) return 1 // senza data: in mezzo
    return d.getTime() >= oggi.getTime() ? 0 : 2
  }
  ordini.sort((x, y) => {
    const r = rango(x.dataConsegna) - rango(y.dataConsegna)
    if (r !== 0) return r
    const dx = x.dataConsegna?.getTime() ?? 0
    const dy = y.dataConsegna?.getTime() ?? 0
    // Dentro lo stesso gruppo: le consegne più vicine prima, le scadute dalla
    // più recente (quella di ieri si recupera, quella di marzo no).
    return rango(x.dataConsegna) === 2 ? dy - dx : dx - dy
  })
  // ⚠️ Ventiquattro e non tutti: è una striscia di suggerimenti, non l'elenco
  // degli ordini — quello è la bacheca, e sta a un clic di distanza.
  ordini.splice(24)

  // Le note aperte per ciascuno, in una query sola.
  const numeri = ordini.flatMap((o) => formeNumero(o.numero))
  const note = numeri.length
    ? await db.notaDiario.groupBy({
        by: ['ordineNumero'],
        where: { fatta: false, ordineNumero: { in: numeri } },
        _count: { _all: true },
      })
    : []
  const perNumero = new Map(note.map((n) => [n.ordineNumero.replace(/\D/g, ''), n._count._all]))

  return NextResponse.json({
    ordini: ordini.map((o) => ({
      numero: o.numero,
      clienteNome: o.clienteNome,
      negozioNome: o.negozioNome,
      dataConsegna: o.dataConsegna ? o.dataConsegna.toISOString() : null,
      fasciaConsegna: o.fasciaConsegna,
      gestione: o.gestione,
      note: perNumero.get(o.numero.replace(/\D/g, '')) ?? 0,
    })),
  })
}
