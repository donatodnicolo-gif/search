import { NextRequest, NextResponse } from 'next/server'
import { aggiornaPreventivo, chiudiPreventivo, inviaPreventivo } from '@/lib/preventivi'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// La creazione della bozza passa da Shopify: i 10 secondi di default non bastano.
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// Le tre cose che si fanno a un preventivo:
//   { azione: 'invia',   importo, descrizione, giorniValidita }  → bozza + link
//   { azione: 'chiudi',  stato: accettato|rifiutato|scaduto }
//   { azione: 'aggiorna', negozioId | clienteNome | email | telefono | note }
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const c = (await req.json().catch(() => ({}))) as Record<string, string | number>
  const io = await utenteCorrente()
  const azione = String(c.azione ?? '')

  if (azione === 'invia') {
    const esito = await inviaPreventivo(
      id,
      {
        importo: Number(c.importo),
        descrizione: String(c.descrizione ?? ''),
        giorniValidita: Number(c.giorniValidita ?? 0),
      },
      io ? { id: io.id, nome: io.nome } : null
    )
    if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
    return NextResponse.json({
      ok: true,
      link: esito.link,
      bozza: esito.bozza,
      // ⚠️ Si dice che è una BOZZA: chi legge «preventivo inviato» può credere
      // che sia partita una mail, e invece il link lo manda una persona.
      nota: `Bozza ${esito.bozza}: copia il link e mandalo tu. Diventa un ordine quando il cliente paga.`,
    })
  }

  if (azione === 'chiudi') {
    const esito = await chiudiPreventivo(
      id,
      String(c.stato ?? ''),
      { ordineNumero: String(c.ordineNumero ?? ''), note: String(c.note ?? '') },
      io ? { nome: io.nome } : null
    )
    if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (azione === 'aggiorna') {
    const esito = await aggiornaPreventivo(id, {
      // ⚠️ `undefined` quando il campo non è arrivato: un aggiornamento parziale
      // non deve azzerare quello che non contiene.
      negozioId: c.negozioId === undefined ? undefined : String(c.negozioId),
      clienteNome: c.clienteNome === undefined ? undefined : String(c.clienteNome),
      email: c.email === undefined ? undefined : String(c.email),
      telefono: c.telefono === undefined ? undefined : String(c.telefono),
      note: c.note === undefined ? undefined : String(c.note),
    })
    if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ errore: 'Azione non riconosciuta.' }, { status: 400 })
}
