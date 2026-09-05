import { db } from './db'
import { numeroConCancelletto } from './link-ordine'
import { chiaveDi, mappaUnioni } from './clienti-uniti'

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

// ── GLI ALTRI ORDINI DELLO STESSO CLIENTE, PROPOSTI PRIMA CHE LI SI CERCHI ──
//
// Chiesto dall'utente il 05/09/2026: «unisci a un altro ordine: proponi già
// suggerimenti sulla base di altri acquisti fatti da quel cliente». Fino a qui
// il numero da unire si doveva SAPERE e battere a mano: chi apriva #1777 non
// aveva modo di scoprire che la stessa persona aveva pagato anche #1798, se
// non uscendo dalla scheda e cercandolo in rubrica.
//
// ⚠️⚠️ Il cliente si riconosce come nella RUBRICA (`clienti-uniti.ts`): stesso
// telefono (ultime 9 cifre) o, in mancanza, stessa email, seguendo le unioni
// di rubrica fatte a mano. MAI per nome: gli omonimi esistono, e proporre
// l'ordine di un omonimo vuol dire far unire due lavori di due persone.
//
// ⚠️ Si propongono solo ordini che si POSSONO unire con le regole qui sopra
// (a sé, senza figli, non annullati): un suggerimento che poi il bottone
// rifiuta insegna a non guardare i suggerimenti.
//
// ⚠️ È un SUGGERIMENTO, non un'unione: a unire resta una persona. Due ordini
// dello stesso cliente a un mese di distanza sono quasi sempre due regali.

export type CandidatoUnione = {
  id: string
  numero: string
  totale: number
  data: string
  dataConsegna: string | null
  citta: string
  gestione: string
  /** Perché lo proponiamo, in una riga da leggere. */
  perche: string
  /** Stesso giorno di consegna: il segnale più forte di «è la stessa vendita». */
  forte: boolean
}

type ChiaviCliente = { telefoni: string[]; email: string[] }

/** Le ultime 9 cifre di un telefono, o '' se non è un telefono. */
function cifreTelefono(telefono: string): string {
  const cifre = (telefono ?? '').replace(/[^\d]/g, '')
  return cifre.length >= 6 ? cifre.slice(-9) : ''
}

/**
 * Tutto ciò che vale «questo cliente»: il suo telefono E la sua email (la
 * rubrica ne tiene una sola come chiave, qui servono entrambe), più le righe
 * di rubrica che qualcuno ha unito a mano alla sua.
 */
async function chiaviDelCliente(telefono: string, email: string): Promise<ChiaviCliente> {
  const telefoni = new Set<string>()
  const mail = new Set<string>()
  const t = cifreTelefono(telefono)
  if (t) telefoni.add(t)
  const e = (email ?? '').trim().toLowerCase()
  if (e) mail.add(e)

  const propria = chiaveDi(telefono, email)
  if (propria) {
    const unioni = await mappaUnioni()
    const capo = unioni.get(propria) ?? propria
    const tutte = new Set<string>([propria, capo])
    for (const [chiave, principale] of unioni) if (principale === capo) tutte.add(chiave)
    for (const k of tutte) {
      if (k.startsWith('tel:')) telefoni.add(k.slice(4))
      else if (k.startsWith('mail:')) mail.add(k.slice(5))
    }
  }
  return { telefoni: [...telefoni], email: [...mail] }
}

function giorno(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : ''
}

function dataIt(d: Date): string {
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/**
 * Gli altri ordini che abbiamo in casa dello stesso cliente di `idPrincipale`,
 * unibili a lui, dal più probabile al meno: prima chi ha la STESSA data di
 * consegna, poi chi è stato ordinato più vicino nel tempo.
 *
 * ⚠️ La tabella locale copre solo gli ultimi due mesi: è la stessa finestra
 * dentro cui un ordine si può unire (unisciOrdini lo cerca lì), quindi non è
 * un limite in più. Ma è un limite: si dice a schermo.
 */
export async function candidatiUnione(idPrincipale: string, tetto = 6): Promise<CandidatoUnione[]> {
  const p = await db.ordine.findUnique({
    where: { id: idPrincipale },
    select: {
      id: true,
      numero: true,
      telefono: true,
      email: true,
      data: true,
      dataConsegna: true,
      unitoA: true,
    },
  })
  // Un ordine già unito non fa da principale (regola di unisciOrdini): nessun
  // suggerimento, il riquadro dice di lavorare dall'altro.
  if (!p || p.unitoA) return []
  const chiavi = await chiaviDelCliente(p.telefono, p.email)
  if (!chiavi.telefoni.length && !chiavi.email.length) return []

  // ⚠️⚠️ Il telefono si confronta SULLE CIFRE, nel database. In tabella lo
  // stesso cliente sta come «+393289167199» su un ordine e «+39 350 846 2424»
  // su un altro: un `endsWith` sul testo non trova niente e il riquadro resta
  // vuoto in silenzio — è successo, provando su Rodrigo Taddeo (#2557/#2558),
  // dopo che otto telefoni a campione erano tutti senza spazi. Il filtro
  // stretto sta qui e non in una `take` a valle: filtrare dopo un `take`
  // vorrebbe dire perdere i candidati che stanno oltre il tetto.
  const idTrovati = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM messaging."Ordine"
    WHERE id <> ${p.id}
      AND "unitoA" = ''
      AND "annullatoIl" IS NULL
      AND (
        (${chiavi.telefoni.length} > 0
          AND RIGHT(regexp_replace(telefono, '\\D', '', 'g'), 9) = ANY(${chiavi.telefoni}::text[]))
        OR (${chiavi.email.length} > 0
          AND lower(trim(email)) = ANY(${chiavi.email}::text[]))
      )
    ORDER BY data DESC
    LIMIT 40`
  if (!idTrovati.length) return []

  const stessoCliente = await db.ordine.findMany({
    where: { id: { in: idTrovati.map((r) => r.id) } },
    select: {
      id: true,
      numero: true,
      totale: true,
      data: true,
      dataConsegna: true,
      citta: true,
      gestione: true,
    },
  })

  // Chi ha già ordini uniti a sé non può diventare secondario: si toglie PRIMA
  // di proporlo, per non proporre quello che il bottone poi rifiuta.
  const conFigli = await db.ordine.groupBy({
    by: ['unitoA'],
    where: { unitoA: { in: stessoCliente.map((o) => o.numero) } },
  })
  const principaliAltrui = new Set(conFigli.map((g) => g.unitoA))

  const giornoConsegna = giorno(p.dataConsegna)
  const ordinati = stessoCliente
    .filter((o) => !principaliAltrui.has(o.numero))
    .map((o) => {
      const forte = Boolean(giornoConsegna) && giorno(o.dataConsegna) === giornoConsegna
      const ore = Math.abs(o.data.getTime() - p.data.getTime()) / 36e5
      const giorni = Math.round(ore / 24)
      const quando =
        ore < 1
          ? 'ordinato nella stessa ora'
          : giorni === 0
            ? 'ordinato lo stesso giorno'
            : o.data < p.data
              ? `ordinato ${giorni} giorn${giorni === 1 ? 'o' : 'i'} prima`
              : `ordinato ${giorni} giorn${giorni === 1 ? 'o' : 'i'} dopo`
      const perche = forte
        ? `stessa consegna il ${dataIt(o.dataConsegna as Date)} · ${quando}`
        : o.dataConsegna
          ? `consegna il ${dataIt(o.dataConsegna)} · ${quando}`
          : quando
      return {
        id: o.id,
        numero: o.numero,
        totale: o.totale,
        data: o.data.toISOString(),
        dataConsegna: o.dataConsegna ? o.dataConsegna.toISOString() : null,
        citta: o.citta,
        gestione: o.gestione,
        perche,
        forte,
        distanza: ore,
      }
    })
    .sort((a, b) => Number(b.forte) - Number(a.forte) || a.distanza - b.distanza)
    .slice(0, tetto)

  return ordinati.map(({ distanza: _d, ...c }) => c)
}
