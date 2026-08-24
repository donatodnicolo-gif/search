import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stringaPagamento, verificaIban } from '@/lib/iban'
import { cosaManca, metodoValido } from '@/lib/metodo-pagamento'
import { inviaRichiestaPagamento } from '@/lib/partner'

export const dynamic = 'force-dynamic'

// Le richieste di pagamento salvate.
export async function GET() {
  // ⚠️⚠️ Si SCEGLIE cosa tornare, e i byte della ricevuta restano fuori.
  //
  // È il file in base64: senza questo `select`, ogni caricamento della pagina si
  // porterebbe dietro le ricevute di TUTTE le righe — duecento file da qualche
  // centinaio di KB l'uno — per mostrare una tabella che di quel file usa solo
  // il nome. Su un telefono in giro vuol dire una pagina che non arriva.
  const richieste = await db.richiestaPagamento.findMany({
    orderBy: { creatoIl: 'desc' },
    take: 200,
    select: {
      id: true,
      iban: true,
      bic: true,
      intestatario: true,
      importo: true,
      valuta: true,
      causale: true,
      note: true,
      contatto: true,
      linkConversazione: true,
      riferimento: true,
      inviataIl: true,
      partnerId: true,
      partnerStato: true,
      esitoInvio: true,
      ibanValido: true,
      ibanPaese: true,
      origine: true,
      ordineNumero: true,
      metodo: true,
      riferimentoPagamento: true,
      pagataIl: true,
      pagataDaNome: true,
      // Il NOME e il TIPO sì (servono a dire «ricevuta ✓» e ad aprirla), i byte no.
      ricevutaNome: true,
      ricevutaTipo: true,
      creatoIl: true,
    },
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
    /** iban · link · paypal · altro. Vedi src/lib/metodo-pagamento.ts. */
    metodo?: string
    riferimentoPagamento?: string
    // false = salva soltanto, senza mandarla a Partner
    inviaAPartner?: boolean
  }

  // ⚠️⚠️ NON TUTTI I FORNITORI SI PAGANO CON UN BONIFICO. Chi manda un link,
  // chi dà un PayPal, chi si accorda a voce. Finché qui si pretendeva un IBAN,
  // tutto il resto non si registrava affatto: restava in una chat, e
  // sull'ordine risultava che non avevamo pagato nessuno.
  const metodo = (c.metodo ?? 'iban').trim()
  if (!metodoValido(metodo)) {
    return NextResponse.json({ errore: 'Metodo di pagamento non valido.' }, { status: 400 })
  }
  const esitoIban = verificaIban(c.iban ?? '')
  const riferimento = (c.riferimentoPagamento ?? '').trim()
  const manca = cosaManca({
    metodo,
    iban: esitoIban.normalizzato,
    riferimento,
    intestatario: (c.intestatario ?? '').trim(),
  })
  if (manca) return NextResponse.json({ errore: manca }, { status: 400 })

  // Un IBAN che non supera il checksum si può salvare lo stesso (magari va
  // completato a mano), ma resta marcato come non valido: mai spacciarlo per buono.
  const richiesta = await db.richiestaPagamento.create({
    data: {
      metodo,
      // ⚠️ Si scrive solo il campo del metodo scelto: lasciare l'altro pieno
      // vorrebbe dire una riga che dice due cose diverse su come si paga.
      riferimentoPagamento: metodo === 'iban' ? '' : riferimento,
      iban: metodo === 'iban' ? esitoIban.normalizzato : '',
      bic: (c.bic ?? '').replace(/\s/g, '').toUpperCase(),
      intestatario: (c.intestatario ?? '').trim(),
      importo: Number(c.importo) || 0,
      valuta: (c.valuta || 'EUR').toUpperCase(),
      causale: (c.causale ?? '').trim(),
      note: (c.note ?? '').trim(),
      contatto: (c.contatto ?? '').trim(),
      linkConversazione: (c.linkConversazione ?? '').trim(),
      // ⚠️ Su un metodo che non è un bonifico `false` vuol dire «non
      // applicabile», non «sbagliato»: chi legge la tabella deve vedere «—»,
      // non un allarme rosso su una riga che sta benissimo.
      ibanValido: metodo === 'iban' ? esitoIban.valido : false,
      ibanPaese: metodo === 'iban' ? esitoIban.paese : '',
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
