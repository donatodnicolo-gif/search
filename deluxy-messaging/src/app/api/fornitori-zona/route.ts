import { NextRequest, NextResponse } from 'next/server'
import { fornitoriInZona, mestierePerNegozio, type Mestiere } from '@/lib/fornitori-zona'

export const dynamic = 'force-dynamic'

// I fornitori del registro Anagrafiche che stanno nella provincia di consegna.
//
// Passa di qui e non dal browser perché la chiave del registro non deve mai
// uscire dal server (stessa regola di /api/partner).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const provincia = (p.get('provincia') ?? '').trim()
  const negozio = (p.get('negozio') ?? '').trim()
  const mestiereChiesto = (p.get('mestiere') ?? '').trim()

  if (!provincia) {
    // Senza provincia non si indovina: un elenco «nazionale» proporrebbe
    // fornitori a 400 km e la lista smetterebbe di voler dire qualcosa.
    return NextResponse.json({
      fornitori: [],
      provincia: '',
      nota: 'Provincia di consegna non nota.',
    })
  }

  const mestiere: Mestiere | null =
    mestiereChiesto === 'pasticceria' || mestiereChiesto === 'fioraio'
      ? mestiereChiesto
      : mestierePerNegozio(negozio)

  const esito = await fornitoriInZona(provincia, mestiere)
  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Registro Anagrafiche non collegato: metti URL e chiave in Impostazioni.' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') return NextResponse.json({ errore: esito.messaggio }, { status: 502 })

  return NextResponse.json({
    provincia: esito.provincia,
    mestiere: mestiere ?? '',
    fornitori: esito.fornitori.map((f) => ({
      id: f.id,
      nome: f.nome || f.ragioneSociale,
      categoria: f.categoria,
      citta: f.citta,
      indirizzo: f.indirizzo,
      telefono: f.telefonoUtile,
      email: f.emailUtile,
      recapitoDa: f.recapitoDa,
    })),
  })
}
