import { NextRequest, NextResponse } from 'next/server'
import { mandaInApp, prefillInApp } from '@/lib/manda-in-app'
import { partnerPiattaforma, serviziPiattaforma } from '@/lib/piattaforma'
import { utenteCorrente } from '@/lib/sessione'
import type { NuovaConsegna } from '@/lib/piattaforma'

export const dynamic = 'force-dynamic'
// Due chiamate alla piattaforma (vendita + creazione): i 10 secondi non bastano.
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// MANDARE L'ORDINE «IN APP».
//
//   GET  → il modulo già riempito con quello che sappiamo, più il catalogo dei
//          servizi della piattaforma (la tendina).
//   POST → crea la consegna di là e porta l'ordine nello stato «In App».
export async function GET(_req: NextRequest, { params }: Params) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params

  // ⚠️ In parallelo: sono tre chiamate a due app diverse, e in fila chi apre
  // il modulo aspetterebbe la somma invece della piu lenta.
  const [dati, servizi, partner] = await Promise.all([
    prefillInApp(id),
    serviziPiattaforma(),
    partnerPiattaforma(),
  ])
  if (!dati) return NextResponse.json({ errore: 'Ordine non trovato.' }, { status: 404 })

  return NextResponse.json({
    ...dati,
    // ⚠️ Il catalogo arriva dalla piattaforma e non da una lista nostra: i tipi
    // di servizio sono suoi, e una copia qui diventerebbe vecchia il giorno in
    // cui ne aggiungono uno — con l'operatore che sceglie un servizio che di là
    // non esiste più.
    servizi: servizi.stato === 'ok' ? servizi.dati : [],
    // ⚠️ L'elenco dei partner arriva dalla piattaforma, che e la loro casa: una
    // copia qui sarebbe vecchia il giorno che ne aggiungono uno o ne spengono
    // un altro, e si sceglierebbe un partner che di la non riceve piu niente.
    partner: partner.stato === 'ok' ? partner.dati : [],
    serviziErrore:
      servizi.stato === 'errore'
        ? servizi.messaggio
        : servizi.stato === 'non-configurato'
          ? 'Chiave della piattaforma non configurata (Impostazioni).'
          : '',
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const campi = (await req.json().catch(() => ({}))) as NuovaConsegna

  const esito = await mandaInApp(id, campi, { id: io.id, nome: io.nome })
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
  return NextResponse.json(esito)
}
