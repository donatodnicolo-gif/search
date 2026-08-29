import { NextRequest, NextResponse, after } from 'next/server'
import { notificaAutentica } from '@/lib/transactions'
import { inviaAvvisoInterno, numeroAvviso, testoAvviso } from '@/lib/avviso-pagamento-da-fare'

// «È arrivata una richiesta di pagamento» — da DELUXY TRANSACTIONS.
//
// Chiesto dall'utente il 29/08/2026: l'avviso WhatsApp che il CS manda già per
// le richieste nate qui dentro deve scattare per OGNI richiesta del collettore
// unico — anche quelle di Scout, Finance e Piattaforma. Il CS è l'unica app
// con WhatsApp collegato, quindi Transactions gli chiede l'invio.
//
// Regole:
//  • firma HMAC verificata PRIMA del corpo, fail-closed (stesso segreto del
//    canale Transactions↔CS: nessuna chiave nuova);
//  • 200 SUBITO, invio in after(): il mittente ha un timeout corto e ritenta —
//    un receiver lento produrrebbe doppi WhatsApp;
//  • le richieste nate NEL CS non passano di qui (si avvisano già da sole al
//    salvataggio): doppio filtro, in Transactions e qui;
//  • numero spento in Impostazioni = avviso spento, non un errore.

export const dynamic = 'force-dynamic'

type Payload = {
  origine?: string
  id?: string // id della richiesta su Transactions (per il link diretto)
  riferimento?: string // TRX-2026-000123
  importoCent?: number
  valuta?: string
  beneficiario?: string
  metodo?: string
  iban?: string
  riferimentoPagamento?: string
  causale?: string
  link?: string // il dettaglio su Transactions, dove si autorizza
}

export async function POST(req: NextRequest) {
  const segreto = (process.env.TRANSACTIONS_HMAC_SECRET ?? '').trim()
  if (!segreto) return NextResponse.json({ errore: 'Canale non configurato.' }, { status: 503 })

  const corpo = await req.text()
  if (!notificaAutentica(corpo, req.headers)) {
    return NextResponse.json({ errore: 'Firma non valida.' }, { status: 401 })
  }

  let p: Payload
  try {
    p = JSON.parse(corpo) as Payload
  } catch {
    return NextResponse.json({ errore: 'Corpo non valido.' }, { status: 400 })
  }

  // Le nostre si avvisano già da sole al salvataggio: due WhatsApp per la
  // stessa richiesta insegnerebbero a ignorarli.
  if ((p.origine ?? '') === 'deluxy-messaging') {
    return NextResponse.json({ ok: true, nota: 'Richiesta del CS: si avvisa già da sola.' })
  }

  const numero = await numeroAvviso()
  if (!numero) return NextResponse.json({ ok: true, nota: 'Numero avvisi non configurato: avviso spento.' })

  // ⚠️ Il link si RICOSTRUISCE qui, sul dominio di Transactions scritto in
  // questo file: un URL preso in parola da un corpo esterno è la strada del
  // phishing, anche su un canale firmato. Dal payload si accetta solo l'ID
  // (forma cuid verificata), che porta dritti alla riga da autorizzare.
  const base = ((process.env.TRANSACTIONS_URL ?? '').trim() || 'https://deluxy-transactions.vercel.app').replace(/\/+$/, '')
  const id = /^[a-z0-9]{20,32}$/.test(p.id ?? '') ? p.id! : ''
  const link = id ? `${base}/richieste/${id}` : `${base}/richieste`

  const testo = testoAvviso({
    chi: (p.beneficiario ?? '').slice(0, 120),
    importo: (p.importoCent ?? 0) / 100,
    valuta: p.valuta || 'EUR',
    ordine: '',
    causale: [p.riferimento, p.causale].filter(Boolean).join(' — ').slice(0, 200),
    da: p.origine ?? '',
    metodo: p.metodo,
    iban: p.iban,
    riferimento: p.riferimentoPagamento,
    link,
  })

  after(async () => {
    await inviaAvvisoInterno(numero, testo)
  })
  return NextResponse.json({ ok: true })
}
