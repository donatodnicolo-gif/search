import { NextRequest, NextResponse } from 'next/server'
import { annotaSync, sincronizzaOrdini } from '@/lib/sincronizza'

// Aggiornamento automatico degli ordini ogni 15 minuti (cron Vercel, vedi
// vercel.json): un ordine che arriva alle 9:03 è qui entro le 9:15, senza che
// nessuno prema "Aggiorna". È lo stesso scarico del pulsante, incrementale.
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
