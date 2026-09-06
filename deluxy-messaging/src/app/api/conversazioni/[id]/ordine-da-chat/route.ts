import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { estraiOrdineDaChat } from '@/lib/ai'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// I campi del NUOVO ORDINE letti dalla conversazione (utente, 06/09/2026:
// «riempi automaticamente grazie all'AI anche quando da una chat si clicca su
// Nuovo ordine»). Non salva niente: è una proposta per il modulo, ogni campo
// con la frase da cui viene. Chi compila controlla e crea.
export async function POST(_req: NextRequest, { params }: Params) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const c = await db.conversazione.findUnique({ where: { id }, select: { id: true } })
  if (!c) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })
  const messaggi = await db.messaggio.findMany({
    where: { conversazioneId: id },
    orderBy: { creatoIl: 'asc' },
    take: 5000,
    select: { direzione: true, testo: true, creatoIl: true },
  })
  const esito = await estraiOrdineDaChat(messaggi)
  if (esito.stato === 'non-configurato') {
    return NextResponse.json({ errore: 'Compilazione automatica non attiva: manca la chiave OpenAI (Impostazioni).' }, { status: 400 })
  }
  if (esito.stato === 'errore') return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  return NextResponse.json({ ordine: esito.ordine, fornitore: esito.fornitore })
}
