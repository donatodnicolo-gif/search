import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { CHIUSURA, gestioneValida } from '@/lib/gestione'
import { chiudiNoteDellOrdine } from '@/lib/diario-chiusura'
import { utenteCorrente } from '@/lib/sessione'
import { comunicaStatoAOrders } from '@/lib/orders'
import { mandaAvanti, nomeSalute, saluteDaOrders } from '@/lib/salute-ordine'

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
  // ⚠️ Il cookie è `userId.HMAC(userId)` e vive trenta giorni: il middleware
  // ne verifica solo la FIRMA, e cancellare un utente non lo invalida. Senza
  // questa riga l'azione partiva lo stesso, con autore vuoto in archivio.
  if (!utente) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  // ── SE LA SALUTE NON È CONFORME, L'ORDINE NON VA AVANTI ──
  //
  // ⚠️⚠️ Regola dell'utente (04/09/2026). Sta QUI e non solo nella schermata:
  // una regola scritta soltanto nei bottoni è una regola che si aggira con una
  // chiamata, ed è la trappola già pagata in questa app («una server action è
  // un endpoint»). La schermata spegne i passi per non far perdere tempo; il
  // divieto è questo.
  //
  // ⚠️ Solo per i passi che mandano avanti: chiudere («Gestito») e tornare a
  // «Da iniziare» restano sempre possibili, altrimenti un ordine annullato dal
  // cliente resterebbe in lista per sempre senza modo di toglierlo.
  //
  // ⚠️⚠️ E «non lo so» NON vale «no»: se Orders non risponde si passa, e lo si
  // scrive nella risposta. Il contrario fermerebbe tutto il lavoro dell'azienda
  // ogni volta che l'app dei registri ha un raffreddore.
  let avvisoSalute = ''
  if (mandaAvanti(gestione)) {
    const s = await saluteDaOrders(esistente.numero, esistente.shopifyId)
    if (s.stato === 'ok' && !s.conforme) {
      return NextResponse.json(
        {
          errore: `Su Deluxy Orders quest'ordine risulta «${nomeSalute(s.salute)}», non conforme: non si manda avanti. ${s.perche}`.trim(),
          salute: s.salute,
        },
        { status: 409 }
      )
    }
    if (s.stato === 'sconosciuta') avvisoSalute = `Non ho potuto chiedere la salute a Orders: ${s.perche}`
  }
  const ordine = await db.ordine.update({
    where: { id },
    data: {
      gestione,
      gestioneIl: new Date(),
      gestioneDaId: utente?.id ?? '',
      gestioneDaNome: utente?.nome ?? '',
    },
  })

  // ── LE NOTE DEL DIARIO SI CHIUDONO DA SOLE ──
  //
  // ⚠️⚠️ Chiesto dall'utente il 26/08/2026: «quando un ordine viene messo come
  // gestito chiudi le note associate». Il diario è la lista di quello che resta
  // da fare, e una riga che parla di un ordine finito non resta da fare: finora
  // però restava lì, mescolata a quelle vere. Due o tre righe così e l'elenco si
  // smette di leggere — che è il modo in cui una nota importante passa
  // inosservata.
  //
  // ⚠️ Solo verso `gestito`, e solo quelle ancora aperte. Riportando l'ordine
  // indietro le note NON si riaprono: potrebbero essere state fatte davvero, e
  // riaprirle disferebbe con un automatismo la spunta di una persona.
  //
  // ⚠️ Il numero e non l'id, perché è quello che la nota porta scritto — e si
  // provano tutte e due le forme (`2799` e `#2799`).
  //
  // ⚠️ Quante ne ha chiuse torna al client, che lo dice: righe che spariscono da
  // un elenco senza lasciare un numero fanno credere di non essere mai esistite.
  const noteChiuse =
    gestione === CHIUSURA ? await chiudiNoteDellOrdine(ordine.numero, utente?.nome ?? '') : 0

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
    noteChiuse,
    orders: versoOrders.ok ? { ok: true } : { ok: false, messaggio: versoOrders.messaggio },
    // ⚠️ Se la salute non si è potuta chiedere il passo è andato, ma chi l'ha
    // fatto deve saperlo: il controllo non c'è stato, non è che sia andato bene.
    avvisoSalute,
  })
}
