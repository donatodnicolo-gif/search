import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { formeNumero, normalizzaNumero, numeroInTesta } from '@/lib/diario'

export const dynamic = 'force-dynamic'

// Il diario di lavoro.
//   ?stato=aperte (di suo) | fatte | tutte
//   ?ordine=1741   solo le righe di quell'ordine
//   ?q=            cerca nel testo
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const stato = (p.get('stato') ?? 'aperte').trim()
  const ordine = (p.get('ordine') ?? '').trim()
  const q = (p.get('q') ?? '').trim()

  const dove: Record<string, unknown> = {}
  if (stato === 'aperte') dove.fatta = false
  else if (stato === 'fatte') dove.fatta = true
  // ⚠️ Si cerca in tutte e due le forme del numero: in tabella stanno col
  // cancelletto, a mano si scrivono senza. Senza questo la nota c'è ma
  // sull'ordine non compare, e nessuna delle due schermate dà errore.
  if (ordine) dove.ordineNumero = { in: formeNumero(ordine) }
  if (q) dove.testo = { contains: q, mode: 'insensitive' }

  const note = await db.notaDiario.findMany({
    where: dove,
    // Le aperte in ordine di scrittura (il quaderno si legge dall'alto), le
    // fatte dalle più recenti.
    orderBy: stato === 'fatte' ? { fattaIl: 'desc' } : { creatoIl: 'desc' },
    take: 300,
  })
  const aperte = await db.notaDiario.count({ where: { fatta: false } })
  return NextResponse.json({ note, aperte })
}

// Una riga nuova. Il numero d'ordine si stacca da solo dalla testa del testo.
export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const { testo, ordineNumero } = (await req.json().catch(() => ({}))) as {
    testo?: string
    ordineNumero?: string
  }
  const grezzo = (testo ?? '').trim()
  if (!grezzo) return NextResponse.json({ errore: 'La riga è vuota.' }, { status: 400 })

  // ⚠️ Se il numero arriva dal contesto (si scrive DALL'ordine) vince quello:
  // là la riga la si scrive senza ripetere il numero, ed è giusto così.
  const dallaTesta = numeroInTesta(grezzo)
  const numero = ordineNumero?.trim()
    ? normalizzaNumero(ordineNumero)
    : dallaTesta.numero
  const corpo = ordineNumero?.trim() ? grezzo : dallaTesta.resto || grezzo

  const nota = await db.notaDiario.create({
    data: {
      ordineNumero: numero,
      testo: corpo,
      autoreId: io.id,
      autoreNome: io.nome,
    },
  })
  return NextResponse.json({ nota })
}
