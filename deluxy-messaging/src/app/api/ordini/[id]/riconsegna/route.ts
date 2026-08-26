import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { creaOrdine } from '@/lib/nuovo-ordine'
import { righeOrdineDaOrders } from '@/lib/orders'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// «RICONSEGNA»: il link di pagamento per riportare un ordine già consegnato.
//
//   POST /api/ordini/<id>/riconsegna  { importo: 15, motivo: "destinatario assente" }
//
// ⚠️⚠️ Il caso vero: il valet arriva e il destinatario non c'è. Riportarlo
// costa, e quel costo lo paga il cliente — ma finora bisognava aprire «Nuovo
// ordine», ricopiare cliente, indirizzo e data, e sperare di non sbagliare
// niente. Tre minuti al telefono con un cliente già arrabbiato.
//
// ⚠️ È un ORDINE NUOVO, non una modifica di quello vecchio: il cliente paga una
// cosa in più, e in Deluxy Orders deve risultare come un incasso in più. Toccare
// il totale dell'ordine originale vorrebbe dire falsificare la prima vendita.
//
// ⚠️⚠️ Resta una BOZZA finché non paga (`pagamento: 'link'`): nessun incasso
// registrato che non sia vero. Se paga, l'ordine si chiude da solo su Shopify e
// arriva qui col giro normale.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  const c = (await req.json().catch(() => ({}))) as { importo?: number; motivo?: string }

  const importo = Number(c.importo)
  // ⚠️ Nessun prezzo di riserva: una riconsegna costa quello che si è detto al
  // cliente, e un default silenzioso finirebbe per essere il prezzo di tutti.
  if (!Number.isFinite(importo) || importo <= 0) {
    return NextResponse.json(
      { errore: 'Scrivi quanto costa la riconsegna: senza importo non si può chiedere niente.' },
      { status: 400 }
    )
  }

  const ordine = await db.ordine.findUnique({
    where: { id },
    select: {
      negozioId: true,
      numero: true,
      shopifyId: true,
      clienteNome: true,
      email: true,
      telefono: true,
    },
  })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })

  // ⚠️ L'indirizzo si chiede a Orders, che è chi lo possiede: ricopiarlo dalla
  // riga locale vorrebbe dire mandare il valet dove stava scritto tre settimane
  // fa, e una riconsegna a un indirizzo vecchio è il modo di sbagliare due volte.
  const righe = await righeOrdineDaOrders(ordine.numero, ordine.shopifyId)
  const sped = righe.stato === 'ok' ? righe.spedizione : null

  // «Mario Rossi» → nome + cognome. ⚠️ Se ha un nome solo, il cognome resta
  // vuoto: inventarlo scriverebbe un dato falso su un cliente vero.
  const pezzi = (ordine.clienteNome ?? '').trim().split(/\s+/)
  const nome = pezzi[0] ?? ''
  const cognome = pezzi.slice(1).join(' ')

  const motivo = (c.motivo ?? '').trim()
  const esito = await creaOrdine({
    negozioId: ordine.negozioId,
    cliente: { nome, cognome, email: ordine.email ?? '', telefono: ordine.telefono ?? '' },
    consegna: {
      // ⚠️ Senza data: la si concorda al telefono, e scriverne una a caso
      // metterebbe in calendario una consegna che nessuno ha promesso.
      data: '',
      fascia: '',
      indirizzo: sped?.indirizzo ?? '',
      civicoNote: '',
      cap: sped?.cap ?? '',
      citta: sped?.citta ?? '',
      provincia: sped?.provincia ?? '',
      paese: sped?.paese ?? '',
    },
    // ⚠️⚠️ Una riga sola, e il titolo dice DI QUALE ordine è la riconsegna: fra
    // un mese, in una lista di ordini, «Riconsegna 15 €» non si capisce più.
    righe: [
      {
        titolo: `Riconsegna ${ordine.numero}${motivo ? ` — ${motivo}` : ''}`,
        prezzo: importo,
        quantita: 1,
      },
    ],
    biglietto: '',
    // La riconsegna È il servizio: nessuna spedizione a parte, o si pagherebbe
    // due volte la stessa cosa.
    spedizione: { titolo: '', prezzo: 0 },
    pagamento: 'link',
    mezzoPagamento: '',
    operatore: io ? { id: io.id, nome: io.nome } : undefined,
  })

  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 })
  return NextResponse.json({
    ok: true,
    link: esito.linkPagamento,
    numero: esito.ordineNumero,
    // ⚠️ Si dice che è una bozza: chi legge «ordine creato» crede di aver
    // incassato, e invece il cliente deve ancora pagare.
    nota: `Bozza ${esito.ordineNumero}: diventa un ordine quando il cliente paga.`,
  })
}
