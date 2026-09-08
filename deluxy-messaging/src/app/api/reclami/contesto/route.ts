import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { righeOrdineDaOrders } from '@/lib/orders'
import { partnerAttivi } from '@/lib/anagrafiche'
import { chiaveNome, paroleTrovate, CORRISPONDENZA_VERA } from '@/lib/cerca-fornitore'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// IL CONTESTO DI UN RECLAMO: cosa c'era in quell'ordine e chi l'ha preparato.
//
//   GET /api/reclami/contesto?ordine=%232891&ordineId=…
//
// ⚠️⚠️ Serve a due richieste dell'utente (07/09/2026):
//  1. «in caso di reclamo di una vendita con più prodotti fai scegliere uno o
//     più prodotti su cui è aperto il reclamo» — senza, un reclamo su un ordine
//     da tre articoli non dice su QUALE, e chi lo lavora deve riaprire Shopify.
//  2. «se l'ordine è stato gestito da app associa già il reclamo al partner che
//     l'ha fatto» — il nome sta già sul nostro ordine (`appPartner`, copiato
//     dalla piattaforma consegne): chiederlo di nuovo a mano è chiedere una
//     cosa che sappiamo già, e chi risponde a mano sbaglia il nome.
//
// ⚠️ Non fallisce mai in blocco: se Orders non risponde, tornano i campi vuoti
// e il modulo si compila a mano. Un reclamo si deve poter aprire sempre.
export async function GET(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const numero = (p.get('ordine') ?? '').trim()
  const ordineId = (p.get('ordineId') ?? '').trim()
  if (!numero && !ordineId) {
    return NextResponse.json({ prodotti: [], partner: null, nota: '' })
  }

  // La nostra copia dell'ordine: da qui vengono `shopifyId` (che disambigua lo
  // stesso numero su più negozi) e il partner della piattaforma.
  const locale = await db.ordine
    .findFirst({
      where: ordineId ? { id: ordineId } : { numero: numero.startsWith('#') ? numero : `#${numero}` },
      select: {
        numero: true,
        shopifyId: true,
        appPartner: true,
        appConsegnaId: true,
        appStato: true,
        gestione: true,
        fornitoreNome: true,
      },
    })
    .catch(() => null)

  // ── I PRODOTTI ──
  const righe = await righeOrdineDaOrders(locale?.numero ?? numero, locale?.shopifyId ?? '').catch(
    () => null
  )
  const prodotti =
    righe && righe.stato === 'ok'
      ? righe.righe.map((r) => ({
          titolo: r.titolo,
          variante: r.variante,
          sku: r.sku,
          quantita: r.quantita,
          prezzo: r.prezzo,
        }))
      : []

  // ── IL PARTNER CHE L'HA PREPARATO ──
  //
  // ⚠️ Si propone SOLO se l'ordine è passato dalla piattaforma consegne
  // (`appPartner` valorizzato): è un fatto, non una deduzione. Il fornitore
  // scritto a mano sull'ordine (`fornitoreNome`) NON si usa qui: non è detto
  // che sia un partner del registro, e la colpa di un reclamo è una cosa che si
  // scrive addosso a qualcuno — meglio vuota che sbagliata.
  //
  // ⚠️⚠️ Si cerca SOLO fra i partner ATTIVI, cioè esattamente quelli che il
  // modulo mette nella tendina. Cercando anche fra prospect e dismessi
  // (`stato: 'tutti'`) è successo davvero, misurato il 08/09/2026 sull'ordine
  // #12901: il registro ha DUE schede per la stessa cioccolateria — «Enrico
  // Rizzi» (attiva, id cmrovrthj…) e «Enrico Rizzi Milano» (id cmruwipns…) —
  // e il nome della piattaforma combaciava alla lettera con la SECONDA. Il
  // reclamo si prendeva quell'id, che nella tendina non c'è: a schermo il
  // campo restava vuoto e il reclamo finiva addosso a una scheda morta.
  //
  // ⚠️ Il nome della piattaforma non è il nome del registro: «Enrico Rizzi
  // Milano» lì, «Enrico Rizzi» con ragione sociale «ENRICO RIZZI MILANO
  // S.R.L.» qui. Quindi non basta l'uguaglianza: si usa lo stesso punteggio
  // della ricerca fornitori, e si accetta solo se TUTTE le parole del nome
  // combaciano davvero (`0,7 × parole`) e c'è un solo candidato in cima.
  // Meglio nessuna proposta che la scheda sbagliata: la colpa di un reclamo si
  // scrive addosso a qualcuno.
  let partner: { id: string; nome: string; da: string; nelRegistro: boolean } | null = null
  const nomeApp = (locale?.appPartner ?? '').trim()
  if (nomeApp) {
    const elenco = await partnerAttivi({ q: nomeApp, perPagina: 50, stato: 'attivo' }).catch(() => null)
    const candidati = elenco && elenco.stato === 'ok' ? elenco.partner : []
    const esatto = candidati.find(
      (x) =>
        chiaveNome(x.nome) === chiaveNome(nomeApp) ||
        chiaveNome(x.ragioneSociale ?? '') === chiaveNome(nomeApp)
    )
    let trovato = esatto ?? null
    if (!trovato && candidati.length) {
      const parole = chiaveNome(nomeApp).split(' ').filter((p) => p.length >= 3).length
      const soglia = Math.max(CORRISPONDENZA_VERA, parole * CORRISPONDENZA_VERA)
      const punteggi = candidati
        .map((x) => ({ x, punti: paroleTrovate({ nome: x.nome, ragioneSociale: x.ragioneSociale ?? '' }, nomeApp) }))
        .filter((r) => r.punti >= soglia)
        .sort((a, b) => b.punti - a.punti)
      // Un solo candidato in cima: se due pareggiano, la scelta la fa una persona.
      if (punteggi.length === 1 || (punteggi.length > 1 && punteggi[0].punti > punteggi[1].punti)) {
        trovato = punteggi[0].x
      }
    }
    // ⚠️ Anche senza id si propone il NOME: il reclamo lo tiene denormalizzato
    // (`colpaNome`), e sapere «l'ha fatto Artista Locale» vale comunque — ma
    // il modulo lo DICE che quel nome nella tendina non c'è.
    partner = {
      id: trovato?.id ?? '',
      nome: trovato?.nome || nomeApp,
      da: 'piattaforma consegne',
      nelRegistro: Boolean(trovato),
    }
  }

  return NextResponse.json({
    prodotti,
    partner,
    nota:
      righe && righe.stato !== 'ok'
        ? "Le righe dell'ordine non sono arrivate da Orders: scrivi a mano su cosa è il reclamo."
        : '',
  })
}
