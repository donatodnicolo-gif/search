import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { metodiDisponibili, metodiTutti } from '@/lib/metodi-pagamento'
import { validaMetodo } from '@/lib/metodi-regole'

export const dynamic = 'force-dynamic'

// ⭐ 11/09/2026 — I METODI DI PAGAMENTO (richiesta dell'utente: «consentimi su
// impostazioni di stabilire per ogni metodo che viene elencato le specifiche»).
//
// Lettura per tutti gli operatori: il modulo Nuovo ordine deve poter mostrare
// la tendina e le specifiche del metodo scelto. Scrittura dell'amministratore.
//
// ⚠️⚠️ Il cancello sta QUI e non nel menu. Una rotta è un endpoint anche senza
// voce nella barra, e queste righe decidono se un ordine nasce pagato: chi può
// scriverle può dichiarare incassati dei soldi che nessuno ha preso.
async function admin() {
  const io = await utenteCorrente()
  if (!io) return { errore: NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 }) }
  if (io.ruolo !== 'admin') {
    return { errore: NextResponse.json({ errore: 'Serve un amministratore.' }, { status: 403 }) }
  }
  return { io }
}

// GET            → tutti (anche gli spenti): è l'elenco di Impostazioni
// GET ?negozio=… → solo quelli scegliibili adesso su quel negozio
export async function GET(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const negozio = (req.nextUrl.searchParams.get('negozio') ?? '').trim()
  const metodi = negozio ? await metodiDisponibili(negozio) : await metodiTutti()
  return NextResponse.json({ metodi })
}

async function negozioValido(id: string | null): Promise<boolean> {
  if (!id) return true
  const n = await db.negozioShopify.findUnique({ where: { id }, select: { id: true } })
  return Boolean(n)
}

// POST { nome, comeNasce, quandoDovuto, istruzioni, notaConsegna, attributo, negozioId, posizione, attivo }
export async function POST(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const body = await req.json().catch(() => null)
  const esito = validaMetodo(body)
  if (!esito.ok) return NextResponse.json({ errore: esito.errori[0], errori: esito.errori }, { status: 400 })
  if (!(await negozioValido(esito.dati.negozioId))) {
    return NextResponse.json({ errore: 'Negozio non trovato.' }, { status: 404 })
  }
  const metodo = await db.metodoPagamento.create({ data: esito.dati })
  return NextResponse.json({ ok: true, metodo })
}

// PUT { id, …le stesse specifiche }
export async function PUT(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const body = (await req.json().catch(() => null)) as { id?: string } | null
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ errore: 'Manca il metodo da salvare.' }, { status: 400 })
  const esiste = await db.metodoPagamento.findUnique({ where: { id }, select: { id: true } })
  if (!esiste) return NextResponse.json({ errore: 'Metodo non trovato.' }, { status: 404 })
  const esito = validaMetodo(body)
  if (!esito.ok) return NextResponse.json({ errore: esito.errori[0], errori: esito.errori }, { status: 400 })
  if (!(await negozioValido(esito.dati.negozioId))) {
    return NextResponse.json({ errore: 'Negozio non trovato.' }, { status: 404 })
  }
  const metodo = await db.metodoPagamento.update({ where: { id }, data: esito.dati })
  return NextResponse.json({ ok: true, metodo })
}

// DELETE ?id=…
//
// ⚠️ Si può, ma il posto giusto quasi sempre è spegnerlo: il nome di un metodo
// resta scritto nella nota degli ordini già fatti, e toglierlo non li cambia —
// toglie solo il modo di sapere che regola avevano. La schermata lo dice prima
// di premere; qui si esegue quello che una persona ha deciso.
export async function DELETE(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const id = (req.nextUrl.searchParams.get('id') ?? '').trim()
  if (!id) return NextResponse.json({ errore: 'Manca il metodo da togliere.' }, { status: 400 })
  await db.metodoPagamento.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}
