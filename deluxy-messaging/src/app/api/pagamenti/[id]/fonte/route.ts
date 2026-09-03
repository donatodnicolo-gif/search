import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { TIPI_RICEVUTA, nomeFileRicevuta } from '@/lib/metodo-pagamento'

export const dynamic = 'force-dynamic'

// RIPRENDERE LA FOTO DA CUI L'AI HA LETTO LA RICHIESTA.
//
// ⚠️⚠️ Chiesto dall'utente il 02/09/2026. Serve quando l'IBAN non torna, o
// quando il fornitore dice «io ti avevo scritto un'altra cifra»: si rilegge
// l'originale, invece di fidarsi di quello che l'AI ne aveva capito.
//
// Stesse regole della ricevuta, e per gli stessi motivi:
// · i byte NON escono nell'elenco (la GET dei pagamenti ha un select esplicito),
//   quindi il file si chiede uno per volta;
// · serve la sessione — dentro c'è un IBAN, un nome e spesso un'intera chat;
// · il `Content-Type` esce dalla NOSTRA lista e mai dal campo del database, e
//   si scarica come allegato con `nosniff`: un tipo scelto da chi ha caricato è
//   la strada per farsi servire uno script dal nostro dominio.
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const r = await db.richiestaPagamento.findUnique({
    where: { id },
    select: {
      fonteDati: true,
      fonteNome: true,
      fonteTipo: true,
      causale: true,
      ordineNumero: true,
      intestatario: true,
      origine: true,
      creatoIl: true,
    },
  })
  if (!r) return NextResponse.json({ errore: 'Richiesta non trovata.' }, { status: 404 })
  if (!r.fonteDati) {
    // ⚠️ Si distingue «non c'è più» da «non c'è mai stata»: le richieste create
    // prima del 02/09/2026 sono state lette da una foto che allora si buttava.
    // Dire «questa richiesta non ha una foto» a chi sa di averla caricata
    // sembra un guasto o una bugia.
    const vecchia = r.origine === 'immagine'
    return NextResponse.json(
      {
        errore: vecchia
          ? `Questa richiesta è stata letta da un’immagine il ${r.creatoIl.toLocaleDateString('it-IT')}, ma allora il file non veniva conservato: si tiene solo dalle richieste nuove.`
          : 'Questa richiesta non è stata letta da un’immagine.',
      },
      { status: 404 }
    )
  }

  const virgola = r.fonteDati.indexOf(',')
  const base64 = virgola >= 0 ? r.fonteDati.slice(virgola + 1) : r.fonteDati
  let byte: Buffer
  try {
    byte = Buffer.from(base64, 'base64')
  } catch {
    return NextResponse.json({ errore: 'Il file è illeggibile.' }, { status: 500 })
  }
  if (!byte.length) return NextResponse.json({ errore: 'Il file è vuoto.' }, { status: 500 })

  const tipo = TIPI_RICEVUTA.includes(r.fonteTipo) ? r.fonteTipo : 'application/octet-stream'
  const nome = nomeFileRicevuta(r.fonteNome, r.causale, tipo, {
    ordineNumero: r.ordineNumero,
    intestatario: r.intestatario,
  })

  return new NextResponse(new Uint8Array(byte), {
    headers: {
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nome}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
