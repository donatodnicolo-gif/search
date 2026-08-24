import { NextRequest, NextResponse } from 'next/server'
import { autentica, erroreApi } from '@/lib/api-auth'
import { creaOrdine, type DatiNuovoOrdine } from '@/lib/nuovo-ordine'

export const dynamic = 'force-dynamic'
// La creazione parla con Shopify tre volte (token, bozza, invoice/chiusura).
export const maxDuration = 60

// POST /api/v1/nuovo-ordine — creare un ordine per un cliente al telefono,
// DALLE ALTRE APP (oggi: il CRM). Stessa strada della schermata interna:
// bozza d'ordine su Shopify, poi o il link di pagamento (`pagamento: "link"`)
// o la chiusura come già pagato (`pagamento: "pagato"`). L'ordine vero lo fa
// Shopify e rientra dal registro Deluxy Orders come tutti gli altri.
//
// Serve una chiave con SCRITTURA: creare ordini non è leggere reclami.
//
// Body: { negozioId, cliente{nome,cognome,email,telefono},
//         consegna{data,fascia,indirizzo,civicoNote,cap,citta,provincia,paese},
//         righe[{variantId | titolo+prezzo, quantita}], biglietto,
//         spedizione{titolo,prezzo}, pagamento: "link"|"pagato",
//         mezzoPagamento, operatore?{id,nome} }
// L'`operatore.nome` finisce nella riga di lavoro (chi l'ha creato): le app
// passino "APP — Nome Cognome", così il conteggio per persona resta vero.
export async function POST(req: NextRequest) {
  const client = await autentica(req, { scrittura: true })
  if (client instanceof NextResponse) return client

  let body: DatiNuovoOrdine
  try {
    body = (await req.json()) as DatiNuovoOrdine
  } catch {
    return erroreApi(400, 'Corpo non valido: serve un JSON')
  }

  if (!body?.negozioId) return erroreApi(400, 'Manca negozioId')
  if (!Array.isArray(body.righe) || body.righe.length === 0) {
    return erroreApi(400, 'Serve almeno una riga (variantId, oppure titolo+prezzo)')
  }
  if (body.pagamento !== 'link' && body.pagamento !== 'pagato') {
    return erroreApi(400, 'pagamento deve essere "link" o "pagato"')
  }

  // Difesa dei campi che la lib dà per scontati (arrivano da fuori).
  const dati: DatiNuovoOrdine = {
    negozioId: String(body.negozioId),
    cliente: {
      nome: String(body.cliente?.nome ?? ''),
      cognome: String(body.cliente?.cognome ?? ''),
      email: String(body.cliente?.email ?? ''),
      telefono: String(body.cliente?.telefono ?? ''),
    },
    consegna: {
      data: String(body.consegna?.data ?? ''),
      fascia: String(body.consegna?.fascia ?? ''),
      indirizzo: String(body.consegna?.indirizzo ?? ''),
      civicoNote: String(body.consegna?.civicoNote ?? ''),
      cap: String(body.consegna?.cap ?? ''),
      citta: String(body.consegna?.citta ?? ''),
      provincia: String(body.consegna?.provincia ?? ''),
      paese: String(body.consegna?.paese ?? 'IT'),
    },
    righe: body.righe.map((r) => ({
      variantId: r.variantId ? String(r.variantId) : undefined,
      titolo: r.titolo ? String(r.titolo) : undefined,
      prezzo: r.prezzo != null ? Number(r.prezzo) : undefined,
      quantita: Math.max(1, Number(r.quantita) || 1),
    })),
    biglietto: String(body.biglietto ?? ''),
    spedizione: {
      titolo: String(body.spedizione?.titolo ?? ''),
      prezzo: Math.max(0, Number(body.spedizione?.prezzo) || 0),
    },
    pagamento: body.pagamento,
    mezzoPagamento: String(body.mezzoPagamento ?? ''),
    operatore: {
      id: String(body.operatore?.id ?? client.nome),
      nome: String(body.operatore?.nome ?? client.nome),
    },
  }

  const esito = await creaOrdine(dati)
  if (!esito.ok) return NextResponse.json(esito, { status: 422 })
  return NextResponse.json(esito, { headers: { 'Cache-Control': 'no-store' } })
}
