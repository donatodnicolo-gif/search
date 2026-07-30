import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Svuota il cestino: cancella per sempre le conversazioni buttate da più di 30
// giorni, coi loro messaggi (`onDelete: Cascade`).
//
// Perché 30 e non «subito» né «mai»: subito vuol dire che un clic sbagliato
// porta via il testo delle mail e gli allegati di un cliente senza rimedio; mai
// vuol dire tenere per sempre conversazioni che nessuno rileggerà, su un
// database condiviso con le altre app. Trenta giorni sono la finestra in cui un
// cliente riscrive «ma la mia mail?» — che è il momento in cui serve riaverla.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ⚠️ NON esportata: in un file di rotta Next accetta solo i suoi export
// riservati (`GET`, `dynamic`, `maxDuration`…) e su qualunque altro il build
// muore con un errore di tipo che non parla di questo.
const GIORNI_CESTINO = 30

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: lo svuotamento automatico è disattivato.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }

  const limite = new Date(Date.now() - GIORNI_CESTINO * 86400000)
  // `lt` e non `lte`: sul confine si tiene, non si butta.
  const esito = await db.conversazione.deleteMany({
    where: { eliminataIl: { lt: limite } },
  })
  const restano = await db.conversazione.count({ where: { eliminataIl: { not: null } } })

  return NextResponse.json({ ok: true, cancellate: esito.count, restanoNelCestino: restano })
}
