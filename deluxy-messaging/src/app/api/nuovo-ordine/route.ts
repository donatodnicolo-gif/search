import { NextRequest, NextResponse } from 'next/server'
import { creaOrdine, type DatiNuovoOrdine } from '@/lib/nuovo-ordine'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Crea l'ordine su Shopify: bozza + link di pagamento, oppure ordine già pagato.
export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const d = (await req.json().catch(() => ({}))) as Partial<DatiNuovoOrdine>
  if (!d.negozioId) return NextResponse.json({ errore: 'Scegli il negozio.' }, { status: 400 })
  if (!d.righe?.length) return NextResponse.json({ errore: 'Aggiungi almeno un prodotto.' }, { status: 400 })

  const esito = await creaOrdine({
    negozioId: d.negozioId,
    cliente: {
      nome: d.cliente?.nome ?? '',
      cognome: d.cliente?.cognome ?? '',
      email: d.cliente?.email ?? '',
      telefono: d.cliente?.telefono ?? '',
    },
    consegna: {
      data: d.consegna?.data ?? '',
      fascia: d.consegna?.fascia ?? '',
      indirizzo: d.consegna?.indirizzo ?? '',
      civicoNote: d.consegna?.civicoNote ?? '',
      cap: d.consegna?.cap ?? '',
      citta: d.consegna?.citta ?? '',
      provincia: d.consegna?.provincia ?? '',
      paese: d.consegna?.paese ?? 'IT',
    },
    righe: d.righe,
    biglietto: d.biglietto ?? '',
    spedizione: { titolo: d.spedizione?.titolo ?? '', prezzo: d.spedizione?.prezzo ?? 0 },
    anonima: Boolean(d.anonima),
    pagamento: d.pagamento === 'pagato' ? 'pagato' : 'link',
    mezzoPagamento: d.mezzoPagamento ?? '',
    // ⚠️ Di suo l'IVA NON si aggiunge: solo se il modulo la chiede esplicitamente.
    aggiungiIva: d.aggiungiIva === true,
    // Chi sta creando l'ordine: la sessione lo sa, Shopify no. Senza questo
    // la pagina «Operatori» non può dire quanti link di pagamento manda
    // ciascuno — e quel dato non si recupera dopo.
    operatore: { id: io.id, nome: io.nome },
  })
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 })
  return NextResponse.json(esito)
}
