import { NextRequest, NextResponse } from 'next/server'
import { segnaBozzaPagata } from '@/lib/bozze'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Due domande a Shopify (com'è messa, e chiudila): i 10 secondi non bastano.
export const maxDuration = 60

// Segna come pagata una bozza già creata: la chiude su Shopify e diventa ordine.
//
// ⚠️⚠️ È il caso di tutti i giorni: si manda il link, il cliente paga FUORI da
// Shopify (bonifico, contanti alla consegna, POS) e la bozza resta aperta per
// sempre — finché dopo sette giorni il cron la annulla come scaduta, cioè si
// butta via un ordine incassato.
export async function POST(req: NextRequest) {
  // ⚠️ Serve per SCRIVERE CHI: dichiarare che il denaro è arrivato è una
  // decisione di una persona, e davanti a un ordine contestato «lo ha detto
  // l'app» non è una risposta.
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  const c = (await req.json().catch(() => ({}))) as { id?: string; mezzo?: string }
  const id = (c.id ?? '').trim()
  if (!id) return NextResponse.json({ errore: 'Manca la bozza.' }, { status: 400 })
  // ⚠️ Il mezzo è OBBLIGATORIO: «pagata» senza dire come è la riga che fra un
  // mese non si sa più riconciliare con l'estratto conto.
  const mezzo = (c.mezzo ?? '').trim()
  if (!mezzo) {
    return NextResponse.json({ errore: 'Dì con che mezzo è stata pagata.' }, { status: 400 })
  }

  const esito = await segnaBozzaPagata(id, mezzo, { id: io.id, nome: io.nome })
  // ⚠️ Non è un 500: un «già pagata» o un «annullata» sono risposte legittime a
  // una domanda legittima, e vanno lette da chi ha premuto — non nascoste
  // dietro un errore generico.
  return NextResponse.json(esito, { status: esito.ok ? 200 : 409 })
}
