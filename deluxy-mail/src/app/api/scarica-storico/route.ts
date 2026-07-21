import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { db } from '@/lib/db'
import { scaricaStorico, sincronizzaInviata } from '@/lib/sync'

// POST /api/scarica-storico — scarica UN blocco di posta vecchia (storico) per
// l'utente loggato. Torna { scaricati, finito }. Il client richiama in loop
// finché non è finito, così ogni chiamata resta breve e l'app resta libera.
//
// Col body { target: N } si scarica SOLO fino ad avere N mail ricevute e N
// inviate per casella (il "primo carico"): raggiunto il target, finito=true
// senza nemmeno toccare il server IMAP. Senza target: tutto lo storico.
//
// È una ROTTA (non una Server Action) apposta: non entra nella coda delle
// navigazioni/azioni di Next, quindi non blocca i clic dell'utente.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BLOCCO = 80 // messaggi vecchi per chiamata

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    const corpo = (await request.json().catch(() => ({}))) as { target?: number }
    const grezzo = Number(corpo?.target)
    const target = Number.isFinite(grezzo) && grezzo > 0 ? Math.min(grezzo, 5000) : null

    const account = await db.account.findMany({
      where: { utenteId: userId, attivo: true },
      select: { id: true, storicoFinito: true, storicoInviataFinito: true },
    })

    // Quante ricevute/inviate abbiamo già per una casella (per il target).
    const conta = (accountId: string, direzione: 'entrata' | 'uscita') =>
      db.messaggio.count({ where: { accountId, direzione } })

    let scaricati = 0
    // Per ogni account si avanza SIA la INBOX SIA la cartella "Inviata" nella
    // stessa chiamata, così gli inviati non aspettano la fine della posta in
    // arrivo. Ci si ferma dopo il primo account che ha scaricato qualcosa: il
    // client richiama subito.
    for (const a of account) {
      let fatto = false
      const vuoleInbox =
        !a.storicoFinito && (target === null || (await conta(a.id, 'entrata')) < target)
      if (vuoleInbox) {
        const esito = await scaricaStorico(a.id, BLOCCO)
        scaricati += esito.scaricati
        if (esito.scaricati > 0) fatto = true
      }
      const vuoleInviata =
        !a.storicoInviataFinito && (target === null || (await conta(a.id, 'uscita')) < target)
      if (vuoleInviata) {
        const esito = await sincronizzaInviata(a.id, true)
        scaricati += esito.scaricati
        if (esito.scaricati > 0) fatto = true
      }
      if (fatto) break
    }

    // Finito? Senza target: quando tutte le caselle hanno lo storico completo.
    // Col target: quando ogni casella ha raggiunto N ricevute e N inviate
    // (oppure il server non ha più nulla da dare). I flag si RILEGGONO: gli
    // scarichi di questo giro possono averli appena cambiati.
    const aggiornati = await db.account.findMany({
      where: { utenteId: userId, attivo: true },
      select: { id: true, storicoFinito: true, storicoInviataFinito: true },
    })
    let finito = true
    for (const a of aggiornati) {
      if (target === null) {
        if (!a.storicoFinito || !a.storicoInviataFinito) {
          finito = false
          break
        }
      } else {
        const [entrate, uscite] = await Promise.all([conta(a.id, 'entrata'), conta(a.id, 'uscita')])
        if ((!a.storicoFinito && entrate < target) || (!a.storicoInviataFinito && uscite < target)) {
          finito = false
          break
        }
      }
    }

    return NextResponse.json({ ok: true, scaricati, finito })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
