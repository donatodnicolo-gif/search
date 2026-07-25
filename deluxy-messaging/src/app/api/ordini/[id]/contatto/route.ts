import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { googleAccessToken, salvaContattoOrdine } from '@/lib/contatti'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Salva il contatto di un singolo ordine su Google Contacts.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const ordine = await db.ordine.findUnique({ where: { id } })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })
  if (!ordine.telefono && !ordine.email) {
    return NextResponse.json({ errore: "L'ordine non ha né telefono né email." }, { status: 400 })
  }

  const token = await googleAccessToken().catch(() => null)
  if (!token) {
    return NextResponse.json(
      { errore: 'Google Contacts non collegato (Impostazioni → Collega Google).' },
      { status: 400 }
    )
  }

  try {
    const testo = await salvaContattoOrdine(token, ordine)
    const aggiornato = await db.ordine.update({
      where: { id },
      data: { contattoSalvato: true, contattoEsito: testo },
    })
    return NextResponse.json({ esito: testo, ordine: aggiornato })
  } catch (e) {
    const messaggio = (e as Error).message
    await db.ordine.update({ where: { id }, data: { contattoEsito: 'Errore: ' + messaggio } })
    return NextResponse.json({ errore: messaggio }, { status: 502 })
  }
}
