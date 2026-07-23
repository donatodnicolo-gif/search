import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { db } from '@/lib/db'
import { analizzaMessaggioOra } from '@/lib/sync'
import { emailContattiAI } from '@/lib/contattiAI'

// POST /api/analizza-ai-inbox
// I contatti col PLUS AI vanno LETTI dall'AI sempre: qui si analizza un piccolo
// blocco di loro mail non ancora lette (riassunto, priorità, attività, bozza).
//
// «A meno che non esista già un riassunto aggiornato»: una mail già analizzata
// (`analizzatoIl` valorizzato) non si rilegge — e quando ne arriva una nuova,
// più recente, è quella nuova a risultare da analizzare. Così il quadro resta
// allineato all'ultima mail senza rifare ogni volta tutto il thread.
//
// È una ROTTA (non una Server Action): non entra nella coda delle navigazioni,
// quindi gira in sottofondo senza bloccare i clic. Il client richiama in loop
// finché `restano` non è 0.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Poche per giro: ogni analisi è una chiamata a OpenAI (secondi), e la funzione
// ha 60s. Il client ripassa finché non è finito.
const PER_GIRO = 3

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    const emailAI = await emailContattiAI(userId)
    if (emailAI.length === 0) return NextResponse.json({ ok: true, fatti: 0, restano: 0 })

    // Le mail dei contatti AI mai analizzate. Il confronto sul mittente è
    // CASE-INSENSITIVE: l'indirizzo è salvato com'è nella mail, i contatti AI
    // sono minuscoli (stessa accortezza della vista AI Inbox).
    const dove = {
      utenteId: userId,
      direzione: 'entrata' as const,
      cestinato: false,
      archiviato: false,
      analizzatoIl: null,
      NOT: { sezione: { nome: 'SPAM' } },
      OR: emailAI.map((e) => ({ mittente: { equals: e, mode: 'insensitive' as const } })),
    }

    const daFare = await db.messaggio.findMany({
      where: dove,
      orderBy: { data: 'desc' }, // prima le più recenti: è lì che serve il quadro
      take: PER_GIRO,
      select: { id: true },
    })

    let fatti = 0
    for (const m of daFare) {
      try {
        const esito = await analizzaMessaggioOra(m.id, userId)
        if (esito.ok) fatti++
        else break // AI non disponibile (chiave/quota): inutile insistere ora
      } catch {
        break
      }
    }

    const restano = await db.messaggio.count({ where: dove })
    return NextResponse.json({ ok: true, fatti, restano })
  } catch (e) {
    const m = e instanceof Error ? e.message : 'errore'
    return NextResponse.json({ ok: false, messaggio: m.slice(0, 160) }, { status: 500 })
  }
}
