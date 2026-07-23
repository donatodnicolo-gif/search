import { NextResponse } from 'next/server'
import { autenticaApi } from '@/lib/apiAuth'
import { db } from '@/lib/db'
import { cercaEImporta } from '@/lib/sync'
import { recapitiCliente } from '@/lib/anagrafiche'
import type { Prisma } from '@prisma/client'

// GET /api/v1/messaggi?email=<contatto>&da=<ISO>&a=<ISO>&server=1&limite=30
// GET /api/v1/messaggi?cliente=<nome o id Anagrafiche>&q=<testo>&direzione=tutte
// GET /api/v1/messaggi?casella=1 → TUTTA la posta in arrivo dell'utente
//   (serve a Scout per le «Richieste Web»: le mail a commerciale@deluxy.it)
//
// Le mail di un CONTATTO (?email=) oppure di un intero CLIENTE (?cliente=): nel
// secondo caso si usa la stessa associazione mail↔cliente della sezione
// "Clienti" (indice di Anagrafiche: email esatte + domini non generici), così
// si trova tutta la posta dell'azienda senza sapere da quale casella scrive la
// persona. Finestra temporale di default: 30 giorni per contatto, 365 per cliente.
//
// Due modalità, così la scheda che chiama è veloce:
//   - senza server=1: solo il DB locale (risposta immediata);
//   - con server=1: prima cerca sul server IMAP e importa, poi risponde (lento,
//     va chiamato in background dopo aver già mostrato i risultati locali).
//   header: x-api-key: <API_TOKEN>   x-utente: <email utente AI Mail>
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = await autenticaApi(request)
  if (!auth.ok) return NextResponse.json({ ok: false, errore: auth.errore }, { status: auth.status })

  const url = new URL(request.url)
  const email = (url.searchParams.get('email') || '').trim().toLowerCase()
  const cliente = (url.searchParams.get('cliente') || '').trim()
  // Tutta la casella: nessun filtro sulla controparte. Utile a chi tratta la
  // posta in arrivo come una coda di richieste da lavorare.
  const casella = url.searchParams.get('casella') === '1'
  if (!email && !cliente && !casella) {
    return NextResponse.json(
      { ok: false, errore: 'Manca il parametro ?email=<contatto>, ?cliente=<nome o id> oppure ?casella=1.' },
      { status: 400 }
    )
  }
  const limite = Math.min(Math.max(parseInt(url.searchParams.get('limite') || '30', 10) || 30, 1), 100)
  const q = (url.searchParams.get('q') || '').trim()
  // di default solo la posta ricevuta; con direzione=tutte anche le nostre risposte
  const tutteLeDirezioni = url.searchParams.get('direzione') === 'tutte'

  // Se si cerca per cliente, gli indirizzi/domini arrivano dall'indice di Anagrafiche.
  let recapiti: { cliente: { id: string; nome: string }; email: string[]; domini: string[] } | null = null
  if (!email && !casella) {
    recapiti = await recapitiCliente(cliente).catch(() => null)
    if (!recapiti) {
      return NextResponse.json(
        {
          ok: false,
          errore: `Nessun cliente attivo in Anagrafiche corrispondente a "${cliente}" (o nessuna email associata).`,
        },
        { status: 404 }
      )
    }
  }

  // Finestra temporale: default 30 giorni per contatto, 365 per cliente.
  const parseData = (v: string | null): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  const giorniDefault = casella ? 30 : email ? 30 : 365
  const a = parseData(url.searchParams.get('a')) ?? new Date()
  const da = parseData(url.searchParams.get('da')) ?? new Date(a.getTime() - giorniDefault * 24 * 60 * 60 * 1000)

  // Chi è la controparte: un solo indirizzo (contatto) oppure tutti gli
  // indirizzi/domini del cliente. In uscita la controparte sta nei destinatari.
  const controparte: Prisma.MessaggioWhereInput[] = []
  const indirizzi = email ? [email] : recapiti ? recapiti.email : []
  const domini = email || !recapiti ? [] : recapiti.domini
  for (const e of indirizzi) {
    controparte.push({ mittente: { equals: e, mode: 'insensitive' } })
    if (tutteLeDirezioni) controparte.push({ destinatari: { contains: e, mode: 'insensitive' } })
  }
  for (const d of domini) {
    controparte.push({ mittente: { endsWith: `@${d}`, mode: 'insensitive' } })
    if (tutteLeDirezioni) controparte.push({ destinatari: { contains: `@${d}`, mode: 'insensitive' } })
  }

  const where: Prisma.MessaggioWhereInput = {
    utenteId: auth.utenteId,
    cestinato: false,
    ...(tutteLeDirezioni ? {} : { direzione: 'entrata' }),
    data: { gte: da, lte: a },
    // Con ?casella=1 non si filtra la controparte: si vuole tutta la posta.
    ...(controparte.length ? { OR: controparte } : {}),
    ...(casella ? { NOT: { sezione: { nome: 'SPAM' } }, archiviato: false } : {}),
    // il filtro testo è un AND separato: non deve allargare l'OR sulla controparte
    ...(q
      ? {
          AND: [
            {
              OR: [
                { oggetto: { contains: q, mode: 'insensitive' as const } },
                { anteprima: { contains: q, mode: 'insensitive' as const } },
                { mittenteNome: { contains: q, mode: 'insensitive' as const } },
                { mittente: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          ],
        }
      : {}),
  }

  const query = () =>
    db.messaggio.findMany({
      where,
      orderBy: { data: 'desc' },
      take: limite,
      select: {
        id: true, messageId: true, mittente: true, mittenteNome: true, oggetto: true, direzione: true,
        data: true, anteprima: true, letto: true, allegati: true,
      },
    })

  // La ricerca sul server IMAP (lenta) solo se richiesta esplicitamente. Per un
  // cliente con molti indirizzi ci si ferma ai primi 5, per non sforare il tempo
  // massimo della funzione.
  let cercatoSulServer = false
  if (url.searchParams.get('server') === '1') {
    cercatoSulServer = true
    for (const e of indirizzi.slice(0, 5)) {
      await cercaEImporta(auth.utenteId, e).catch(() => {})
    }
  }

  const righe = await query()
  return NextResponse.json({
    ok: true,
    contatto: email || null,
    cliente: recapiti ? recapiti.cliente : null,
    recapiti: recapiti ? { email: recapiti.email, domini: recapiti.domini } : null,
    da: da.toISOString(),
    a: a.toISOString(),
    cercatoSulServer,
    messaggi: righe.map((m) => ({
      id: m.id,
      messageId: m.messageId,
      da: m.mittenteNome || m.mittente,
      email: m.mittente,
      oggetto: m.oggetto,
      data: m.data,
      direzione: m.direzione,
      anteprima: m.anteprima,
      letto: m.letto,
      allegati: m.allegati,
    })),
  })
}
