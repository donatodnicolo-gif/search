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
  // ?ordine=<riferimento> — la posta che parla di UN ordine (vedi sotto).
  const ordine = (url.searchParams.get('ordine') || '').trim()
  if (ordine) return await mailPerOrdine(auth.utenteId, ordine, url)
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

// ---------- La posta di un ORDINE ----------

/**
 * Le mail che parlano di un ordine: `GET /api/v1/messaggi?ordine=2529`.
 *
 * A cosa serve: le altre app (deluxy-orders, Partner) hanno il numero d'ordine
 * e vogliono mostrare «la posta di questo ordine» senza sapere chi ha scritto.
 *
 * ⚠️ Il problema vero è il RUMORE: cercare «2529» dentro i corpi prende anche
 * importi, altri codici, numeri di telefono. Quindi:
 *  1. si cerca il riferimento normalizzato (senza «#») in oggetto e corpo;
 *  2. si scartano in codice i match che NON sono un token isolato (così «2529»
 *     non aggancia «112529») — il confine è sulle cifre, perché «106654/26» ha
 *     dentro una barra e deve restare valido;
 *  3. si distingue dove è stato trovato: nell'OGGETTO è quasi sempre l'ordine
 *     giusto, nel CORPO conta solo se accanto c'è una parola come «ordine»,
 *     «order», «rif», «#». Le altre si tengono ma marcate `sicuro: false`,
 *     così chi chiama decide se mostrarle.
 * I risultati sicuri e quelli con match nell'oggetto vengono per primi.
 */
async function mailPerOrdine(utenteId: string, riferimento: string, url: URL) {
  const rif = riferimento.replace(/^#/, '').trim()
  if (rif.length < 2) {
    return NextResponse.json(
      { ok: false, errore: 'Riferimento ordine troppo corto: servono almeno 2 caratteri.' },
      { status: 400 }
    )
  }

  const limite = Math.min(Math.max(parseInt(url.searchParams.get('limite') || '30', 10) || 30, 1), 100)
  // Di default si guarda indietro un anno: un ordine vecchio ha comunque la sua posta.
  const giorni = Math.min(Math.max(parseInt(url.searchParams.get('giorni') || '365', 10) || 365, 1), 3650)
  const da = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000)
  // Di default TUTTE le direzioni: di un ordine interessa anche cosa abbiamo risposto.
  const soloRicevute = url.searchParams.get('direzione') === 'entrata'

  const candidati = await db.messaggio.findMany({
    where: {
      utenteId,
      cestinato: false,
      data: { gte: da },
      ...(soloRicevute ? { direzione: 'entrata' } : {}),
      OR: [
        { oggetto: { contains: rif, mode: 'insensitive' } },
        { corpoTesto: { contains: rif, mode: 'insensitive' } },
      ],
    },
    orderBy: { data: 'desc' },
    take: Math.min(limite * 3, 150), // margine per il filtro qui sotto
    select: {
      id: true, messageId: true, mittente: true, mittenteNome: true, destinatari: true,
      oggetto: true, corpoTesto: true, direzione: true, data: true, anteprima: true,
      letto: true, allegati: true,
    },
  })

  const esc = rif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Token isolato: niente cifre attaccate prima/dopo (evita 112529 per 2529).
  const isolato = new RegExp(`(?<!\\d)${esc}(?!\\d)`, 'i')
  // Nel corpo serve un indizio vicino: «ordine 2529», «#2529», «rif. 2529»…
  const conContesto = new RegExp(
    `(?:ordine|order|ord\\.?|rif\\.?|riferimento|n\\.?|#)\\s*#?\\s*${esc}(?!\\d)`,
    'i'
  )

  const trovate = candidati
    .map((m) => {
      const inOggetto = isolato.test(m.oggetto || '')
      const corpo = m.corpoTesto || ''
      const inCorpo = isolato.test(corpo)
      if (!inOggetto && !inCorpo) return null // match solo dentro un numero più lungo
      const sicuro = inOggetto || conContesto.test(corpo)
      return {
        id: m.id,
        messageId: m.messageId,
        da: m.mittenteNome || m.mittente,
        email: m.mittente,
        destinatari: m.destinatari,
        oggetto: m.oggetto,
        data: m.data,
        direzione: m.direzione,
        anteprima: m.anteprima,
        letto: m.letto,
        allegati: m.allegati,
        dove: inOggetto ? 'oggetto' : 'corpo',
        /** false = il numero c'è ma senza indizi che sia un ordine: valutalo tu. */
        sicuro,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Prima i sicuri, poi i match nell'oggetto, poi i più recenti.
    .sort(
      (a, b) =>
        Number(b.sicuro) - Number(a.sicuro) ||
        Number(b.dove === 'oggetto') - Number(a.dove === 'oggetto') ||
        b.data.getTime() - a.data.getTime()
    )
    .slice(0, limite)

  return NextResponse.json({
    ok: true,
    ordine: rif,
    da: da.toISOString(),
    quanti: trovate.length,
    // Quante hanno indizi certi (oggetto o parola-chiave vicino al numero).
    sicuri: trovate.filter((m) => m.sicuro).length,
    messaggi: trovate,
  })
}
