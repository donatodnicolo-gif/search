import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { avvisaAmministratore, codiceDa } from '@/lib/aiuto-whatsapp'

export const dynamic = 'force-dynamic'

// Le richieste d'aiuto: si scrivono dal pannello laterale, si continuano lì o
// da WhatsApp, e restano scritte.
//
// ⚠️⚠️ **È uno SCAMBIO, non una domanda sola.** La prima versione aveva una
// domanda e una risposta, e si è rotta al primo uso vero: l'amministratore ha
// risposto «cosa hai bisogno?» e chi aveva chiesto non poteva continuare.
//
// ⚠️ Non c'è un ruolo per CHIEDERE: chiunque lavori può bloccarsi. C'è per
// vedere le richieste degli altri: quelle sono di chi coordina.

type MessaggioDto = {
  id: string
  autore: string
  autoreNome: string
  testo: string
  viaWhatsApp: boolean
  avvisoEsito: string
  creatoIl: string
}

type DomandaDto = {
  id: string
  testo: string
  pagina: string
  ordineNumero: string
  conversazioneId: string
  utenteNome: string
  mia: boolean
  stato: string
  avvisoEsito: string
  codice: string
  messaggi: MessaggioDto[]
  /** Chi ha scritto per ultimo: `operatore` o `admin`. Decide di chi è la palla. */
  ultimoAutore: string
  lettaIl: string | null
  creatoIl: string
}

async function elenco(ioId: string, amministratore: boolean) {
  const righe = await db.domandaAiuto.findMany({
    where: amministratore ? {} : { utenteId: ioId },
    orderBy: [{ stato: 'asc' }, { creatoIl: 'desc' }],
    take: 100,
    include: { messaggi: { orderBy: { creatoIl: 'asc' } } },
  })

  const domande: DomandaDto[] = righe.map((d) => {
    const messaggi = d.messaggi.map((m) => ({
      id: m.id,
      autore: m.autore,
      autoreNome: m.autoreNome,
      testo: m.testo,
      viaWhatsApp: m.viaWhatsApp,
      avvisoEsito: m.avvisoEsito,
      creatoIl: m.creatoIl.toISOString(),
    }))
    return {
      id: d.id,
      testo: d.testo,
      pagina: d.pagina,
      ordineNumero: d.ordineNumero,
      conversazioneId: d.conversazioneId,
      utenteNome: d.utenteNome,
      mia: d.utenteId === ioId,
      stato: d.stato,
      avvisoEsito: d.avvisoEsito,
      codice: d.codice,
      messaggi,
      // ⚠️ La prima riga è sempre di chi ha chiesto: se non c'è nessun
      // messaggio dopo, la palla è ancora dell'amministratore.
      ultimoAutore: messaggi.length ? messaggi[messaggi.length - 1].autore : 'operatore',
      lettaIl: d.lettaIl?.toISOString() ?? null,
      creatoIl: d.creatoIl.toISOString(),
    }
  })

  // I due numeri della linguetta, e sono due cose diverse:
  // · l'amministratore deve sapere quante richieste **aspettano lui** — cioè
  //   quelle aperte in cui l'ultima parola è di un operatore;
  // · chi ha chiesto deve sapere che **gli hanno risposto**, anche se nel
  //   frattempo è andato su un'altra pagina.
  const daRispondere = amministratore
    ? domande.filter((d) => d.stato === 'aperta' && d.ultimoAutore === 'operatore').length
    : 0
  const risposteDaLeggere = domande.filter(
    (d) => d.mia && d.ultimoAutore === 'admin' && !d.lettaIl
  ).length

  return { domande, daRispondere, risposteDaLeggere, amministratore }
}

export async function GET() {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  return NextResponse.json(await elenco(io.id, io.ruolo === 'admin'))
}

type Corpo = {
  azione?: 'chiedi' | 'scrivi' | 'letta' | 'chiudi' | 'riapri'
  id?: string
  testo?: string
  pagina?: string
  ordineNumero?: string
  conversazioneId?: string
}

export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as Corpo
  const amministratore = io.ruolo === 'admin'

  // ── Continuare lo scambio ──
  //
  // ⚠️ Scrivono tutti e due: chi ha chiesto e chi risponde. È il punto di
  // questa modifica — «cosa hai bisogno?» dev'essere una domanda a cui si può
  // rispondere, non un vicolo cieco.
  if (c.azione === 'scrivi') {
    const testo = (c.testo ?? '').trim()
    if (!c.id || !testo) return NextResponse.json({ errore: 'Scrivi qualcosa.' }, { status: 400 })
    const d = await db.domandaAiuto.findUnique({ where: { id: c.id } })
    if (!d) return NextResponse.json({ errore: 'Richiesta non trovata.' }, { status: 404 })
    // ⚠️ Un operatore scrive solo nelle proprie: intromettersi nello scambio di
    // un collega non è aiutare, è confondere chi risponde.
    if (!amministratore && d.utenteId !== io.id) {
      return NextResponse.json({ errore: 'Non è una tua richiesta.' }, { status: 403 })
    }

    await db.messaggioAiuto.create({
      data: {
        domandaId: d.id,
        autore: amministratore ? 'admin' : 'operatore',
        autoreNome: io.nome,
        testo,
      },
    })
    // ⚠️ Chi ha chiesto deve rileggere: una risposta nuova azzera «letta».
    // E una richiesta chiusa che riceve un messaggio si RIAPRE — se qualcuno
    // scrive ancora, evidentemente chiusa non era.
    await db.domandaAiuto.updateMany({
      where: { id: d.id },
      data: { lettaIl: amministratore ? null : d.lettaIl, stato: 'aperta' },
    })

    // ⚠️ Se scrive un operatore, l'amministratore va avvisato su WhatsApp come
    // per la prima domanda: se no la seconda riga dello scambio resta lì e
    // nessuno la vede — che è esattamente il difetto che stiamo togliendo.
    if (!amministratore) await avvisaAmministratore(d.id, testo)

    return NextResponse.json(await elenco(io.id, amministratore))
  }

  // ── Chiudere / riaprire ──
  if (c.azione === 'chiudi' || c.azione === 'riapri') {
    if (!c.id) return NextResponse.json({ errore: 'Manca l’id.' }, { status: 400 })
    const d = await db.domandaAiuto.findUnique({ where: { id: c.id } })
    if (!d) return NextResponse.json({ errore: 'Richiesta non trovata.' }, { status: 404 })
    if (!amministratore && d.utenteId !== io.id) {
      return NextResponse.json({ errore: 'Non è una tua richiesta.' }, { status: 403 })
    }
    await db.domandaAiuto.updateMany({
      where: { id: c.id },
      data: { stato: c.azione === 'chiudi' ? 'chiusa' : 'aperta' },
    })
    return NextResponse.json(await elenco(io.id, amministratore))
  }

  // ── «L'ho letta» ──
  if (c.azione === 'letta') {
    if (!c.id) return NextResponse.json({ errore: 'Manca l’id.' }, { status: 400 })
    await db.domandaAiuto.updateMany({
      where: { id: c.id, utenteId: io.id },
      data: { lettaIl: new Date() },
    })
    return NextResponse.json(await elenco(io.id, amministratore))
  }

  // ── Chiedere ──
  const testo = (c.testo ?? '').trim()
  if (!testo) return NextResponse.json({ errore: 'Scrivi la domanda.' }, { status: 400 })

  const creata = await db.domandaAiuto.create({
    data: {
      testo,
      // ⚠️ Il contesto arriva dalla pagina e non da un campo da compilare: una
      // domanda su tre arriverebbe senza, e chi risponde dovrebbe rincorrere.
      pagina: (c.pagina ?? '').slice(0, 200),
      ordineNumero: (c.ordineNumero ?? '').trim().slice(0, 20),
      conversazioneId: (c.conversazioneId ?? '').trim().slice(0, 40),
      utenteId: io.id,
      utenteNome: io.nome,
    },
  })
  // ⚠️ Il codice si scrive SUBITO, anche se l'avviso non parte: è quello con
  // cui si risponde da WhatsApp, e deve esistere prima del messaggio.
  await db.domandaAiuto.updateMany({
    where: { id: creata.id },
    data: { codice: codiceDa(creata.id) },
  })
  // ⚠️ L'avviso si aspetta (non è un `void`): l'esito va mostrato subito a chi
  // ha chiesto. Se fuori dalla finestra di 24h WhatsApp lo rifiuta, chi scrive
  // deve saperlo adesso. La funzione non solleva mai.
  await avvisaAmministratore(creata.id)
  return NextResponse.json(await elenco(io.id, amministratore))
}
