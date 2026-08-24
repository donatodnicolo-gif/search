import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gestioneValida } from '@/lib/gestione'
import { utenteCorrente } from '@/lib/sessione'
import { comunicaStatoAOrders } from '@/lib/orders'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Cambia lo stato di lavorazione di un ordine (da gestire / in pagamento /
// comunicazione con cliente / gestito).
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { gestione } = (await req.json().catch(() => ({}))) as { gestione?: string }

  if (!gestione || !gestioneValida(gestione)) {
    return NextResponse.json({ errore: 'Stato di lavorazione non valido.' }, { status: 400 })
  }

  const esistente = await db.ordine.findUnique({ where: { id } })
  if (!esistente) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })

  // CHI ha spuntato l ordine. Serve perche «Gestito» toglie l ordine dalla
  // lista di lavoro: e l unica azione che fa sparire del lavoro, e finora
  // spariva senza lasciare un nome. Con cinque ordini segnati in un giorno e
  // nessuno che se lo ricordava, la domanda «chi e stato» non aveva risposta.
  const utente = await utenteCorrente()
  const ordine = await db.ordine.update({
    where: { id },
    data: {
      gestione,
      gestioneIl: new Date(),
      gestioneDaId: utente?.id ?? '',
      gestioneDaNome: utente?.nome ?? '',
    },
  })

  // ── LO SI COMUNICA A ORDERS ──
  //
  // ⚠️ Il Customer Service è il decisore dell'evasione (§7.2): lo stato di
  // lavorazione lo decide QUI, e Orders lo mostra accanto alla sua pipeline
  // (campo `csGestione`). Prima restava solo qui, e in Orders l'ordine sembrava
  // fermo a «Nuovo» anche quando era già gestito.
  //
  // ⚠️ Best-effort: un fallimento NON annulla il cambio locale — il fatto è
  // nostro e vale comunque. L'esito si restituisce, e la lista lo può mostrare
  // invece di far credere che Orders sappia.
  const versoOrders = await comunicaStatoAOrders(
    ordine.numero,
    ordine.shopifyId,
    ordine.gestione,
    ordine.gestioneDaNome,
    ordine.gestioneIl
  )

  return NextResponse.json({
    ordine,
    orders: versoOrders.ok ? { ok: true } : { ok: false, messaggio: versoOrders.messaggio },
  })
}
