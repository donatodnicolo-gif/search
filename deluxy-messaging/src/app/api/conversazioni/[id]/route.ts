import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Togliere una conversazione dall'inbox. Tre gesti, e la differenza conta:
//
//  · ARCHIVIA (PATCH `archiviata`): sparisce dall'elenco e resta dov'è. È quello
//    che serve nel 99% dei casi — la pubblicità, il thread chiuso.
//  · ELIMINA (DELETE): va nel **cestino**, dove resta 30 giorni. Non cancella
//    niente adesso: una conversazione buttata per errore portava con sé il testo
//    delle mail, gli allegati e chi aveva risposto, senza modo di riaverla.
//  · SVUOTA (DELETE `?definitivo=1`): cancella davvero, conversazione **e tutti
//    i suoi messaggi** (`onDelete: Cascade`). Da qui non si torna: la conferma
//    sta davanti al bottone, non qui.
//
// Nessuno dei tre tocca la casella di posta vera: la mail resta sul server IMAP.
// ⚠️ Con «Scarica posta» una mail **eliminata definitivamente rientra**, se è
// ancora nella posta in arrivo e dentro la finestra dello scarico: la dedup
// guarda i messaggi che abbiamo, e quello cancellato non c'è più. Il cestino
// invece regge — la conversazione esiste, è solo da un'altra parte.
export async function DELETE(req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const definitivo = req.nextUrl.searchParams.get('definitivo') === '1'
  const c = await db.conversazione.findUnique({
    where: { id },
    select: { id: true, eliminataIl: true, _count: { select: { messaggi: true } } },
  })
  if (!c) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  if (definitivo) {
    await db.conversazione.delete({ where: { id } })
    return NextResponse.json({ eliminata: true, messaggi: c._count.messaggi })
  }

  await db.conversazione.update({
    where: { id },
    data: { eliminataIl: new Date(), nonLetti: 0, daRileggere: false },
  })
  return NextResponse.json({ nelCestino: true })
}

// Archivia, riporta in inbox, ripristina dal cestino, o prende in carico.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { archiviata, ripristina, presa, forza, daRileggere } = (await req
    .json()
    .catch(() => ({}))) as {
    archiviata?: boolean
    ripristina?: boolean
    /** 'io' = me ne occupo io · 'nessuno' = la lascio libera */
    presa?: 'io' | 'nessuno'
    /** Prenderla anche se ce l'ha già un altro: lo deve chiedere un clic apposta. */
    forza?: boolean
    /** «Ci devo tornare»: la riga torna a chiedere attenzione nell'elenco. */
    daRileggere?: boolean
  }
  const c = await db.conversazione.findUnique({ where: { id }, select: { id: true } })
  if (!c) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  // ── DA RILEGGERE ──
  //
  // ⚠️ Sta PRIMA di tutto il resto e ritorna subito: è l'unico ramo che non
  // archivia, non elimina e non prende in carico, e cadendo in fondo avrebbe
  // finito per archiviare la conversazione (`archiviata !== false` è vero anche
  // per `undefined`) — cioè il contrario di quello che chiede.
  if (typeof daRileggere === 'boolean') {
    const segnata = await db.conversazione.update({
      where: { id },
      data: { daRileggere },
      select: { id: true, daRileggere: true },
    })
    return NextResponse.json(segnata)
  }

  // ── PRESA IN CARICO ──
  if (presa) {
    const io = await utenteCorrente()
    if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

    if (presa === 'nessuno') {
      // ⚠️ Si lascia SOLO quella che si è presa: liberare la conversazione di un
      // altro con un clic vuol dire togliergli il cliente da sotto le mani senza
      // che se ne accorga. Per prenderla davvero c'è `forza`, che almeno è un
      // gesto dichiarato.
      const liberata = await db.conversazione.updateMany({
        where: { id, presaDaId: io.id },
        data: { presaDaId: '', presaDaNome: '', presaIl: null },
      })
      if (liberata.count === 0) {
        return NextResponse.json(
          { errore: 'Questa conversazione non è tua: puoi prenderla, non liberarla.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ presaDaId: '', presaDaNome: '', presaIl: null })
    }

    const dati = { presaDaId: io.id, presaDaNome: io.nome, presaIl: new Date() }

    // ⚠️⚠️ L'AGGIORNAMENTO È CONDIZIONATO, e questo è il punto della funzione.
    // Se due operatori premono «Me ne occupo io» sullo stesso secondo, un
    // update secco farebbe vincere l'ultimo **in silenzio**: entrambi
    // leggerebbero il proprio nome sullo schermo e risponderebbero insieme —
    // cioè esattamente il guaio che questa funzione esiste per evitare. Con
    // `updateMany` filtrato su «libera o già mia» il secondo scrive zero righe e
    // se lo sente dire.
    if (!forza) {
      const presaOra = await db.conversazione.updateMany({
        where: { id, presaDaId: { in: ['', io.id] } },
        data: dati,
      })
      if (presaOra.count === 0) {
        const chi = await db.conversazione.findUnique({
          where: { id },
          select: { presaDaNome: true },
        })
        return NextResponse.json(
          { errore: `Se ne sta già occupando ${chi?.presaDaNome || 'un altro operatore'}.`, occupata: true },
          { status: 409 }
        )
      }
      return NextResponse.json(dati)
    }

    await db.conversazione.update({ where: { id }, data: dati })
    return NextResponse.json(dati)
  }

  if (ripristina) {
    // Dal cestino si torna in posta in arrivo, non in archivio: chi ripristina
    // vuole rivedere quella conversazione, non nasconderla di nuovo.
    const tornata = await db.conversazione.update({
      where: { id },
      data: { eliminataIl: null, archiviata: false },
      select: { id: true, eliminataIl: true },
    })
    return NextResponse.json(tornata)
  }

  const aggiornata = await db.conversazione.update({
    where: { id },
    data: { archiviata: archiviata !== false, nonLetti: 0, daRileggere: false },
    select: { id: true, archiviata: true },
  })
  return NextResponse.json(aggiornata)
}
