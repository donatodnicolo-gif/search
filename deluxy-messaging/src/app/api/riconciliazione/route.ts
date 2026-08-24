import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { partnerAttivi } from '@/lib/anagrafiche'
import { paroleTrovate } from '@/lib/cerca-fornitore'
import { comunicaCostoAOrders } from '@/lib/orders'
import {
  decidi,
  stessaIdentita,
  STATI_IMPOSSIBILI_SE_PAGATO,
  type DaRiconciliare,
} from '@/lib/riconciliazione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// RIMETTERE INSIEME QUELLO CHE SAPPIAMO GIÀ.
//
// ⚠️⚠️ Misurato il 24/08/2026: 8 pagamenti fatti, ognuno con nome, IBAN, importo
// e ordine collegato — e ZERO ordini con un fornitore registrato (su 1.341).
// Il dato non mancava: era a una tabella di distanza. Senza, il costo non
// arriva a Orders e il margine di quegli ordini risulta «non calcolabile» pur
// essendo calcolabilissimo (41% su sei di loro).

export async function GET() {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  // ⚠️ Solo i pagamenti già FATTI: una richiesta preparata e non pagata non
  // dimostra niente su chi ha preparato l'ordine — il fornitore potrebbe ancora
  // dire di no. Si riconcilia ciò che è successo, non ciò che è previsto.
  const richieste = await db.richiestaPagamento.findMany({
    where: { pagataIl: { not: null } },
    orderBy: { pagataIl: 'desc' },
    take: 200,
    select: {
      id: true,
      intestatario: true,
      iban: true,
      importo: true,
      metodo: true,
      pagataIl: true,
      ordineNumero: true,
    },
  })

  // Gli ordini collegati, in una query sola.
  const numeri = [
    ...new Set(
      richieste
        .map((r) => r.ordineNumero)
        .filter(Boolean)
        .flatMap((n) => [n, n.replace('#', ''), n.startsWith('#') ? n : `#${n}`])
    ),
  ]
  const ordini = numeri.length
    ? await db.ordine.findMany({
        where: { numero: { in: numeri } },
        select: {
          id: true,
          numero: true,
          negozioNome: true,
          clienteNome: true,
          totale: true,
          valuta: true,
          gestione: true,
          annullatoIl: true,
          fornitoreNome: true,
          fornitoreCosto: true,
        },
      })
    : []
  const perNumero = new Map(ordini.map((o) => [o.numero.replace('#', ''), o]))

  // ── IL REGISTRO ──
  //
  // ⚠️⚠️ Una ricerca MIRATA per riga, non l'elenco intero. Misurato il 24/08:
  // chiedendo tutto il registro ne arrivavano **200 schede su 1048** — e un
  // censimento troncato letto come completo trasforma «non l'ho ricevuto» in
  // «non c'è», cioè manda a creare il doppione di un fornitore che abbiamo già.
  // Chiedendo per nome, il registro cerca nel suo indice e non manca niente.
  //
  // ⚠️ Le righe sono poche (i pagamenti già fatti), ma il tetto c'è lo stesso e
  // quello che resta fuori si DICE: un limite silenzioso si legge come «ho
  // guardato tutto».
  const TETTO_REGISTRO = 25
  const daCercare = richieste.slice(0, TETTO_REGISTRO)
  const esiti = await Promise.all(
    daCercare.map((r) =>
      partnerAttivi({ q: r.intestatario, stato: 'tutti', perPagina: 25 }).catch(() => ({
        stato: 'errore' as const,
        messaggio: 'non ha risposto',
      }))
    )
  )
  const trovatoPer = new Map<string, (typeof esiti)[number]>()
  daCercare.forEach((r, i) => trovatoPer.set(r.id, esiti[i]))

  let notaRegistro = ''
  const primo = esiti[0]
  if (primo && primo.stato === 'non-configurato') {
    notaRegistro = 'Il registro Anagrafiche non è configurato: non posso dire chi conosciamo già.'
  } else if (esiti.length && esiti.every((e) => e.stato === 'errore')) {
    notaRegistro =
      'Il registro Anagrafiche non ha risposto: la riconciliazione funziona lo stesso, ma non dico chi conosciamo già.'
  } else if (richieste.length > TETTO_REGISTRO) {
    notaRegistro = `Ho cercato nel registro solo i ${TETTO_REGISTRO} pagamenti più recenti su ${richieste.length}: sugli altri non dico se li conosciamo.`
  }

  const righe = richieste.map((r) => {
    const o = r.ordineNumero ? perNumero.get(r.ordineNumero.replace('#', '')) : undefined
    // ⚠️ Il registro cerca largo (basta una parola, e cerca anche nelle note):
    // il filtro severo lo mettiamo NOI, perché qui la schermata scrive «Nel
    // registro: X» come un fatto. Con la regola larga usciva «Battistella
    // fioreria srl → BEYOND 142 SRL», che combacia su «SRL».
    const esito = trovatoPer.get(r.id)
    const candidati =
      esito && esito.stato === 'ok'
        ? esito.partner
            .filter(
              (p) =>
                stessaIdentita(r.intestatario, p.ragioneSociale) ||
                stessaIdentita(r.intestatario, p.nome)
            )
            .sort((a, b) => paroleTrovate(b, r.intestatario) - paroleTrovate(a, r.intestatario))
        : []
    const p = candidati[0]
    const dato: DaRiconciliare = {
      richiestaId: r.id,
      intestatario: r.intestatario,
      iban: r.iban,
      importo: r.importo,
      metodo: r.metodo,
      pagataIl: r.pagataIl ? r.pagataIl.toISOString() : null,
      ordine: o
        ? {
            id: o.id,
            numero: o.numero,
            negozioNome: o.negozioNome,
            clienteNome: o.clienteNome,
            totale: o.totale,
            valuta: o.valuta,
            gestione: o.gestione,
            annullato: !!o.annullatoIl,
            fornitoreNome: o.fornitoreNome,
            fornitoreCosto: o.fornitoreCosto,
          }
        : null,
      registro: p
        ? {
            id: p.id,
            nome: p.ragioneSociale || p.nome,
            citta: p.citta,
            telefono: p.telefono,
            email: p.email,
          }
        : null,
    }
    return decidi(dato)
  })

  return NextResponse.json({
    righe,
    notaRegistro,
  })
}

// ── APPLICARE UNA RIGA ──
//
// ⚠️ Una per volta e con un bottone: il senso di questa pagina è che una
// persona guardi la frase e dica di sì. Un «sistema tutto» che scrive ottanta
// costi di fornitura senza che nessuno li abbia letti sposterebbe soltanto il
// problema — da «non sappiamo niente» a «sappiamo cose che nessuno ha
// verificato», che è peggio perché sembra vero.
export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const corpo = (await req.json().catch(() => ({}))) as {
    richiestaId?: string
    azione?: string
  }
  const azione = corpo.azione === 'allinea-stato' ? 'allinea-stato' : 'registra'
  if (!corpo.richiestaId) {
    return NextResponse.json({ errore: 'Manca la richiesta.' }, { status: 400 })
  }

  const r = await db.richiestaPagamento.findUnique({
    where: { id: corpo.richiestaId },
    select: {
      intestatario: true,
      importo: true,
      ordineNumero: true,
      pagataIl: true,
      metodo: true,
    },
  })
  if (!r) return NextResponse.json({ errore: 'Richiesta non trovata.' }, { status: 404 })
  if (!r.pagataIl) {
    return NextResponse.json(
      { errore: 'Questa richiesta non risulta pagata: non dimostra chi ha preparato l’ordine.' },
      { status: 400 }
    )
  }
  const numero = r.ordineNumero.replace('#', '')
  const ordine = await db.ordine.findFirst({
    where: { numero: { in: [numero, `#${numero}`] } },
    select: {
      id: true,
      numero: true,
      shopifyId: true,
      clienteNome: true,
      gestione: true,
      annullatoIl: true,
      fornitoreNome: true,
      fornitoreCosto: true,
      totale: true,
      valuta: true,
      negozioNome: true,
    },
  })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato.' }, { status: 404 })

  if (azione === 'allinea-stato') {
    if (!STATI_IMPOSSIBILI_SE_PAGATO.includes(ordine.gestione)) {
      return NextResponse.json({ errore: 'Lo stato è già coerente col pagamento.' }, { status: 400 })
    }
    // ⚠️ `attesa_consegna` e non uno stato più avanti: il pagamento al
    // fornitore è partito, la consegna al cliente no — dire «consegnato»
    // sarebbe una bugia sulla bacheca di tutti.
    await db.ordine.update({
      where: { id: ordine.id },
      data: {
        gestione: 'attesa_consegna',
        gestioneIl: new Date(),
        gestioneDaId: io.id,
        gestioneDaNome: io.nome,
      },
    })
    return NextResponse.json({ ok: true, nuovoStato: 'attesa_consegna' })
  }

  // ── REGISTRA IL FORNITORE ──
  //
  // ⚠️ Si ricontrollano QUI le stesse condizioni della schermata. La pagina può
  // essere vecchia di dieci minuti — nel frattempo un collega può aver
  // registrato un altro fornitore, o annullato l'ordine — e un bottone premuto
  // su uno schermo stantio non deve poter sovrascrivere niente.
  const verdetto = decidi({
    richiestaId: corpo.richiestaId,
    intestatario: r.intestatario,
    iban: '',
    importo: r.importo,
    metodo: r.metodo,
    pagataIl: r.pagataIl.toISOString(),
    ordine: {
      id: ordine.id,
      numero: ordine.numero,
      negozioNome: ordine.negozioNome,
      clienteNome: ordine.clienteNome,
      totale: ordine.totale,
      valuta: ordine.valuta,
      gestione: ordine.gestione,
      annullato: !!ordine.annullatoIl,
      fornitoreNome: ordine.fornitoreNome,
      fornitoreCosto: ordine.fornitoreCosto,
    },
    registro: null,
  })
  if (verdetto.verdetto !== 'da-registrare') {
    return NextResponse.json({ errore: verdetto.frase }, { status: 409 })
  }

  await db.ordine.update({
    where: { id: ordine.id },
    data: {
      fornitoreNome: ordine.fornitoreNome || r.intestatario,
      fornitoreCosto: r.importo,
      // ⚠️ Da dove viene questo fatto si SCRIVE. Fra sei mesi la differenza fra
      // «l'ha detto chi ha telefonato» e «l'ho dedotto da un bonifico» è
      // esattamente ciò che serve per sapere quanto fidarsi.
      fornitoreNota: ordine.fornitoreNome
        ? 'Costo ricavato dal pagamento già fatto.'
        : `Ricavato dal pagamento già fatto a ${r.intestatario}.`,
      fornitoreDaId: io.id,
      fornitoreDaNome: io.nome,
      fornitoreIl: new Date(),
    },
  })
  const versoOrders = await comunicaCostoAOrders(
    ordine.numero,
    ordine.shopifyId,
    r.importo,
    ordine.fornitoreNome || r.intestatario
  )
  return NextResponse.json({
    ok: true,
    orders: versoOrders.ok ? { ok: true } : { ok: false, messaggio: versoOrders.messaggio },
  })
}
