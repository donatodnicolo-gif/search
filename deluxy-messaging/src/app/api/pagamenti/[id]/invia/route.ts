import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { inviaRichiestaPagamento, statoRichiestaPartner } from '@/lib/partner'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Rimanda a Partner una richiesta già salvata (o ne aggiorna lo stato).
// L'invio è idempotente sul `riferimento`: non crea doppioni.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const r = await db.richiestaPagamento.findUnique({ where: { id } })
  if (!r) return NextResponse.json({ errore: 'Richiesta non trovata' }, { status: 404 })

  const esito = await inviaRichiestaPagamento({
    importo: r.importo,
    beneficiario: r.intestatario,
    iban: r.iban,
    bic: r.bic,
    causale: r.causale,
    contatto: r.contatto,
    linkConversazione: r.linkConversazione,
    riferimento: r.riferimento,
    note: r.note,
  })

  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Partner non configurato: URL e chiave in Impostazioni.' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') {
    await db.richiestaPagamento.update({ where: { id }, data: { esitoInvio: esito.messaggio } })
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }

  const aggiornata = await db.richiestaPagamento.update({
    where: { id },
    data: {
      inviataIl: new Date(),
      partnerId: esito.id,
      partnerStato: esito.statoRichiesta,
      esitoInvio: '',
    },
  })
  return NextResponse.json({ richiesta: aggiornata, aggiornata: esito.aggiornata })
}

// Chiede a Partner a che punto è (approvata? rifiutata?).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const r = await db.richiestaPagamento.findUnique({ where: { id } })
  if (!r) return NextResponse.json({ errore: 'Richiesta non trovata' }, { status: 404 })

  const stato = await statoRichiestaPartner(r.riferimento)
  if (!stato) return NextResponse.json({ errore: 'Stato non disponibile.' }, { status: 502 })

  await db.richiestaPagamento.update({ where: { id }, data: { partnerStato: stato.stato } })
  return NextResponse.json(stato)
}
