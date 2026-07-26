import { NextRequest, NextResponse } from 'next/server'
import { partnerAttivi } from '@/lib/anagrafiche'

export const dynamic = 'force-dynamic'

// I partner attivi, letti dal registro Anagrafiche. Passa di qui e non dal
// browser perché la chiave del registro non deve mai uscire dal server.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const esito = await partnerAttivi({
    q: p.get('q') ?? '',
    categoria: p.get('categoria') ?? '',
    citta: p.get('citta') ?? '',
  })

  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Registro Anagrafiche non collegato: metti URL e chiave in Impostazioni.' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') {
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }

  return NextResponse.json({
    totale: esito.totale,
    partner: esito.partner,
    categorie: esito.categorie,
    citta: esito.citta,
  })
}
