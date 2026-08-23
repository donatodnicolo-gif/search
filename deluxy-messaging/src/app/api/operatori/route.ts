import { NextRequest, NextResponse } from 'next/server'
import { misuraOperatori } from '@/lib/operatori'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Quanto lavoro ha fatto ciascuno, nel periodo chiesto.
//
// ⚠️ Solo amministratori. Non è pudore: qui si confrontano fra loro le persone
// che lavorano insieme, e un operatore che vede quanti messaggi ha scritto il
// collega non ha in mano uno strumento di lavoro — ha una classifica. Il
// controllo sta QUI e non solo nella pagina: nascondere una voce di menu non
// impedisce di chiamare l'indirizzo.
//
// ⚠️ `da` e `a` sono istanti ISO e li calcola il browser, che sta nel fuso di
// chi guarda. Farlo qui vorrebbe dire calcolarli a UTC — su Vercel il server è
// lì — e in estate «oggi» comincerebbe alle due del mattino.
export async function GET(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  if (io.ruolo !== 'admin') {
    return NextResponse.json({ errore: 'Serve un amministratore.' }, { status: 403 })
  }

  const p = req.nextUrl.searchParams
  const da = new Date(p.get('da') ?? '')
  const a = new Date(p.get('a') ?? '')
  if (Number.isNaN(da.getTime()) || Number.isNaN(a.getTime())) {
    return NextResponse.json({ errore: 'Periodo non valido.' }, { status: 400 })
  }
  if (a <= da) {
    return NextResponse.json(
      { errore: 'La fine del periodo deve venire dopo l’inizio.' },
      { status: 400 }
    )
  }

  // ⚠️ Il fuso arriva dal browser: è lì che si sa dove comincia un giorno.
  // Senza, i giorni lavorati si conterebbero a UTC — e il lavoro serale
  // risulterebbe spalmato su due giornate, cioè la media per giorno verrebbe
  // più bassa del vero.
  const fuso = p.get('fuso') || 'Europe/Rome'
  return NextResponse.json(await misuraOperatori(da, a, fuso))
}
