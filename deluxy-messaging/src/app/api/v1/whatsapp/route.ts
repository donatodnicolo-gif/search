import { NextRequest, NextResponse } from 'next/server'
import { autentica, erroreApi } from '@/lib/api-auth'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { inviaWhatsApp } from '@/lib/meta'
import { numeriCollegati, tokenPerNumero } from '@/lib/numeri-whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/v1/whatsapp — mandare UN WhatsApp a UN numero, dalle altre app
// (oggi: il CRM per gli auguri e le liste clienti). Il canale WhatsApp
// appartiene a quest'app: token Meta e numeri restano qui, chi chiama passa
// una chiave con SCRITTURA e il testo.
//
// Body: { a: "+39333...", testo, numeroId? }
//   `a`        il numero del cliente, con prefisso internazionale;
//   `numeroId` il phone_number_id del NOSTRO numero da cui mandare (da
//              GET /api/v1/whatsapp/numeri); senza, si usa quello generale
//              delle Impostazioni o il primo collegato attivo.
//
// ⚠️ LA FINESTRA DELLE 24 ORE È DI META, NON NOSTRA: un messaggio di testo
// libero arriva solo se il cliente ha scritto a quel numero nelle ultime 24
// ore. Fuori finestra Meta risponde con un errore (re-engagement) e il
// messaggio NON parte: chi chiama deve mostrarlo, non riprovare a raffica.
// Per scrivere a freddo servono i template approvati da Meta (non ancora
// integrati) o il canale assistito (wa.me dal telefono dell'operatore).
export async function POST(req: NextRequest) {
  const client = await autentica(req, { scrittura: true })
  if (client instanceof NextResponse) return client

  let body: { a?: string; testo?: string; numeroId?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return erroreApi(400, 'Corpo non valido: serve un JSON')
  }

  const a = String(body.a ?? '').replace(/[^\d+]/g, '')
  const testo = String(body.testo ?? '').trim()
  if (!a || a.replace(/\D/g, '').length < 8) return erroreApi(400, 'Manca `a`: il numero del destinatario, con prefisso')
  if (!testo) return erroreApi(400, 'Manca `testo`')

  // Da quale nostro numero esce: quello chiesto, o il generale, o il primo attivo.
  let mittente = String(body.numeroId ?? '').trim()
  if (!mittente) {
    const { waPhoneNumberId } = await leggiImpostazioni(['waPhoneNumberId'])
    mittente = waPhoneNumberId || ''
  }
  if (!mittente) {
    const numeri = await numeriCollegati()
    mittente = numeri.find((n) => n.attivo)?.phoneNumberId ?? ''
  }
  if (!mittente) return erroreApi(503, 'Nessun numero WhatsApp collegato (pagina Numeri WhatsApp).')

  const token = await tokenPerNumero(mittente)
  if (!token) return erroreApi(503, 'WhatsApp non configurato: token mancante per questo numero (Impostazioni).')

  const esito = await inviaWhatsApp(token, mittente, a, testo)
  if (!esito.ok) return NextResponse.json(esito, { status: 422 })
  return NextResponse.json(esito, { headers: { 'Cache-Control': 'no-store' } })
}
