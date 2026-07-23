import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { db } from '@/lib/db'
import { analizzaMessaggioOra, riassumiThreadOra } from '@/lib/sync'
import { raggruppa, chiaveThread } from '@/lib/thread'
import { emailContattiAI } from '@/lib/contattiAI'
import { idsThreadAI } from '@/lib/threadAI'

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

/**
 * Le conversazioni col PLUS AI il cui riassunto manca o è VECCHIO (generato
 * quando la conversazione aveva meno messaggi di adesso). Torna, per ognuna,
 * l'id di una sua mail da cui rigenerarlo.
 */
async function threadAIdaRiassumere(utenteId: string, idsAI: string[]): Promise<string[]> {
  // Le mail dei thread AI, raggruppate: così si sa quanti messaggi ha ciascuno.
  const messaggi = await db.messaggio.findMany({
    where: { utenteId, id: { in: idsAI }, cestinato: false },
    select: { id: true, thread: true, threadManuale: true, scollegato: true, oggetto: true, data: true },
  })
  if (messaggi.length === 0) return []

  const gruppi = raggruppa(messaggi).filter((g) => g.length > 1)
  if (gruppi.length === 0) return []

  const chiavi = gruppi.map((g) => chiaveThread(g))
  let visti = new Map<string, number>()
  try {
    const righe = await db.riassuntoThread.findMany({
      where: { utenteId, chiave: { in: chiavi } },
      select: { chiave: true, messaggiVisti: true },
    })
    visti = new Map(righe.map((r) => [r.chiave, r.messaggiVisti]))
  } catch {
    return [] // tabella non ancora migrata
  }

  return gruppi
    .filter((g, i) => (visti.get(chiavi[i]) ?? 0) < g.length)
    .map((g) => g[g.length - 1].id) // dal messaggio più recente del thread
}

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    // PLUS AI per CONTATTO e per CONVERSAZIONE: entrambi vanno letti sempre.
    const [emailAI, idsAI] = await Promise.all([emailContattiAI(userId), idsThreadAI(userId)])
    if (emailAI.length === 0 && idsAI.length === 0) {
      return NextResponse.json({ ok: true, fatti: 0, restano: 0 })
    }

    // Le mail col PLUS AI mai analizzate. Il confronto sul mittente è
    // CASE-INSENSITIVE: l'indirizzo è salvato com'è nella mail, i contatti AI
    // sono minuscoli (stessa accortezza della vista AI Inbox).
    const dove = {
      utenteId: userId,
      direzione: 'entrata' as const,
      cestinato: false,
      archiviato: false,
      analizzatoIl: null,
      NOT: { sezione: { nome: 'SPAM' } },
      OR: [
        ...emailAI.map((e) => ({ mittente: { equals: e, mode: 'insensitive' as const } })),
        ...(idsAI.length ? [{ id: { in: idsAI } }] : []),
      ],
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

    // Finite le mail da leggere, si tiene aggiornato il RIASSUNTO delle
    // conversazioni col PLUS AI: è la parte «riassunto aggiornato con l'ultima
    // mail». Uno per giro, così la chiamata resta breve.
    const daRiassumere = idsAI.length > 0 ? await threadAIdaRiassumere(userId, idsAI) : []
    if (fatti === 0 && daRiassumere.length > 0) {
      try {
        await riassumiThreadOra(userId, daRiassumere[0])
        fatti++
      } catch {
        /* si riprova al prossimo giro */
      }
    }

    const restanoMessaggi = await db.messaggio.count({ where: dove })
    const restano = restanoMessaggi + Math.max(0, daRiassumere.length - (fatti > 0 ? 1 : 0))
    // `dettaglio` serve a capire cosa sta facendo (o perché non fa niente):
    // senza, «tutto già letto» e «non parte» sono indistinguibili a schermo.
    return NextResponse.json({
      ok: true,
      fatti,
      restano,
      dettaglio: {
        contattiAI: emailAI.length,
        mailThreadAI: idsAI.length,
        mailDaLeggere: restanoMessaggi,
        riassuntiDaRifare: daRiassumere.length,
      },
    })
  } catch (e) {
    const m = e instanceof Error ? e.message : 'errore'
    return NextResponse.json({ ok: false, messaggio: m.slice(0, 160) }, { status: 500 })
  }
}
