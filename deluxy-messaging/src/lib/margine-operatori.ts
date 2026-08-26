import { db } from './db'
import { soldiOrdineDaOrders } from './orders'

// QUANTO MARGINE HA GENERATO CIASCUN OPERATORE.
//
// ⚠️⚠️ IL MARGINE SI LEGGE DA DELUXY ORDERS, non si rifà qui. Lo Standard §7.4
// dice che si calcola solo là, ed è al **netto IVA**: rifarlo come
// «totale − costo» darebbe un numero più alto e altrettanto credibile, e le due
// schermate direbbero due cifre diverse sulla stessa cosa senza che nessuna dia
// errore. Misurato su #2798: 250 − 150 fa 100 lordi, ma il margine vero è 81,97.
//
// ⚠️⚠️ A CHI SI ATTRIBUISCE, e perché proprio a lui: all'operatore che ha
// **assegnato il fornitore** (`Ordine.fornitoreDaId`), perché il margine nasce
// dal COSTO, e il costo lo decide chi tratta col fornitore. Chi ha chiuso
// l'ordine dopo, o chi ha risposto al cliente, non ha cambiato quella cifra.
//
// ⚠️⚠️ E si contano solo le assegnazioni fatte da una PERSONA. La riconciliazione
// dei pagamenti scrive un id FINTO («riconciliazione-pagamenti», «automatismo»),
// non quello di chi ha premuto: misurato, 5 ordini su 21. Il loro margine e vero
// e si conta — ma fuori classifica, perche attribuirlo a qualcuno vorrebbe dire
// regalare a un operatore il lavoro di un cron.

/** Quanti ordini al massimo si chiedono a Orders in un giro. */
const TETTO = 120

export type MargineOperatore = {
  utenteId: string
  nome: string
  /** La somma dei margini letti da Orders, in euro. */
  margine: number
  /** Su quanti ordini quel margine è stato calcolato. */
  ordini: number
  /**
   * Ordini assegnati da lui di cui Orders NON sa dire il margine.
   *
   * ⚠️ Non valgono zero e non si sommano: valgono «non lo so». Sono gli ordini
   * senza costo scritto, o quelli che Orders non conosce. Si mostrano a parte,
   * perché un totale che tace quello che non sa vale meno di uno che lo ammette.
   */
  senzaMargine: number
}

export type EsitoMargini = {
  righe: MargineOperatore[]
  /** true = c'erano più ordini del tetto e il conto è parziale. Si dice. */
  parziale: boolean
  /**
   * Il margine degli ordini assegnati da un AUTOMATISMO, non da una persona.
   *
   * ⚠️⚠️ Non si attribuisce a nessuno, ma non si nasconde: senza, la somma
   * delle colonne non tornerebbe col margine dell'azienda e chi controlla
   * penserebbe a un errore. Qui invece si legge: «tot € li ha fatti la
   * riconciliazione automatica».
   */
  automatismi: { margine: number; ordini: number }
  /** Vuoto se è andato tutto bene. */
  nota: string
}

/**
 * I margini generati nel periodo, per operatore.
 *
 * ⚠️ Si chiede a Orders un ordine per volta: non c'è una rotta che dia i margini
 * in blocco. Per questo c'è un tetto, e quando scatta **si dice** — un conto
 * troncato che sembra completo è peggio di un conto assente.
 */
export async function marginiPerOperatore(da: Date, a: Date): Promise<EsitoMargini> {
  // ⚠️⚠️ CHI È UNA PERSONA E CHI NO. La riconciliazione dei pagamenti scrive
  // `fornitoreDaId` con un id FINTO («riconciliazione-pagamenti»,
  // «automatismo»), non con l'id di chi ha premuto: misurato il 26/08/2026, 5
  // ordini su 21. Filtrando solo per «id non vuoto», in classifica sarebbero
  // comparsi due operatori che non esistono — con dei margini veri accanto.
  const utenti = new Set((await db.utente.findMany({ select: { id: true } })).map((u) => u.id))

  const ordini = await db.ordine.findMany({
    where: {
      // Solo chi è stato assegnato DA UNA PERSONA, in questo periodo.
      fornitoreDaId: { not: '' },
      fornitoreIl: { gte: da, lt: a },
    },
    select: {
      numero: true,
      shopifyId: true,
      fornitoreDaId: true,
      fornitoreDaNome: true,
    },
    orderBy: { fornitoreIl: 'desc' },
    take: TETTO + 1,
  })

  const parziale = ordini.length > TETTO
  const daChiedere = parziale ? ordini.slice(0, TETTO) : ordini

  const automatismi = { margine: 0, ordini: 0 }
  const per = new Map<string, MargineOperatore>()
  const riga = (id: string, nome: string) => {
    const g = per.get(id) ?? { utenteId: id, nome: nome || 'Senza nome', margine: 0, ordini: 0, senzaMargine: 0 }
    per.set(id, g)
    return g
  }

  // ⚠️ In parallelo a piccoli gruppi: in fila sarebbero decine di secondi, tutte
  // insieme si prende un rifiuto da Orders.
  const GRUPPO = 8
  let orders_muto = false
  for (let i = 0; i < daChiedere.length; i += GRUPPO) {
    const pezzo = daChiedere.slice(i, i + GRUPPO)
    const soldi = await Promise.all(
      pezzo.map((o) => soldiOrdineDaOrders(o.numero, o.shopifyId).catch(() => null))
    )
    pezzo.forEach((o, k) => {
      const s = soldi[k]
      if (!s) orders_muto = true
      // ⚠️ Assegnato da un automatismo: il margine è vero e si conta, ma non è
      // di nessuno. Metterlo in classifica regalerebbe a un operatore il
      // lavoro di un cron.
      if (!utenti.has(o.fornitoreDaId)) {
        if (s && typeof s.margine === 'number') {
          automatismi.margine += s.margine
          automatismi.ordini += 1
        }
        return
      }
      const r = riga(o.fornitoreDaId, o.fornitoreDaNome)
      // ⚠️ `null` non è zero: l'ordine senza costo, o che Orders non conosce,
      // finisce fra i «senza margine» e NON abbassa la somma.
      if (s && typeof s.margine === 'number') {
        r.margine += s.margine
        r.ordini += 1
      } else {
        r.senzaMargine += 1
      }
    })
  }

  const righe = [...per.values()]
    .map((r) => ({ ...r, margine: Math.round(r.margine * 100) / 100 }))
    .sort((x, y) => y.margine - x.margine)

  return {
    righe,
    automatismi: { margine: Math.round(automatismi.margine * 100) / 100, ordini: automatismi.ordini },
    parziale,
    nota: parziale
      ? `Contati i ${TETTO} ordini più recenti del periodo: gli altri non sono nel totale.`
      : orders_muto
        ? 'Su qualche ordine Deluxy Orders non ha risposto: quelli sono fra i «senza margine».'
        : automatismi.ordini
          ? `Fuori classifica: ${automatismi.margine.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} su ${automatismi.ordini} ordini in cui il fornitore l'ha scritto la riconciliazione automatica, non una persona.`
          : '',
  }
}
