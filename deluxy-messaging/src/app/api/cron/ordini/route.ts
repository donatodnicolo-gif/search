import { NextRequest, NextResponse } from 'next/server'
import { annotaSync, sincronizzaOrdini } from '@/lib/sincronizza'

// Aggiornamento automatico degli ordini ogni 5 MINUTI (cron Vercel, vedi
// vercel.json): e lo stesso scarico del pulsante, incrementale.
//
// ⚠️⚠️ Era ogni 15 minuti, ed e stato portato a 5 il 31/08/2026 su segnalazione
// dell utente («gli ordini arrivano troppo tardi da Orders»). MISURATO prima di
// toccare, su 91 ordini di sette giorni: dall ordine su Shopify alla sua
// comparsa QUI passavano 11 minuti in mediana, 18 al 90esimo, 20 nel caso
// peggiore — e quel tempo era fatto di DUE attese in fila, una per cron: il giro
// di Orders (ogni 15) e questo (ogni 15).
//
// ⚠️ Più spesso non vuol dire più carico per Orders: la lettura è incrementale
// (`aggiornatiDa`), quindi un giro a vuoto costa una domanda e zero righe. Il
// costo vero è la chiamata a Shopify, che sta di là e non qui.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>" — Vercel lo invia da
// solo se la variabile CRON_SECRET è impostata sul progetto. Senza segreto la
// rotta risponde 503 invece di restare un endpoint aperto a chiunque.
export const dynamic = 'force-dynamic'
// Solo ordini: misurati ~10 secondi. Il margine serve alle giornate cariche.
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: aggiornamento automatico disattivato.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }

  try {
    // NIENTE contatti Google qui: misurati, sono la parte lenta (40 chiamate
    // alla People API per giro → oltre 3 minuti, contro i ~10 secondi degli
    // ordini). Rischiavano di far scadere il giro dei 15 minuti, che è quello
    // che non deve saltare. Hanno il loro cron: /api/cron/contatti.
    const esito = await sincronizzaOrdini({ contatti: false })
    await annotaSync({ ok: true, nota: `${esito.scaricati} ordini, ${esito.nuovi} nuovi` })
    return NextResponse.json({ ok: true, ...esito })
  } catch (e) {
    const messaggio = (e as Error).message
    await annotaSync({ ok: false, nota: messaggio })
    return NextResponse.json({ errore: messaggio }, { status: 500 })
  }
}
