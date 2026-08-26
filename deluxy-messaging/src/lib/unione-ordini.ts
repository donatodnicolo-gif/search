import { db } from './db'
import { numeroConCancelletto } from './link-ordine'

// DUE ORDINI CHE SONO UNA VENDITA SOLA.
//
// ⚠️⚠️ Il caso vero (26/08/2026): «ada hunca» ha pagato la stessa torta con due
// ordini — #1777 da 200 € e #1798 da 170 € — e il fornitore è stato registrato
// su uno solo, col costo intero (253 €). Su quell'ordine, da solo, Orders
// calcola un margine di **−43,44 €**; sui due insieme (370 contro 253) è
// positivo. Senza unirli il lavoro si conta due volte, un margine è falso in
// negativo, e nelle KPI quel falso finisce addosso a un operatore.
//
// ⚠️⚠️ QUELLO CHE L'UNIONE **NON** FA: non tocca Deluxy Orders. Là restano due
// ordini con due margini, ed è giusto che questa app non riscriva l'economia di
// un'altra (Standard §7). Qui si dice «sono un lavoro solo» e lo si mostra:
// perché i conti tornino anche di là serve una decisione che riguarda Orders.

export type EsitoUnione = { ok: boolean; messaggio: string }

/**
 * Unisce `secondario` a `principale` (numeri d'ordine, col o senza cancelletto).
 *
 * ⚠️ Si controlla tutto PRIMA di scrivere, e ogni rifiuto dice perché: un
 * bottone che non fa niente e non spiega si preme tre volte e poi si aggira.
 */
export async function unisciOrdini(
  idPrincipale: string,
  numeroSecondario: string,
  chi = ''
): Promise<EsitoUnione> {
  const principale = await db.ordine.findUnique({
    where: { id: idPrincipale },
    select: { id: true, numero: true, negozioNome: true, clienteNome: true, unitoA: true },
  })
  if (!principale) return { ok: false, messaggio: 'Ordine non trovato.' }

  // ⚠️ Un ordine già unito a un altro non può fare da principale: la catena
  // A←B←C non la ricostruisce nessuno. Si unisce a chi sta in cima.
  if (principale.unitoA) {
    return {
      ok: false,
      messaggio: `${principale.numero} è già unito a ${principale.unitoA}: unisci a quello.`,
    }
  }

  const cercato = numeroConCancelletto(numeroSecondario)
  if (!cercato) return { ok: false, messaggio: 'Scrivi il numero dell’ordine da unire.' }
  if (cercato === principale.numero) {
    return { ok: false, messaggio: 'È lo stesso ordine.' }
  }

  const trovati = await db.ordine.findMany({
    where: { numero: cercato },
    select: {
      id: true,
      numero: true,
      negozioNome: true,
      clienteNome: true,
      totale: true,
      unitoA: true,
    },
  })
  if (trovati.length === 0) {
    return { ok: false, messaggio: `${cercato} non è fra i nostri ordini.` }
  }
  // ⚠️⚠️ Lo stesso numero esiste su più negozi («#1733» è di Cake e di Deluxy):
  // scegliere il primo vorrebbe dire unire l'ordine di un altro cliente, e da
  // lì in poi due lavori diversi diventerebbero uno.
  if (trovati.length > 1) {
    const suo = trovati.filter((o) => o.negozioNome === principale.negozioNome)
    if (suo.length !== 1) {
      return {
        ok: false,
        messaggio: `${cercato} esiste su più negozi (${trovati.map((o) => o.negozioNome).join(', ')}): non so quale unire.`,
      }
    }
    trovati.splice(0, trovati.length, ...suo)
  }
  const secondario = trovati[0]

  if (secondario.unitoA && secondario.unitoA !== principale.numero) {
    return {
      ok: false,
      messaggio: `${secondario.numero} è già unito a ${secondario.unitoA}: prima disfa quell'unione.`,
    }
  }
  // Un principale non può diventare secondario di qualcun altro senza accorgersene.
  const suoiFigli = await db.ordine.count({ where: { unitoA: secondario.numero } })
  if (suoiFigli > 0) {
    return {
      ok: false,
      messaggio: `${secondario.numero} ha già altri ordini uniti a sé: unisci quelli a ${principale.numero}, oppure disfa.`,
    }
  }

  // ⚠️ Il cliente diverso NON blocca (capita: due nomi, un'unica persona), ma si
  // dice: chi unisce deve sapere che sta mettendo insieme due nomi.
  const avviso =
    (secondario.clienteNome || '').trim().toLowerCase() !==
    (principale.clienteNome || '').trim().toLowerCase()
      ? ` ⚠️ Attenzione: i clienti sono scritti diversi (${principale.clienteNome || '—'} / ${secondario.clienteNome || '—'}).`
      : ''

  await db.ordine.update({
    where: { id: secondario.id },
    data: { unitoA: principale.numero, unitoIl: new Date(), unitoDaNome: chi },
  })

  const soldi = secondario.totale
    ? ` (${secondario.totale.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })})`
    : ''
  return {
    ok: true,
    messaggio:
      `${secondario.numero}${soldi} è unito a ${principale.numero}: da qui in poi si lavorano come un ordine solo.` +
      // ⚠️⚠️ Si dice SUBITO quello che l'unione NON fa. Scoprirlo fra un mese
      // guardando un margine sbagliato sarebbe peggio che leggerlo adesso.
      ' ⚠️ In Deluxy Orders restano due ordini, ognuno col suo margine: là il conto non si aggiusta da qui.' +
      avviso,
  }
}

/**
 * Disfa l'unione: l'ordine torna un lavoro a sé.
 *
 * ⚠️ Non si cancella niente, si toglie il legame — e finché c'è resta scritto
 * chi l'aveva unito: un'unione fatta per sbaglio si capisce solo sapendo chi e
 * quando.
 */
export async function disfaUnione(idSecondario: string): Promise<EsitoUnione> {
  const o = await db.ordine.findUnique({
    where: { id: idSecondario },
    select: { numero: true, unitoA: true },
  })
  if (!o) return { ok: false, messaggio: 'Ordine non trovato.' }
  if (!o.unitoA) return { ok: false, messaggio: `${o.numero} non è unito a niente.` }
  await db.ordine.update({
    where: { id: idSecondario },
    data: { unitoA: '', unitoIl: null, unitoDaNome: '' },
  })
  return { ok: true, messaggio: `${o.numero} torna un ordine a sé.` }
}

/** Il totale di un ordine più quello di tutti gli ordini uniti a lui. */
export async function totaleConUniti(numero: string, totaleSuo: number): Promise<{
  totale: number
  uniti: { numero: string; totale: number }[]
}> {
  const uniti = await db.ordine.findMany({
    where: { unitoA: numero },
    select: { numero: true, totale: true },
    orderBy: { data: 'asc' },
  })
  return {
    // ⚠️ È questa la cifra su cui ha senso guardare il margine: il costo del
    // fornitore è uno solo, e sta su uno solo dei due ordini.
    totale: Math.round((totaleSuo + uniti.reduce((s, o) => s + o.totale, 0)) * 100) / 100,
    uniti,
  }
}
