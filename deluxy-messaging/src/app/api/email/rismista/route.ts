import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { smistaMailPerSito } from '@/lib/ordine-da-email'
import { daIgnorare, elencoMittentiIgnorati } from '@/lib/mittenti-ignorati'

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
    if (!c.archiviata && daIgnorare(c.idEsterno, ignorati)) {
      await db.conversazione.update({
        where: { id: c.id },
        data: { archiviata: true, nonLetti: 0 },
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
