import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { smistaMailPerSito } from '@/lib/ordine-da-email'
import { daIgnorare, elencoMittentiIgnorati } from '@/lib/mittenti-ignorati'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Applica alle mail GIÀ ARRIVATE due cose che prima non c'erano: lo smistamento
// per sito (dal numero d'ordine) e l'elenco dei mittenti da ignorare.
//
// ⚠️ Serve perché entrambe agiscono all'ARRIVO della mail: le conversazioni di
// ieri restano dove sono. È il motivo per cui in Inbox si vedeva ancora
// «[cakedesign] Ordine #1742» nella colonna Deluxy — la mail era arrivata prima
// che l'app sapesse leggere il numero d'ordine.
//
// Cosa NON fa: non cancella, non tocca le conversazioni che hanno già un marchio
// scritto a mano, non sposta le chat. Le mail dei mittenti ignorati vengono
// archiviate, mai eliminate.
export async function POST() {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const [conversazioni, ignorati] = await Promise.all([
    db.conversazione.findMany({
      where: { canale: 'email', eliminataIl: null },
      select: { id: true, idEsterno: true, negozioId: true, archiviata: true },
      take: 500,
    }),
    elencoMittentiIgnorati(),
  ])

  let smistate = 0
  let archiviate = 0

  for (const c of conversazioni) {
    // Prima l'elenco dei mittenti: se va ignorata non serve cercarle un marchio.
    // ⚠️⚠️ Dal 25/08/2026 un mittente ignorato va nel CESTINO, non in archivio.
    // ⚠️ La condizione NON guarda più `!c.archiviata`: una conversazione già
    // archiviata di un mittente ignorato sarebbe rimasta in archivio per sempre,
    // che è proprio il mucchio che si voleva svuotare. Chi è già nel cestino qui
    // non arriva nemmeno — la query sopra filtra `eliminataIl: null` — quindi la
    // data di eliminazione non si rimette a oggi ogni volta (rinviando in eterno
    // lo svuotamento dei 30 giorni).
    if (daIgnorare(c.idEsterno, ignorati)) {
      await db.conversazione.update({
        where: { id: c.id },
        data: { eliminataIl: new Date(), archiviata: false, nonLetti: 0 },
      })
      archiviate++
      continue
    }

    // Il marchio già scritto non si tocca: potrebbe averlo messo una persona.
    if (c.negozioId) continue

    const ultimo = await db.messaggio.findFirst({
      where: { conversazioneId: c.id, direzione: 'in' },
      orderBy: { creatoIl: 'desc' },
      select: { oggetto: true, testo: true },
    })
    if (!ultimo) continue

    const sito = await smistaMailPerSito(ultimo.oggetto, ultimo.testo)
    if (!sito.negozioId && !sito.ordineNumero) continue

    await db.conversazione.update({
      where: { id: c.id },
      data: {
        ...(sito.negozioId ? { negozioId: sito.negozioId } : {}),
        ...(sito.ordineNumero ? { ordineNumero: sito.ordineNumero } : {}),
      },
    })
    if (sito.negozioId) smistate++
  }

  return NextResponse.json({ guardate: conversazioni.length, smistate, archiviate })
}
