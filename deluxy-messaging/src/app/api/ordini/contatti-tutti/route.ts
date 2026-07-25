import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { googleAccessToken, salvaContatto } from '@/lib/contatti'

export const dynamic = 'force-dynamic'

// Salva su Google Contacts tutti gli ordini non ancora salvati che hanno un
// telefono. Un access token solo per l'intero giro.
export async function POST() {
  const token = await googleAccessToken().catch(() => null)
  if (!token) {
    return NextResponse.json(
      { errore: 'Google Contacts non collegato (Impostazioni → Collega Google).' },
      { status: 400 }
    )
  }

  const daFare = await db.ordine.findMany({
    where: { contattoSalvato: false, telefono: { not: '' } },
    orderBy: { data: 'desc' },
    take: 100, // tetto per stare nei tempi di una funzione serverless
  })

  let aggiunti = 0
  let presenti = 0
  let errori = 0
  for (const ordine of daFare) {
    try {
      const esito = await salvaContatto(token, ordine)
      await db.ordine.update({
        where: { id: ordine.id },
        data: { contattoSalvato: true, contattoEsito: esito.testo },
      })
      if (esito.fase === 'aggiunto') aggiunti++
      else presenti++
    } catch (e) {
      errori++
      await db.ordine.update({
        where: { id: ordine.id },
        data: { contattoEsito: 'Errore: ' + (e as Error).message },
      })
    }
  }

  return NextResponse.json({ elaborati: daFare.length, aggiunti, presenti, errori })
}
