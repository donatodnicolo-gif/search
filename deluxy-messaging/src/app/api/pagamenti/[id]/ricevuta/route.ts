import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { TIPI_RICEVUTA, nomeFileRicevuta } from '@/lib/metodo-pagamento'

export const dynamic = 'force-dynamic'

// SCARICARE LA RICEVUTA DI UN PAGAMENTO.
//
// ⚠️ Perché una rotta a parte: i byte della ricevuta **non escono nell'elenco**
// (la GET dei pagamenti ha un `select` esplicito che li lascia fuori). Senza
// quella scelta, ogni caricamento della pagina si porterebbe dietro le ricevute
// di tutte le righe — duecento file — per mostrare una tabella che di quel file
// usa solo il nome. Quindi il file si chiede quando serve, uno per volta.
//
// ⚠️ Serve la sessione: è la prova di un pagamento nostro, con l'intestatario e
// spesso l'IBAN in chiaro nell'immagine.

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const r = await db.richiestaPagamento.findUnique({
    where: { id },
    select: {
      ricevutaDati: true,
      ricevutaNome: true,
      ricevutaTipo: true,
      causale: true,
      ordineNumero: true,
      intestatario: true,
    },
  })
  if (!r) return NextResponse.json({ errore: 'Richiesta non trovata.' }, { status: 404 })
  if (!r.ricevutaDati) {
    // ⚠️ Si dice che la ricevuta NON C'È, invece di mandare un file vuoto: un
    // download da zero byte fa credere a un guasto del computer di chi scarica.
    return NextResponse.json({ errore: 'Questo pagamento non ha una ricevuta.' }, { status: 404 })
  }

  // I dati sono un data URI: `data:image/png;base64,XXXX`.
  const virgola = r.ricevutaDati.indexOf(',')
  const base64 = virgola >= 0 ? r.ricevutaDati.slice(virgola + 1) : r.ricevutaDati
  let byte: Buffer
  try {
    byte = Buffer.from(base64, 'base64')
  } catch {
    return NextResponse.json({ errore: 'La ricevuta è illeggibile.' }, { status: 500 })
  }
  if (!byte.length) {
    return NextResponse.json({ errore: 'La ricevuta è vuota.' }, { status: 500 })
  }

  // ⚠️⚠️ IL TIPO SI PRENDE DALLA NOSTRA LISTA, non dal database. È vero che al
  // caricamento era già stato controllato, ma un `Content-Type` che arriva da un
  // campo scrivibile è la strada con cui si fa servire `text/html` dal NOSTRO
  // dominio — cioè uno script che gira con la sessione di chi scarica. Se il
  // tipo salvato non è fra quelli che accettiamo, si scarica come file generico.
  const tipo = TIPI_RICEVUTA.includes(r.ricevutaTipo) ? r.ricevutaTipo : 'application/octet-stream'
  // ⚠️ Ordine e intestatario servono al nome: le ricevute incollate si
  // chiamano tutte uguali (vedi nomeFileRicevuta), e tre file identici nella
  // cartella dei download non sono tre prove, sono un indovinello.
  const nome = nomeFileRicevuta(r.ricevutaNome, r.causale, tipo, {
    ordineNumero: r.ordineNumero,
    intestatario: r.intestatario,
  })

  return new NextResponse(new Uint8Array(byte), {
    headers: {
      'Content-Type': tipo,
      // ⚠️ `attachment` e non `inline`: si scarica, non si apre dentro l'app.
      // Con `inline` un file di un tipo inatteso verrebbe interpretato dal
      // browser nel nostro dominio, ed è esattamente quello che non si vuole.
      'Content-Disposition': `attachment; filename="${nome}"`,
      // ⚠️ Vieta al browser di indovinare il tipo guardando i primi byte: senza,
      // il `Content-Type` prudente qui sopra non servirebbe a niente.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
