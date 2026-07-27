import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ricavaIstruzioni, type Proposta } from '@/lib/ai'
import { ambitoValido } from '@/lib/cs-ai'

export const dynamic = 'force-dynamic'
// Leggere trenta pagine e ricavarne delle regole richiede tempo al modello.
export const maxDuration = 120

// POST → l'AI legge il documento e PROPONE delle istruzioni. Non ne salva
// nessuna: le proposte tornano al browser e una persona sceglie.
export async function POST(req: NextRequest) {
  const { documentoId } = (await req.json().catch(() => ({}))) as { documentoId?: string }
  if (!documentoId) return NextResponse.json({ errore: 'Serve l’id del documento.' }, { status: 400 })

  const doc = await db.documentoAI.findUnique({
    where: { id: documentoId },
    include: { negozio: { select: { id: true, nome: true } } },
  })
  if (!doc) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 })

  const esito = await ricavaIstruzioni(doc.testo, doc.nome, doc.negozio)
  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Manca la chiave OpenAI (Impostazioni): senza, l’AI non può leggere il documento.' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') {
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }

  return NextResponse.json({
    proposte: esito.proposte,
    fornitore: esito.fornitore,
    // Un taglio silenzioso farebbe credere che il documento sia stato letto
    // tutto: chi approva le regole deve sapere fin dove ha guardato l'AI.
    avviso: esito.tagliato
      ? `Il documento è lungo: l’AI ha letto i primi ${(doc.testo.length - esito.tagliato).toLocaleString('it-IT')} caratteri su ${doc.testo.length.toLocaleString('it-IT')}. Le regole che stanno più avanti non sono state viste.`
      : '',
    vuoto: esito.proposte.length === 0,
  })
}

// PUT → salva le proposte che l'operatore ha scelto.
export async function PUT(req: NextRequest) {
  const { documentoId, proposte } = (await req.json().catch(() => ({}))) as {
    documentoId?: string
    proposte?: (Proposta & { ordine?: number })[]
  }
  if (!documentoId) return NextResponse.json({ errore: 'Serve l’id del documento.' }, { status: 400 })
  if (!Array.isArray(proposte) || !proposte.length) {
    return NextResponse.json({ errore: 'Nessuna istruzione selezionata.' }, { status: 400 })
  }

  const doc = await db.documentoAI.findUnique({ where: { id: documentoId } })
  if (!doc) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 })

  // Le istruzioni che ci sono già, per non creare doppioni se si preme due
  // volte «ricava» sullo stesso documento.
  const esistenti = new Set(
    (await db.istruzioneAI.findMany({ select: { titolo: true } })).map((i) =>
      i.titolo.trim().toLowerCase()
    )
  )

  // Le nuove vanno IN FONDO alla scaletta del prompt: le regole scritte a mano
  // dall'azienda sono già state pensate, quelle appena estratte no.
  const ultimo = await db.istruzioneAI.aggregate({ _max: { ordine: true } })
  let ordine = (ultimo._max.ordine ?? 0) + 10

  const create: string[] = []
  const saltate: string[] = []
  for (const p of proposte) {
    const titolo = (p.titolo ?? '').trim()
    const testo = (p.testo ?? '').trim()
    if (!titolo || !testo) continue
    if (esistenti.has(titolo.toLowerCase())) {
      saltate.push(titolo)
      continue
    }
    await db.istruzioneAI.create({
      data: {
        titolo,
        categoria: (p.categoria ?? '').trim() || 'Generale',
        testo,
        ambito: ambitoValido((p.ambito ?? '').trim()) ? p.ambito.trim() : 'tutti',
        // Il brand lo eredita dal documento: un manuale della pasticceria non
        // produce regole per i fiori.
        negozioId: doc.negozioId,
        documentoId: doc.id,
        ordine,
      },
    })
    esistenti.add(titolo.toLowerCase())
    create.push(titolo)
    ordine += 10
  }

  return NextResponse.json({
    aggiunte: create.length,
    saltate: saltate.length,
    titoliSaltati: saltate,
  })
}
