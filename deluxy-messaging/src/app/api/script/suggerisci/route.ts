import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { suggerisciRisposta } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Dato il messaggio di un cliente, propone la risposta scegliendo fra gli
// script attivi. Può rispondere "nessuno adatto": è un esito valido.
export async function POST(req: NextRequest) {
  const { messaggio, conversazioneId, contesto, negozioId, ordineId } = (await req
    .json()
    .catch(() => ({}))) as {
    messaggio?: string
    conversazioneId?: string
    // 'chat' | 'email': decide quali istruzioni CS AI valgono. A una chat e a
    // una mail si scrive in modo diverso.
    contesto?: string
    // Il BRAND per cui si scrive: o esplicito, o dedotto dall'ordine.
    negozioId?: string
    ordineId?: string
  }

  // Se arriva l'id della conversazione, si prende da lì l'ultimo messaggio
  // ricevuto: l'operatore non deve copiarlo a mano.
  let testo = (messaggio ?? '').trim()
  if (!testo && conversazioneId) {
    const ultimo = await db.messaggio.findFirst({
      where: { conversazioneId, direzione: 'in' },
      orderBy: { creatoIl: 'desc' },
    })
    testo = ultimo?.testo?.trim() ?? ''
  }
  if (!testo) {
    return NextResponse.json({ errore: 'Nessun messaggio del cliente da cui partire.' }, { status: 400 })
  }

  const script = await db.script.findMany({
    where: { attivo: true },
    select: { id: true, titolo: true, categoria: true, testo: true, quando: true },
    orderBy: { usi: 'desc' },
    take: 60, // tetto: oltre, il prompt diventa enorme e la scelta peggiora
  })

  // Il brand: esplicito se il chiamante lo sa, altrimenti quello dell'ordine.
  // Se non si arriva a nessuno dei due resta null, e valgono le sole regole
  // generali — scrivere col tono del brand sbagliato è peggio che scrivere con
  // quello neutro dell'azienda.
  let brand: { id: string; nome: string } | null = null
  const idBrand =
    negozioId?.trim() ||
    (ordineId
      ? (await db.ordine.findUnique({ where: { id: ordineId }, select: { negozioId: true } }))
          ?.negozioId ?? ''
      : '')
  if (idBrand) {
    brand = await db.negozioShopify.findUnique({
      where: { id: idBrand },
      select: { id: true, nome: true },
    })
  }

  // Default 'chat': è da dove arriva quasi sempre la richiesta.
  const esito = await suggerisciRisposta(
    testo,
    script,
    contesto === 'email' ? 'email' : 'chat',
    brand
  )
  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Risposte rapide non attive: manca la chiave OpenAI (Impostazioni).' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') {
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }

  // Lo script scelto sale nella classifica: i più usati vengono proposti prima.
  if (esito.suggerimento) {
    await db.script.update({
      where: { id: esito.suggerimento.scriptId },
      data: { usi: { increment: 1 } },
    })
  }

  return NextResponse.json({
    suggerimento: esito.suggerimento,
    fornitore: esito.fornitore,
    messaggioUsato: testo.slice(0, 300),
  })
}
