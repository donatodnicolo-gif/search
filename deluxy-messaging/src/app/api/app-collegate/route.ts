import { NextRequest, NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { provaApp, salvaApp, statoAppCollegate } from '@/lib/app-collegate'

export const dynamic = 'force-dynamic'

// ⭐ 11/09/2026 — APP COLLEGATE (richiesta dell'utente: «dammi possibilità di
// aggiungere tue chiavi ad altre app»).
//
// ⚠️⚠️ TUTTO QUI DENTRO È DELL'AMMINISTRATORE, lettura compresa — ed è
// l'eccezione rispetto agli orari e ai metodi di pagamento, che un operatore
// può almeno leggere. Qui si vede quali app sono collegate e con che indirizzo:
// è la mappa di dove arrivano le nostre chiamate, e chi la legge sa dove
// puntare un'app finta. Le chiavi non escono MAI: si dice solo se ci sono.
async function admin() {
  const io = await utenteCorrente()
  if (!io) return { errore: NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 }) }
  if (io.ruolo !== 'admin') {
    return { errore: NextResponse.json({ errore: 'Serve un amministratore.' }, { status: 403 }) }
  }
  return { io }
}

export async function GET() {
  const g = await admin()
  if ('errore' in g) return g.errore
  return NextResponse.json({ app: await statoAppCollegate() })
}

// PUT { app, url?, apiKey?, svuota? } — salva indirizzo e chiave di un'app.
export async function PUT(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const b = (await req.json().catch(() => null)) as
    | { app?: string; url?: string; apiKey?: string; svuota?: boolean }
    | null
  const chiave = String(b?.app ?? '').trim()
  if (!chiave) return NextResponse.json({ errore: 'Manca l’app.' }, { status: 400 })
  const esito = await salvaApp(chiave, { url: b?.url, apiKey: b?.apiKey, svuota: b?.svuota })
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
  return NextResponse.json({ ok: true, app: await statoAppCollegate() })
}

// POST { app } — prova il collegamento DAVVERO (una chiamata di sola lettura).
//
// ⚠️ È una chiamata verso un'altra app, non una scrittura: non cambia niente
// né qui né di là. L'esito resta scritto, così alla riapertura si sa quando è
// stata fatta l'ultima prova e com'è andata.
export async function POST(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const b = (await req.json().catch(() => null)) as { app?: string } | null
  const chiave = String(b?.app ?? '').trim()
  if (!chiave) return NextResponse.json({ errore: 'Manca l’app da provare.' }, { status: 400 })
  const esito = await provaApp(chiave)
  return NextResponse.json({ ...esito, app: await statoAppCollegate() })
}
