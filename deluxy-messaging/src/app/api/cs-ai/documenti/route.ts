import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  estraiTesto,
  DocumentoIllegibile,
  LIMITE_BYTE,
  assaggio,
  FORMATI,
} from '@/lib/documenti-ai'

export const dynamic = 'force-dynamic'
// L'estrazione da un PDF di cento pagine non è istantanea.
export const maxDuration = 60

// I documenti da cui l'AI ricava le istruzioni. Si salva il TESTO estratto, non
// il file: quello che serve all'AI è il testo, e i binari nel Postgres condiviso
// con le altre app sono peso che non ripaga.

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')

  // Con l'id si vuole leggere il documento intero; senza, l'elenco.
  if (id) {
    const d = await db.documentoAI.findUnique({
      where: { id },
      include: {
        negozio: { select: { id: true, nome: true } },
        istruzioni: { select: { id: true, titolo: true } },
      },
    })
    if (!d) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 })
    return NextResponse.json({ documento: d })
  }

  const righe = await db.documentoAI.findMany({
    orderBy: { creatoIl: 'desc' },
    include: {
      negozio: { select: { id: true, nome: true } },
      _count: { select: { istruzioni: true } },
    },
    // Il testo intero NON esce nell'elenco: dieci manuali sono megabyte per
    // disegnare una tabella di dieci righe.
    omit: { testo: true },
  })

  // L'estratto e la lunghezza si chiedono a Postgres, che li calcola sulla
  // colonna senza spedirla: rileggere i testi qui per tagliarli a 240 caratteri
  // rimetterebbe in rete tutto quello che l'omit ha appena tolto.
  const misure = await db.$queryRaw<{ id: string; assaggio: string; caratteri: number }[]>`
    SELECT id, left(testo, 400) AS assaggio, length(testo)::int AS caratteri
    FROM "DocumentoAI"
  `
  const perId = new Map(misure.map((m) => [m.id, m]))

  return NextResponse.json({
    documenti: righe.map((d) => ({
      ...d,
      caratteri: perId.get(d.id)?.caratteri ?? 0,
      assaggio: assaggio(perId.get(d.id)?.assaggio ?? ''),
    })),
  })
}

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ errore: 'Caricamento non riuscito.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ errore: 'Nessun file caricato.' }, { status: 400 })
  }
  if (file.size > LIMITE_BYTE) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return NextResponse.json(
      {
        errore: `Il file pesa ${mb} MB: il limite è 4 MB. Se è un PDF pieno di immagini, ne basta la parte scritta.`,
      },
      { status: 400 }
    )
  }

  const negozioId = (form.get('negozioId') as string | null)?.trim() || null
  const nota = ((form.get('nota') as string | null) ?? '').trim()

  let estratto
  try {
    estratto = await estraiTesto(file.name, file.type, await file.arrayBuffer())
  } catch (e) {
    // Un documento illeggibile è un caso previsto e va spiegato: «errore» e
    // basta manda l'operatore a cercare un guasto che non c'è.
    if (e instanceof DocumentoIllegibile) {
      return NextResponse.json({ errore: e.message }, { status: 400 })
    }
    return NextResponse.json(
      { errore: `Non sono riuscito a leggere il file (${(e as Error).message}). Formati: ${FORMATI.join(', ')}.` },
      { status: 400 }
    )
  }

  const documento = await db.documentoAI.create({
    data: {
      nome: file.name,
      tipo: file.type || '',
      dimensione: file.size,
      testo: estratto.testo,
      pagine: estratto.pagine,
      negozioId,
      nota,
    },
    include: { negozio: { select: { id: true, nome: true } } },
  })

  return NextResponse.json({
    documento: { ...documento, testo: undefined, caratteri: estratto.testo.length },
    avviso: estratto.avviso,
  })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })

  // Le istruzioni ricavate dal documento NON si cancellano con lui: sono state
  // approvate da una persona e vivono di vita propria. Perdono solo il rimando
  // alla fonte (onDelete: SetNull nello schema), e lo si dice.
  const quante = await db.istruzioneAI.count({ where: { documentoId: id } })
  await db.documentoAI.delete({ where: { id } })
  return NextResponse.json({
    ok: true,
    istruzioniRimaste: quante,
    avviso: quante
      ? `${quante} istruzion${quante === 1 ? 'e' : 'i'} ricavate da questo documento restano attive: perdono solo il rimando alla fonte.`
      : '',
  })
}
