import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * Collega (o scollega) una conversazione a un ordine, **a mano**.
 *
 * L'aggancio automatico esiste già e funziona quando il cliente cita il numero,
 * scrive dalla stessa mail o dallo stesso numero di telefono. Ma quando scrive
 * «buongiorno, per la consegna di domani» da un indirizzo che non è quello
 * dell'ordine — che capita di continuo — l'aggancio non c'è, e chi risponde
 * deve cercarsi l'ordine ogni volta che riapre il thread.
 *
 * ⚠️ Si salva il NUMERO, non l'id: è la stessa chiave che usa l'aggancio
 * automatico (`Conversazione.ordineNumero`), e sopravvive al giorno in cui
 * l'ordine esce dalla copia locale dei 60 giorni — l'id no.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { numero } = (await req.json().catch(() => ({}))) as { numero?: string }

  const conversazione = await db.conversazione.findUnique({ where: { id }, select: { id: true } })
  if (!conversazione) {
    return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })
  }

  const pulito = (numero ?? '').trim()
  if (!pulito) {
    // Scollegare è una richiesta legittima: un aggancio sbagliato fa leggere la
    // conversazione col contesto di un altro cliente.
    const scollegata = await db.conversazione.update({
      where: { id },
      data: { ordineNumero: '' },
    })
    return NextResponse.json({ ordineNumero: scollegata.ordineNumero })
  }

  // ⚠️ Si accetta solo un numero che ESISTE fra i nostri ordini: un numero
  // scritto a mano e sbagliato non deve diventare un aggancio silenzioso a
  // niente. Si cerca nelle due forme, perché a mano il «#» non lo mette nessuno.
  const cifre = pulito.replace(/\D/g, '')
  const ordine = await db.ordine.findFirst({
    where: { OR: [{ numero: `#${cifre}` }, { numero: cifre }, { numero: pulito }] },
    select: { numero: true },
  })
  if (!ordine) {
    return NextResponse.json(
      { errore: `Nessun ordine ${pulito} fra quelli che teniamo qui (ultimi 60 giorni).` },
      { status: 404 }
    )
  }

  const aggiornata = await db.conversazione.update({
    where: { id },
    data: { ordineNumero: ordine.numero },
  })
  return NextResponse.json({ ordineNumero: aggiornata.ordineNumero })
}
