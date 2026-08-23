import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { costoValido, ripulisciFornitore } from '@/lib/fornitore-ordine'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// A chi abbiamo dato quest'ordine da preparare.
//
// ⚠️ Il fatto non viveva da nessuna parte: l'app sapeva chi si poteva chiamare
// e sapeva che era stato pagato un nome su un IBAN, ma non «questo ordine l'ha
// fatto Tizio». Restava nella testa di chi aveva telefonato.

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const f = ripulisciFornitore(corpo)

  // ⚠️ Il NOME è l'unica cosa obbligatoria, e per un motivo: senza, la riga
  // direbbe «l'ordine è stato dato a qualcuno», che è esattamente quello che si
  // sapeva già. Tutto il resto — città, telefono, costo — si aggiunge dopo.
  if (!f.fornitoreNome) {
    return NextResponse.json({ errore: 'Serve il nome del fornitore.' }, { status: 400 })
  }
  // ⚠️ Il costo si controlla qui e non solo nel modulo: una cifra assurda
  // scritta di fretta diventerebbe la base di una richiesta di pagamento.
  if (corpo.costo !== undefined && corpo.costo !== null && corpo.costo !== '' && !costoValido(f.fornitoreCosto)) {
    return NextResponse.json(
      { errore: 'Il costo non è un importo valido (fra 0 e 100.000 €).' },
      { status: 400 }
    )
  }

  const ordine = await db.ordine.findUnique({ where: { id }, select: { id: true } })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })

  const aggiornato = await db.ordine.update({
    where: { id },
    data: {
      ...f,
      fornitoreDaId: io.id,
      fornitoreDaNome: io.nome,
      fornitoreIl: new Date(),
    },
    select: {
      fornitoreNome: true,
      fornitoreId: true,
      fornitoreCitta: true,
      fornitoreTelefono: true,
      fornitoreEmail: true,
      fornitoreCosto: true,
      fornitoreNota: true,
      fornitoreDaNome: true,
      fornitoreIl: true,
    },
  })
  // ⚠️ NON si tocca `gestione`. Registrare il fornitore vuol dire «la ricerca è
  // finita», non «l'ordine è in consegna»: spostare da solo lo stato di
  // lavorazione direbbe una cosa che non è ancora successa, e chi guarda la
  // bacheca si fiderebbe. Lo stato lo muove una persona, con i suoi bottoni.
  return NextResponse.json({ fornitore: aggiornato })
}

// Toglierlo: capita di sbagliare riga, e capita che il fornitore dica di no
// dopo aver detto di sì. Un dato che non si può correggere si smette di
// scrivere.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const ordine = await db.ordine.findUnique({ where: { id }, select: { id: true } })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })

  await db.ordine.update({
    where: { id },
    data: {
      fornitoreNome: '',
      fornitoreId: '',
      fornitoreCitta: '',
      fornitoreTelefono: '',
      fornitoreEmail: '',
      fornitoreCosto: null,
      fornitoreNota: '',
      fornitoreDaId: '',
      fornitoreDaNome: '',
      fornitoreIl: null,
    },
  })
  return NextResponse.json({ tolto: true })
}
