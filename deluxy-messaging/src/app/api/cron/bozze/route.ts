import { NextRequest, NextResponse } from 'next/server'
import { annullaBozzeScadute } from '@/lib/bozze'

export const dynamic = 'force-dynamic'
// Una domanda e (forse) una cancellazione per negozio: i 10 secondi non bastano.
export const maxDuration = 60

// ANNULLA LE BOZZE SCADUTE, una volta al giorno.
//
// ⚠️⚠️ Questo cron CANCELLA per davvero su Shopify: il link smette di
// funzionare. Le guardie stanno in `annullaBozzeScadute()` — solo bozze create
// da qui, solo più vecchie del limite (Impostazioni → `giorniBozzaScaduta`, 7 di
// default), e solo dopo aver chiesto a Shopify come stanno. Una pagata non si
// tocca mai.
//
// ⚠️ Sta fuori dal middleware di sessione (`api/cron` è escluso) e si autentica
// col CRON_SECRET: una funzione chiamata da Vercel non ha un cookie di login.
export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: annullamento automatico disattivato.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }

  const esito = await annullaBozzeScadute()
  return NextResponse.json({ ok: true, ...esito })
}
