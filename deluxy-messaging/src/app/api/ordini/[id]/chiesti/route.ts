import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { comunicaCostoAOrders } from '@/lib/orders'
import { chiaveFornitore } from '@/lib/richieste-fornitore'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// A CHI ABBIAMO CHIESTO SE PUÒ FARE QUEST'ORDINE.
//
// ⚠️⚠️ Prima il bottone WhatsApp apriva la chat col messaggio già scritto e poi
// non restava traccia di niente: non si sapeva a chi si era già chiesto, un
// collega richiedeva allo stesso fornitore, e quando uno rispondeva sì
// bisognava registrarlo a mano in un'altra parte della scheda.
//
// ⚠️ Una riga qui vuol dire «gliel'ho CHIESTO», non «lo prepara lui»: chi lo
// prepara sta sull'ordine, e ci arriva solo con un «ha detto sì».

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const chiesti = await db.richiestaFornitore.findMany({
    where: { ordineId: id },
    orderBy: { chiestoIl: 'desc' },
    select: {
      id: true,
      fornitoreNome: true,
      fornitoreId: true,
      canale: true,
      chiestoIl: true,
      chiestoDaNome: true,
      esito: true,
      nota: true,
    },
  })
  return NextResponse.json({
    chiesti: chiesti.map((c) => ({ ...c, chiestoIl: c.chiestoIl.toISOString() })),
  })
}

// Segna che la proposta è partita.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const c = (await req.json().catch(() => ({}))) as {
    fornitoreNome?: string
    fornitoreId?: string
    telefono?: string
    email?: string
    canale?: string
    testo?: string
  }
  const nome = (c.fornitoreNome ?? '').trim()
  if (!nome) return NextResponse.json({ errore: 'Serve il nome del fornitore.' }, { status: 400 })

  const ordine = await db.ordine.findUnique({
    where: { id },
    select: { id: true, numero: true, annullatoIl: true },
  })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato.' }, { status: 404 })
  // ⚠️ Su un ordine annullato non si chiede niente a nessuno: il cliente non lo
  // vuole più, e un fornitore che si organizza per prepararlo lo fa a vuoto.
  if (ordine.annullatoIl) {
    return NextResponse.json(
      { errore: 'Quest’ordine è annullato: non va chiesto a nessuno.' },
      { status: 409 }
    )
  }

  // ⚠️ Se gliel'abbiamo già chiesto NON si crea una seconda riga: si aggiorna la
  // prima. Due righe per la stessa persona farebbero contare due proposte dove
  // ce n'è una, e il riassunto («3 chiesti») diventerebbe falso al primo
  // sollecito.
  const gia = await db.richiestaFornitore.findFirst({
    where: { ordineId: id, fornitoreNome: nome },
  })
  const dati = {
    telefono: (c.telefono ?? '').trim(),
    email: (c.email ?? '').trim(),
    canale: (c.canale ?? 'whatsapp').trim(),
    testo: (c.testo ?? '').slice(0, 4000),
    chiestoIl: new Date(),
    chiestoDaId: io.id,
    chiestoDaNome: io.nome,
  }
  const riga = gia
    ? await db.richiestaFornitore.update({ where: { id: gia.id }, data: dati })
    : await db.richiestaFornitore.create({
        data: {
          ...dati,
          ordineId: id,
          ordineNumero: ordine.numero,
          fornitoreNome: nome,
          fornitoreId: (c.fornitoreId ?? '').trim(),
        },
      })

  // ⚠️ Lo stato di lavorazione avanza solo se era INDIETRO: chiedere a un
  // fornitore è il passo «ricerca fornitore», ma su un ordine già in pagamento
  // riportarlo indietro cancellerebbe il lavoro di qualcuno.
  try {
    await db.ordine.updateMany({
      where: { id, gestione: 'da_gestire' },
      data: { gestione: 'ricerca_fornitore', gestioneIl: new Date() },
    })
  } catch {
    // lo stato è un contorno: la proposta resta registrata
  }

  return NextResponse.json({ chiesto: { ...riga, chiestoIl: riga.chiestoIl.toISOString() } })
}

// La risposta del fornitore: sì, no, oppure di nuovo in attesa.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const c = (await req.json().catch(() => ({}))) as {
    richiestaId?: string
    esito?: string
    nota?: string
    /** Quanto ha chiesto per farlo: si registra sull'ordine insieme al nome. */
    costo?: number | null
  }
  if (!c.richiestaId) return NextResponse.json({ errore: 'Manca la riga.' }, { status: 400 })
  const esito = ['in_attesa', 'si', 'no'].includes(c.esito ?? '') ? c.esito! : 'in_attesa'

  const riga = await db.richiestaFornitore.findUnique({ where: { id: c.richiestaId } })
  if (!riga || riga.ordineId !== id) {
    return NextResponse.json({ errore: 'Riga non trovata su quest’ordine.' }, { status: 404 })
  }

  await db.richiestaFornitore.update({
    where: { id: riga.id },
    data: {
      esito,
      // ⚠️ Tornando «in attesa» la data della risposta si azzera: una data che
      // resta su una riga senza risposta racconta una risposta che non c'è.
      rispostaIl: esito === 'in_attesa' ? null : new Date(),
      nota: (c.nota ?? riga.nota).slice(0, 2000),
    },
  })

  // ── «HA DETTO SÌ» SCRIVE CHI PREPARA L'ORDINE ──
  //
  // ⚠️⚠️ È il senso di tutto questo: la risposta del fornitore e il fornitore
  // dell'ordine erano due cose separate, e teneva insieme le due una persona che
  // si ricordava di andare a scriverlo. Adesso è lo stesso gesto.
  //
  // ⚠️ NON si sovrascrive un fornitore diverso già registrato: vorrebbe dire
  // cancellare quello che qualcun altro ha scritto guardando la chat, con un
  // clic su un elenco. Si dice, e decide una persona.
  let sullOrdine: { ok: boolean; messaggio: string } | null = null
  if (esito === 'si') {
    const o = await db.ordine.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        shopifyId: true,
        fornitoreNome: true,
        fornitoreCosto: true,
      },
    })
    if (o && o.fornitoreNome && chiaveFornitore(o.fornitoreNome) !== chiaveFornitore(riga.fornitoreNome)) {
      sullOrdine = {
        ok: false,
        messaggio: `Su quest’ordine risulta già ${o.fornitoreNome}: non l’ho sostituito. Toglilo prima, se è cambiato.`,
      }
    } else if (o) {
      const costo = typeof c.costo === 'number' && c.costo >= 0 && c.costo <= 100_000 ? c.costo : null
      await db.ordine.update({
        where: { id: o.id },
        data: {
          fornitoreNome: riga.fornitoreNome,
          fornitoreId: riga.fornitoreId,
          fornitoreTelefono: riga.telefono,
          fornitoreEmail: riga.email,
          ...(costo !== null ? { fornitoreCosto: costo } : {}),
          fornitoreNota: `Ha accettato la proposta mandata il ${riga.chiestoIl.toLocaleDateString('it-IT')}.`,
          fornitoreDaId: io.id,
          fornitoreDaNome: io.nome,
          fornitoreIl: new Date(),
        },
      })
      // ⚠️ Il costo va a Orders solo se ce l'abbiamo: mandare `null` là
      // vorrebbe dire RITIRARE un costo che magari c'era già.
      if (costo !== null) {
        const verso = await comunicaCostoAOrders(o.numero, o.shopifyId, costo, riga.fornitoreNome)
        sullOrdine = verso.ok
          ? { ok: true, messaggio: `${riga.fornitoreNome} prepara ${o.numero}, costo ${costo} €.` }
          : { ok: false, messaggio: `Registrato qui. ⚠️ Orders non l’ha preso: ${verso.messaggio}` }
      } else {
        sullOrdine = {
          ok: true,
          messaggio: `${riga.fornitoreNome} prepara ${o.numero}. Manca quanto gli diamo: scrivilo qui sopra.`,
        }
      }
      // Lo stato avanza: la ricerca è finita.
      try {
        await db.ordine.updateMany({
          where: { id, gestione: { in: ['da_gestire', 'ricerca_fornitore'] } },
          data: { gestione: 'comunicazione', gestioneIl: new Date() },
        })
      } catch {
        // contorno
      }
    }
  }

  const chiesti = await db.richiestaFornitore.findMany({
    where: { ordineId: id },
    orderBy: { chiestoIl: 'desc' },
    select: {
      id: true,
      fornitoreNome: true,
      fornitoreId: true,
      canale: true,
      chiestoIl: true,
      chiestoDaNome: true,
      esito: true,
      nota: true,
    },
  })
  return NextResponse.json({
    chiesti: chiesti.map((x) => ({ ...x, chiestoIl: x.chiestoIl.toISOString() })),
    sullOrdine,
  })
}
