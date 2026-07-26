import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stringaPagamento, verificaIban } from '@/lib/iban'
import { inviaRichiestaPagamento } from '@/lib/partner'

export const dynamic = 'force-dynamic'

// Le richieste di pagamento salvate.
export async function GET() {
  const richieste = await db.richiestaPagamento.findMany({
    orderBy: { creatoIl: 'desc' },
    take: 200,
  })
  return NextResponse.json({
    richieste: richieste.map((r) => ({ ...r, stringa: stringaPagamento(r) })),
  })
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    iban?: string
    bic?: string
    intestatario?: string
    importo?: number
    valuta?: string
    causale?: string
    note?: string
    contatto?: string
    linkConversazione?: string
    origine?: string
    ordineNumero?: string
    // false = salva soltanto, senza mandarla a Partner
    inviaAPartner?: boolean
  }

  const esitoIban = verificaIban(c.iban ?? '')
  if (!esitoIban.normalizzato) {
    return NextResponse.json({ errore: 'Serve un IBAN.' }, { status: 400 })
  }
  if (!(c.intestatario ?? '').trim()) {
    return NextResponse.json({ errore: 'Serve l’intestatario del conto.' }, { status: 400 })
  }

  // Un IBAN che non supera il checksum si può salvare lo stesso (magari va
  // completato a mano), ma resta marcato come non valido: mai spacciarlo per buono.
  const richiesta = await db.richiestaPagamento.create({
    data: {
      iban: esitoIban.normalizzato,
      bic: (c.bic ?? '').replace(/\s/g, '').toUpperCase(),
      intestatario: (c.intestatario ?? '').trim(),
      importo: Number(c.importo) || 0,
      valuta: (c.valuta || 'EUR').toUpperCase(),
      causale: (c.causale ?? '').trim(),
      note: (c.note ?? '').trim(),
      contatto: (c.contatto ?? '').trim(),
      linkConversazione: (c.linkConversazione ?? '').trim(),
      ibanValido: esitoIban.valido,
      ibanPaese: esitoIban.paese,
      origine: c.origine || 'manuale',
      ordineNumero: (c.ordineNumero ?? '').trim(),
    },
  })

  // Inoltro a Deluxy Partner, che approva e paga. Un fallimento qui non annulla
  // il salvataggio: la richiesta resta e si può rimandare.
  let invio: { ok: boolean; messaggio: string } | null = null
  if (c.inviaAPartner !== false) {
    const esito = await inviaRichiestaPagamento({
      importo: richiesta.importo,
      beneficiario: richiesta.intestatario,
      iban: richiesta.iban,
      bic: richiesta.bic,
      causale: richiesta.causale,
      contatto: richiesta.contatto,
      linkConversazione: richiesta.linkConversazione,
      riferimento: richiesta.riferimento,
      note: richiesta.note,
    })
    if (esito.stato === 'ok') {
      await db.richiestaPagamento.update({
        where: { id: richiesta.id },
        data: {
          inviataIl: new Date(),
          partnerId: esito.id,
          partnerStato: esito.statoRichiesta,
          esitoInvio: '',
        },
      })
      invio = { ok: true, messaggio: `Inviata a Partner (${esito.statoRichiesta}).` }
    } else if (esito.stato === 'non-configurato') {
      invio = { ok: false, messaggio: 'Salvata qui: Partner non è configurato (Impostazioni).' }
      await db.richiestaPagamento.update({
        where: { id: richiesta.id },
        data: { esitoInvio: 'Partner non configurato' },
      })
    } else {
      invio = { ok: false, messaggio: `Salvata qui, ma non inviata: ${esito.messaggio}` }
      await db.richiestaPagamento.update({
        where: { id: richiesta.id },
        data: { esitoInvio: esito.messaggio },
      })
    }
  }

  const aggiornata = await db.richiestaPagamento.findUnique({ where: { id: richiesta.id } })
  return NextResponse.json({
    richiesta: { ...aggiornata, stringa: stringaPagamento(richiesta) },
    motivoIban: esitoIban.motivo,
    invio,
  })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.richiestaPagamento.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
