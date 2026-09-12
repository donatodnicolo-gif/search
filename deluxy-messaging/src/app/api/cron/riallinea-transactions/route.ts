import { NextRequest, NextResponse } from 'next/server'
import { riallineaCodaTransactions } from '@/lib/riallinea-transactions'

// ⭐ 12/09/2026 — RIALLINEA L'ARRETRATO DELLA CODA DI TRANSACTIONS.
//
// Chiude di là, come «pagata fuori dall'app», le richieste che qui risultano già
// pagate e che nella loro coda sono rimaste in attesa. Chiesto dall'utente
// («chiudi tutto») su 41 righe per 3.638,00 €.
//
// ⚠️⚠️ È UNA ROTTA E NON UNO SCRIPT per una ragione sola: le credenziali di
// Transactions vivono solo nell'ambiente del server. Dal computer di casa non
// c'è nessuna chiave, quindi questo lavoro può girare solo in produzione.
//
// ⚠️ Di suo è una PROVA A SECCO: elenca e non chiama nessuno. Scrive solo con
// `?esegui=1`, perché è una scrittura in casa d'altri su una coda di pagamenti.
// ⚠️ NON è fra i cron di `vercel.json`: è un arretrato, si lancia a mano quando
// una persona ha deciso. La guardia dell'11/09 impedisce che se ne formi un altro.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json({ errore: 'CRON_SECRET non configurato.' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }
  const esegui = req.nextUrl.searchParams.get('esegui') === '1'
  try {
    const esito = await riallineaCodaTransactions({ esegui })
    return NextResponse.json({ ok: true, esegui, ...esito })
  } catch (e) {
    return NextResponse.json({ ok: false, errore: (e as Error).message }, { status: 502 })
  }
}
