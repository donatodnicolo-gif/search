import { NextRequest, NextResponse } from 'next/server'
import { leggiBozzaPerModifica } from '@/lib/bozze'
import { aggiornaBozza, type DatiNuovoOrdine } from '@/lib/nuovo-ordine'
import { datiDaCorpo } from '@/lib/nuovo-ordine-corpo'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Due o tre domande a Shopify: i 10 secondi non bastano.
export const maxDuration = 60

// ⭐ UNA BOZZA NON ANCORA PAGATA SI PUÒ MODIFICARE (utente, 10/09/2026:
// «consenti di modificare una bozza non ancora pagata»).
//
// Il caso vero: il link è partito, il cliente richiama — «metti due rose in
// più», «l'indirizzo è un altro», «consegnalo sabato». Finora si annullava la
// bozza e se ne rifaceva una, col cliente che riceveva un secondo link e il
// primo che restava pagabile in giro. Qui la bozza si RILEGGE da Shopify nel
// modulo, si corregge e si riscrive: stessa bozza, stesso link.
//
// ⚠️ Solo finché non è pagata: una bozza chiusa è un ordine, e un ordine si
// tocca su Shopify (o si rimborsa), non da qui.

// GET: la bozza com'è ADESSO su Shopify, nella forma del modulo.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await ctx.params
  const esito = await leggiBozzaPerModifica(id)
  if (!esito.ok) return NextResponse.json({ errore: esito.messaggio }, { status: 409 })
  return NextResponse.json(esito.bozza)
}

// PUT: riscrive la bozza su Shopify coi dati del modulo (stesso corpo di
// POST /api/nuovo-ordine, più `reinviaLink` per rimandare la mail col link).
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const { id } = await ctx.params
  const c = (await req.json().catch(() => ({}))) as Partial<DatiNuovoOrdine> & { reinviaLink?: boolean }
  if (!c.negozioId) return NextResponse.json({ errore: 'Scegli il negozio.' }, { status: 400 })
  if (!c.righe?.length) return NextResponse.json({ errore: 'Aggiungi almeno un prodotto.' }, { status: 400 })

  const esito = await aggiornaBozza(id, datiDaCorpo(c, { id: io.id, nome: io.nome }), {
    reinviaLink: c.reinviaLink === true,
  })
  // ⚠️ Un «già pagata» o «annullata» non è un guasto: è la risposta a chi ha
  // premuto, e va letta — 409, non 500.
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 409 })
  return NextResponse.json(esito)
}
