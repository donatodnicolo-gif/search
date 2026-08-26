import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { inviaRichiestaPagamento, statoRichiestaPartner } from '@/lib/partner'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Rimanda a Partner una richiesta già salvata (o ne aggiorna lo stato).
// L'invio è idempotente sul `riferimento`: non crea doppioni.
export async function POST(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
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
      { errore: 'Nessun canale di pagamento configurato: variabili Transactions (o, in ripiego, Partner in Impostazioni).' },
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
      canale: esito.canale,
      esitoInvio: '',
    },
  })
  return NextResponse.json({ richiesta: aggiornata, aggiornata: esito.aggiornata })
}

// Chiede al canale giusto a che punto è (approvata? rifiutata?).
export async function GET(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const r = await db.richiestaPagamento.findUnique({ where: { id } })
  if (!r) return NextResponse.json({ errore: 'Richiesta non trovata' }, { status: 404 })

  const stato = await statoRichiestaPartner(r.riferimento, r.canale || undefined)
  if (!stato) return NextResponse.json({ errore: 'Stato non disponibile.' }, { status: 502 })

  await db.richiestaPagamento.update({ where: { id }, data: { partnerStato: stato.stato } })
  return NextResponse.json(stato)
}
