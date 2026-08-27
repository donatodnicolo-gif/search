import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { inviaSulCanale } from '@/lib/invio'
import { utenteCorrente } from '@/lib/sessione'
import { daTradurre, linguaDelTesto, lingueLette } from '@/lib/lingua-testo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Messaggi di una conversazione. Aprire il thread azzera i non letti.
export async function GET(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const conversazione = await db.conversazione.findUnique({ where: { id } })
  if (!conversazione) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  const messaggi = await db.messaggio.findMany({
    where: { conversazioneId: id },
    orderBy: { creatoIl: 'asc' },
    take: 500,
  })
  if (conversazione.nonLetti > 0) {
    await db.conversazione.update({ where: { id }, data: { nonLetti: 0 } })
  }

  // ── C'è qualcosa da tradurre, qui dentro? ──
  //
  // ⚠️ La domanda si risponde QUI, non nel browser: dipende da quali lingue
  // leggiamo, che è un'impostazione. Mandando al browser un sì/no già deciso si
  // evita che chieda la traduzione di una mail inglese a chi l'inglese lo
  // legge — una chiamata pagata a ogni apertura, per niente.
  const conf = await leggiImpostazioni(['traduzioneAuto', 'lingueLette'])
  const lette = lingueLette(conf.lingueLette)
  const cEDaTradurre = messaggi.some(
    (m) =>
      m.direzione === 'in' && !m.traduzione && daTradurre(m.lingua || linguaDelTesto(m.testo), lette)
  )

  // La lingua del cliente: l'ultima riconosciuta fra i SUOI messaggi. Serve al
  // bottone «Traduci prima di inviare», che deve sapere verso dove tradurre.
  const suoi = messaggi.filter((m) => m.direzione === 'in')
  const linguaCliente =
    [...suoi].reverse().find((m) => m.lingua)?.lingua ??
    linguaDelTesto(suoi[suoi.length - 1]?.testo ?? '')

  return NextResponse.json({
    conversazione,
    // ⚠️ `mediaUrl` NON esce di qui. È l'indirizzo firmato che Meta ci dà per la
    // foto di un cliente: chi ce l'ha se la guarda senza passare dall'app, e
    // basta una schermata inoltrata perché esca dall'azienda. Al browser serve
    // sapere solo che un allegato c'è — il file glielo dà `/api/media/[id]`,
    // che sta dietro la sessione.
    messaggi: messaggi.map(({ mediaUrl, ...m }) => ({ ...m, haAllegato: Boolean(mediaUrl) })),
    traduzioneAuto: conf.traduzioneAuto === 'si',
    daTradurre: cEDaTradurre,
    linguaCliente,
  })
}

// Invia una risposta sul canale della conversazione.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const conversazione = await db.conversazione.findUnique({ where: { id } })
  if (!conversazione) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  const { testo } = (await req.json().catch(() => ({}))) as { testo?: string }
  const pulito = (testo ?? '').trim()
  if (!pulito) return NextResponse.json({ errore: 'Testo vuoto' }, { status: 400 })

  // Chi sta rispondendo: con più operatori, «chi ha scritto al cliente» è la
  // prima domanda quando la conversazione passa di mano.
  const chiScrive = await utenteCorrente()
  // ⚠️ Il cookie è `userId.HMAC(userId)` e vive trenta giorni: il middleware
  // ne verifica solo la FIRMA, e cancellare un utente non lo invalida. Senza
  // questa riga l'azione partiva lo stesso, con autore vuoto in archivio.
  if (!chiScrive) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  // Le regole di «da quale nostro numero/pagina esce la risposta» stanno in
  // `src/lib/invio.ts`, non più qui: le usa anche la risposta di primo contatto
  // e due copie divergerebbero al primo ritocco.
  const esito = await inviaSulCanale(conversazione, pulito)

  const messaggio = await db.messaggio.create({
    data: {
      conversazioneId: id,
      direzione: 'out',
      utenteId: chiScrive?.id ?? '',
      utenteNome: chiScrive?.nome ?? '',
      testo: pulito,
      idEsterno: esito.ok ? esito.idEsterno : '',
      stato: esito.ok ? 'inviato' : 'errore',
      errore: esito.ok ? '' : esito.errore,
    },
  })
  await db.conversazione.update({
    where: { id },
    data: { ultimoTesto: pulito, ultimoMessaggioIl: new Date() },
  })

  // ── Rispondere è prendere in carico ──
  //
  // Chi scrive al cliente se ne sta occupando: chiederglielo con un secondo
  // clic vuol dire che nove volte su dieci non lo farà, e il segnale che
  // dovrebbe evitare le risposte doppie non arriverà mai a chi guarda l'inbox.
  //
  // ⚠️ SOLO SE È LIBERA. Se ce l'ha già un altro non gliela si porta via di
  // soppiatto: chi risponde comunque ha visto l'avviso sopra il riquadro e ha
  // deciso, e la conversazione resta in capo a chi l'aveva presa. Rubarla in
  // silenzio farebbe sparire dal suo elenco «Mie» un cliente che pensa di
  // seguire.
  if (chiScrive) {
    await db.conversazione.updateMany({
      where: { id, presaDaId: '' },
      data: { presaDaId: chiScrive.id, presaDaNome: chiScrive.nome, presaIl: new Date() },
    })
  }

  if (!esito.ok) return NextResponse.json({ errore: esito.errore, messaggio }, { status: 502 })
  return NextResponse.json({ messaggio })
}
