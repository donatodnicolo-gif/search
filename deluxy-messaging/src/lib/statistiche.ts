import { db } from '@/lib/db'

// ── I NUMERI DELL'APP ──
//
// ⚠️⚠️ Chiesto dall'utente il 02/09/2026: «crea una sezione statistiche dove fai
// vedere tutte le KPI dell'app — esempio % di reclami su totale, tempo di
// gestione, tempo medio di risposta a chat, ecc.».
//
// TRE REGOLE, e valgono per ogni numero di questa pagina:
//
// 1. ⚠️⚠️ **Un numero senza la sua base non è una percentuale.** «3% di
//    reclami» su 12 ordini vuol dire "uno", e non è un dato: ogni tasso qui
//    porta con sé numeratore e denominatore, e la schermata li mostra.
// 2. ⚠️⚠️ **Mediana, non media**, sui tempi. Un ordine dimenticato tre mesi
//    sposta la media di tutti; la mediana dice quello che succede DAVVERO nella
//    metà dei casi. La media si mostra accanto, perché la differenza fra le due
//    è essa stessa un'informazione (se la media è il doppio, ci sono code
//    lunghe).
// 3. ⚠️⚠️ **Chi non ha il dato si ESCLUDE, non vale zero.** Un ordine senza
//    `gestioneIl` non è un ordine gestito in zero minuti: è un ordine di cui
//    non sappiamo il tempo, e sommarlo come zero abbasserebbe il tempo di tutti.
//    Per questo ogni tempo dice anche **su quanti casi** è calcolato.

export type Tempo = {
  /** Mediana in minuti, o `null` se non ci sono casi misurabili. */
  mediana: number | null
  media: number | null
  /** Su quanti casi: senza, la mediana non si sa quanto pesa. */
  casi: number
}

export type Tasso = {
  quanti: number
  suQuanti: number
  /** In percentuale, o `null` quando la base è zero — mai «0%». */
  percento: number | null
}

export type Statistiche = {
  da: string
  a: string
  giorni: number
  ordini: {
    totale: number
    perMarchio: { nome: string; quanti: number }[]
    perStato: { stato: string; quanti: number }[]
    venduto: number
    scontrinoMedio: number | null
    /** Da quando l'ordine è entrato a quando è stato chiuso. */
    tempoDiGestione: Tempo
    gestiti: Tasso
    inApp: Tasso
    consegneSpostate: Tasso
  }
  servizio: {
    conversazioni: number
    messaggiRicevuti: number
    messaggiInviati: number
    /** Dal messaggio del cliente alla nostra prima risposta. */
    tempoDiRisposta: Tempo
    senzaRisposta: Tasso
    chiamate: number
    chiamateSenzaOrdine: Tasso
  }
  qualita: {
    reclami: Tasso
    reclamiGravi: Tasso
    rimborsiChiesti: number
    rimborsiEseguiti: number
    rimborsatoEuro: number
    /** Quanto si è reso su quanto si è venduto. */
    rimborsatoSuVenduto: Tasso
  }
  soldi: {
    richiestePagamento: number
    richiestePagate: Tasso
    tempoDiPagamento: Tempo
    preventivi: number
    preventiviInviati: Tasso
  }
  /** Quello che i numeri NON dicono: si scrive, non si lascia intuire. */
  avvertenze: string[]
}

function tasso(quanti: number, suQuanti: number): Tasso {
  return {
    quanti,
    suQuanti,
    // ⚠️ `null` e non 0 quando la base è vuota: «0% di reclami su 0 ordini» è
    // una frase che sembra un complimento e non vuol dire niente.
    percento: suQuanti > 0 ? Math.round((quanti / suQuanti) * 1000) / 10 : null,
  }
}

/** Mediana e media di una lista di minuti, senza i buchi. */
function tempoDa(minuti: number[]): Tempo {
  const buoni = minuti.filter((m) => Number.isFinite(m) && m >= 0).sort((a, b) => a - b)
  if (!buoni.length) return { mediana: null, media: null, casi: 0 }
  const meta = Math.floor(buoni.length / 2)
  const mediana =
    buoni.length % 2 ? buoni[meta] : Math.round(((buoni[meta - 1] + buoni[meta]) / 2) * 10) / 10
  const media = Math.round((buoni.reduce((s, m) => s + m, 0) / buoni.length) * 10) / 10
  return { mediana: Math.round(mediana * 10) / 10, media, casi: buoni.length }
}

/**
 * Tutti i numeri del periodo.
 *
 * ⚠️ Un giro di query per volta e nessun `findMany` che porti a casa gli ordini
 * interi: qui si contano righe, e portarsi in memoria 1.500 ordini con dentro
 * note e indirizzi per contarli sarebbe megabyte buttati (Libro PERFORMANCE).
 * Le due mediane sono in SQL, dove il database fa il lavoro.
 */
export async function statistiche(giorni = 30): Promise<Statistiche> {
  const finestra = Math.min(Math.max(giorni, 1), 365)
  const a = new Date()
  const da = new Date(a.getTime() - finestra * 24 * 3600 * 1000)
  const avvertenze: string[] = []

  const [
    ordiniTotale,
    perMarchio,
    perStato,
    somme,
    gestiti,
    inApp,
    spostate,
    conversazioni,
    messaggiIn,
    messaggiOut,
    chiamate,
    chiamateSenzaOrdine,
    reclami,
    reclamiGravi,
    rimborsiChiesti,
    rimborsiEseguiti,
    rimborsatoSomma,
    richieste,
    richiestePagate,
    preventivi,
    preventiviInviati,
  ] = await Promise.all([
    db.ordine.count({ where: { data: { gte: da, lt: a } } }),
    db.ordine.groupBy({ by: ['negozioNome'], where: { data: { gte: da, lt: a } }, _count: true }),
    db.ordine.groupBy({ by: ['gestione'], where: { data: { gte: da, lt: a } }, _count: true }),
    db.ordine.aggregate({ where: { data: { gte: da, lt: a } }, _sum: { totale: true } }),
    db.ordine.count({ where: { data: { gte: da, lt: a }, gestione: 'gestito' } }),
    db.ordine.count({ where: { data: { gte: da, lt: a }, gestione: 'in_app' } }),
    db.ordine.count({ where: { data: { gte: da, lt: a }, consegnaSpostata: true } }),
    db.conversazione.count({ where: { creatoIl: { gte: da, lt: a } } }),
    db.messaggio.count({ where: { creatoIl: { gte: da, lt: a }, direzione: 'in' } }),
    db.messaggio.count({ where: { creatoIl: { gte: da, lt: a }, direzione: 'out' } }),
    db.chiamata.count({ where: { quando: { gte: da, lt: a } } }),
    db.chiamata.count({ where: { quando: { gte: da, lt: a }, ordineId: '' } }),
    db.reclamo.count({ where: { creatoIl: { gte: da, lt: a } } }),
    db.reclamo.count({ where: { creatoIl: { gte: da, lt: a }, gravita: 3 } }),
    db.rimborso.count({ where: { creatoIl: { gte: da, lt: a } } }),
    db.rimborso.count({ where: { creatoIl: { gte: da, lt: a }, stato: 'eseguito' } }),
    db.rimborso.aggregate({
      where: { creatoIl: { gte: da, lt: a }, stato: 'eseguito' },
      _sum: { importo: true },
    }),
    db.richiestaPagamento.count({ where: { creatoIl: { gte: da, lt: a } } }),
    db.richiestaPagamento.count({
      where: { creatoIl: { gte: da, lt: a }, pagataIl: { not: null } },
    }),
    db.preventivo.count({ where: { creatoIl: { gte: da, lt: a } } }),
    db.preventivo.count({ where: { creatoIl: { gte: da, lt: a }, inviatoIl: { not: null } } }),
  ])

  const venduto = Math.round((somme._sum.totale ?? 0) * 100) / 100

  // ── IL TEMPO DI GESTIONE ──
  //
  // Da quando l'ordine entra da noi a quando qualcuno lo chiude.
  // ⚠️ Solo gli ordini CHIUSI, e solo quelli che hanno la data di chiusura:
  // contare gli altri come zero, o come «ancora aperti = tempo infinito»,
  // direbbe due bugie diverse.
  const chiusi = await db.ordine.findMany({
    where: { data: { gte: da, lt: a }, gestione: 'gestito', gestioneIl: { not: null } },
    select: { creatoIl: true, gestioneIl: true },
    take: 5000,
  })
  const tempoDiGestione = tempoDa(
    chiusi.map((o) => ((o.gestioneIl as Date).getTime() - o.creatoIl.getTime()) / 60000)
  )
  if (chiusi.length >= 5000) {
    avvertenze.push(
      'Il tempo di gestione è calcolato sui primi 5.000 ordini chiusi del periodo: con più di così, restringi il periodo.'
    )
  }

  // ── IL TEMPO DI RISPOSTA IN CHAT ──
  //
  // ⚠️⚠️ Si misura in SQL e non in memoria: servono i messaggi a coppie
  // (cliente → nostra risposta) su tutta la finestra, e portarseli a casa
  // vorrebbe dire caricare decine di migliaia di testi per calcolare delle
  // sottrazioni. `LAG` fa la coppia dentro il database.
  //
  // ⚠️ Si contano solo le risposte a un messaggio del cliente: due nostri
  // messaggi di fila non sono una risposta, e le note interne (`tipo = 'nota'`)
  // non le legge nessun cliente.
  const risposte = await db.$queryRawUnsafe<{ minuti: number }[]>(
    `WITH m AS (
       SELECT "conversazioneId", direzione, "creatoIl",
              LAG(direzione)   OVER (PARTITION BY "conversazioneId" ORDER BY "creatoIl") AS prima_dir,
              LAG("creatoIl")  OVER (PARTITION BY "conversazioneId" ORDER BY "creatoIl") AS prima_ora
       FROM messaging."Messaggio"
       WHERE "creatoIl" >= $1 AND "creatoIl" < $2 AND tipo <> 'nota'
     )
     SELECT EXTRACT(EPOCH FROM ("creatoIl" - prima_ora)) / 60 AS minuti
     FROM m
     WHERE direzione = 'out' AND prima_dir = 'in' AND prima_ora IS NOT NULL`,
    da,
    a
  )
  const tempoDiRisposta = tempoDa(risposte.map((r) => Number(r.minuti)))

  // Conversazioni del periodo in cui il cliente ha scritto e NESSUNO ha
  // risposto. ⚠️ È il numero che il tempo medio nasconde: una conversazione
  // senza risposta non ha un tempo, quindi dalla mediana sparisce.
  const senzaRisposta = await db.$queryRawUnsafe<{ quante: bigint }[]>(
    `SELECT COUNT(*)::bigint AS quante FROM (
       SELECT c.id
       FROM messaging."Conversazione" c
       JOIN messaging."Messaggio" m ON m."conversazioneId" = c.id
       WHERE c."creatoIl" >= $1 AND c."creatoIl" < $2 AND m.tipo <> 'nota'
       GROUP BY c.id
       HAVING COUNT(*) FILTER (WHERE m.direzione = 'in') > 0
          AND COUNT(*) FILTER (WHERE m.direzione = 'out') = 0
     ) x`,
    da,
    a
  )

  // ── QUANTO CI METTE UNA RICHIESTA DI PAGAMENTO A ESSERE PAGATA ──
  const pagate = await db.richiestaPagamento.findMany({
    where: { creatoIl: { gte: da, lt: a }, pagataIl: { not: null } },
    select: { creatoIl: true, pagataIl: true },
    take: 5000,
  })
  const tempoDiPagamento = tempoDa(
    pagate.map((p) => ((p.pagataIl as Date).getTime() - p.creatoIl.getTime()) / 60000)
  )

  // ── LE AVVERTENZE ──
  //
  // ⚠️⚠️ Si scrivono, non si lasciano intuire: un numero letto senza sapere che
  // cosa NON conta è peggio di nessun numero.
  avvertenze.push(
    'Il tempo di risposta conta anche le ore di notte e i festivi: un messaggio delle 23 risposto alle 9 pesa dieci ore.'
  )
  if (tempoDiRisposta.casi < 30) {
    avvertenze.push(
      `Il tempo di risposta è calcolato su ${tempoDiRisposta.casi} risposte: pochi casi, la mediana balla.`
    )
  }
  if (ordiniTotale < 30) {
    avvertenze.push(
      `Nel periodo ci sono ${ordiniTotale} ordini: su questi numeri una percentuale dice poco.`
    )
  }
  avvertenze.push(
    'I reclami e i rimborsi sono contati per DATA DI APERTURA, non per data dell’ordine: un reclamo di oggi può riguardare un ordine del mese scorso.'
  )

  return {
    da: da.toISOString(),
    a: a.toISOString(),
    giorni: finestra,
    ordini: {
      totale: ordiniTotale,
      perMarchio: perMarchio
        .map((m) => ({ nome: m.negozioNome || '(senza marchio)', quanti: m._count }))
        .sort((x, y) => y.quanti - x.quanti),
      perStato: perStato
        .map((s) => ({ stato: s.gestione || '(vuoto)', quanti: s._count }))
        .sort((x, y) => y.quanti - x.quanti),
      venduto,
      scontrinoMedio: ordiniTotale > 0 ? Math.round((venduto / ordiniTotale) * 100) / 100 : null,
      tempoDiGestione,
      gestiti: tasso(gestiti, ordiniTotale),
      inApp: tasso(inApp, ordiniTotale),
      consegneSpostate: tasso(spostate, ordiniTotale),
    },
    servizio: {
      conversazioni,
      messaggiRicevuti: messaggiIn,
      messaggiInviati: messaggiOut,
      tempoDiRisposta,
      senzaRisposta: tasso(Number(senzaRisposta[0]?.quante ?? 0), conversazioni),
      chiamate,
      chiamateSenzaOrdine: tasso(chiamateSenzaOrdine, chiamate),
    },
    qualita: {
      reclami: tasso(reclami, ordiniTotale),
      reclamiGravi: tasso(reclamiGravi, reclami),
      rimborsiChiesti,
      rimborsiEseguiti,
      rimborsatoEuro: Math.round((rimborsatoSomma._sum.importo ?? 0) * 100) / 100,
      rimborsatoSuVenduto: {
        quanti: Math.round((rimborsatoSomma._sum.importo ?? 0) * 100) / 100,
        suQuanti: venduto,
        percento:
          venduto > 0
            ? Math.round(((rimborsatoSomma._sum.importo ?? 0) / venduto) * 1000) / 10
            : null,
      },
    },
    soldi: {
      richiestePagamento: richieste,
      richiestePagate: tasso(richiestePagate, richieste),
      tempoDiPagamento,
      preventivi,
      preventiviInviati: tasso(preventiviInviati, preventivi),
    },
    avvertenze,
  }
}
