import { db } from './db'
import { graphqlNegozio, negozioConToken } from './shopify-negozio'
import { soldi, STATI_DA_LAVORARE } from './rimborsi'

// ── «QUESTO L'ABBIAMO GIÀ RIMBORSATO» ───────────────────────────────────────
//
// ⚠️⚠️ Chiesto dall'utente l'11/09/2026 sull'ordine #12868: «risulta già
// rimborsato su shopify, in questi casi chiudi in automatico».
//
// Il caso vero, misurato su quell'ordine: il rimborso di 135,00 € era stato
// fatto su Shopify alle 15:15:07 e la richiesta è stata scritta qui alle
// 15:16:43 — un minuto e mezzo DOPO. Da quel momento la richiesta è rimasta
// «da approvare» per otto giorni, in cima a una pagina che serve a dire che
// cosa c'è da fare. Non c'era niente da fare: i soldi erano già tornati al
// cliente.
//
// ⚠️ È anche una difesa contro il danno peggiore: una richiesta aperta su un
// ordine già rimborsato è un invito a rimborsare due volte. Il rimborso vero si
// ferma da solo (controlla `netPayment` su Shopify), ma la coda continuava a
// chiederlo.
//
// LE REGOLE, tutte per lo stesso motivo — qui si chiude d'ufficio una pratica
// di denaro, e sbagliare vuol dire dichiarare reso qualcosa che non lo è:
//   · si chiude SOLO se Shopify dice che è già stato reso almeno quanto si
//     chiede, contando anche le altre richieste di quello stesso ordine già
//     segnate eseguite (due richieste da 50 € su un rimborso di 50 € non si
//     chiudono tutte e due);
//   · la verità la dice SHOPIFY, non il nostro `statoPagamento`: quello arriva
//     da Orders con un giro di sincronizzazione, e un rimborso di due minuti fa
//     lì non c'è ancora;
//   · si scrive nell'esito quanto e quando, col numero d'ordine: fra sei mesi
//     «chiuso in automatico» da solo non spiegherebbe niente;
//   · la riga si prende con una scrittura condizionata sullo stato, come il
//     rimborso vero: se nel frattempo una persona ha deciso, vince lei;
//   · una richiesta rimborsata solo IN PARTE non si tocca: lì una decisione
//     serve ancora, ed è di una persona.

export type EsitoGiaResi = {
  letti: number
  chiusi: number
  /** Rimborsati in parte: si contano e si dicono, non si chiudono. */
  parziali: number
  senzaOrdine: number
  errori: number
  righe: string[]
}

const QUERY = `query Reso($id: ID!) {
  order(id: $id) {
    name
    totalRefundedSet { shopMoney { amount currencyCode } }
    netPaymentSet { shopMoney { amount } }
    refunds(first: 20) { id createdAt totalRefundedSet { shopMoney { amount } } }
  }
}`

type Risposta = {
  errors?: { message: string }[]
  data?: {
    order?: {
      name?: string
      totalRefundedSet?: { shopMoney?: { amount?: string; currencyCode?: string } | null } | null
      netPaymentSet?: { shopMoney?: { amount?: string } | null } | null
      refunds?: { id: string; createdAt?: string; totalRefundedSet?: { shopMoney?: { amount?: string } | null } | null }[]
    } | null
  }
}

const cent = (v: number) => Math.round(v * 100)

/** «3 set 2026, 17:15» — la data del rimborso vero, che è quella che conta. */
function quando(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Chiude le richieste di rimborso che su Shopify risultano già rese.
 *
 * @param opz.prova non scrive niente: dice solo che cosa chiuderebbe. Serve a
 *   guardare prima di chiudere d'ufficio delle pratiche di denaro.
 */
export async function chiudiRimborsiGiaResi(opz: { prova?: boolean } = {}): Promise<EsitoGiaResi> {
  const esito: EsitoGiaResi = { letti: 0, chiusi: 0, parziali: 0, senzaOrdine: 0, errori: 0, righe: [] }

  const aperti = await db.rimborso.findMany({
    where: { stato: { in: [...STATI_DA_LAVORARE] } },
    orderBy: { creatoIl: 'asc' },
    // ⚠️ Un tetto dichiarato: è un giro che parla con Shopify una volta per
    // richiesta, e una coda che esplode non deve far scadere il cron in
    // silenzio. Quello che avanza lo prende il giro dopo.
    take: 60,
  })
  esito.letti = aperti.length

  for (const r of aperti) {
    const ordine = r.ordineId
      ? await db.ordine.findUnique({
          where: { id: r.ordineId },
          select: { negozioId: true, shopifyId: true, numero: true },
        })
      : null
    if (!ordine || !ordine.shopifyId.startsWith('gid://')) {
      esito.senzaOrdine++
      continue
    }

    const accesso = await negozioConToken(ordine.negozioId)
    if (!accesso) {
      esito.errori++
      esito.righe.push(`${r.ordineNumero}: nessun token per il negozio`)
      continue
    }
    const letto = await graphqlNegozio<Risposta>(accesso.negozio, accesso.token, QUERY, {
      id: ordine.shopifyId,
    }).catch((e: unknown) => ({ errors: [{ message: (e as Error).message }] }) as Risposta)
    const o = letto.data?.order
    if (letto.errors?.[0] || !o) {
      esito.errori++
      esito.righe.push(`${r.ordineNumero}: ${letto.errors?.[0]?.message ?? 'Shopify non trova l’ordine'}`)
      continue
    }

    const reso = Number(o.totalRefundedSet?.shopMoney?.amount ?? '0') || 0
    if (cent(reso) <= 0) continue

    // ⚠️⚠️ Quanto di quel reso è GIÀ stato attribuito ad altre richieste dello
    // stesso ordine. Senza questo, due richieste da 50 € su un ordine con 50 €
    // resi si chiuderebbero tutte e due, e risulterebbero resi 100 €.
    const altre = await db.rimborso.aggregate({
      where: { stato: 'eseguito', id: { not: r.id }, ...(r.ordineId ? { ordineId: r.ordineId } : { ordineNumero: r.ordineNumero }) },
      _sum: { importo: true },
    })
    const gliAltri = altre._sum.importo ?? 0
    const libero = cent(reso) - cent(gliAltri)

    if (libero < cent(r.importo)) {
      // C'è un rimborso, ma non copre questa richiesta: decide una persona.
      esito.parziali++
      esito.righe.push(
        `${o.name ?? r.ordineNumero}: resi ${soldi(reso, r.valuta)} di ${soldi(r.importo, r.valuta)} chiesti — lasciato aperto`
      )
      continue
    }

    const ultimo = (o.refunds ?? []).slice(-1)[0]
    const data = quando(ultimo?.createdAt)
    const nota =
      `Risultava già rimborsato su Shopify${data ? ` (${data})` : ''}: ` +
      `${soldi(reso, r.valuta)} resi su ${o.name ?? r.ordineNumero}. ` +
      `Chiuso in automatico il ${new Date().toLocaleString('it-IT')}.`

    if (opz.prova) {
      esito.chiusi++
      esito.righe.push(`[prova] ${o.name ?? r.ordineNumero}: ${nota}`)
      continue
    }

    // ⚠️ La presa della riga: lo stato sta nella WHERE. Se nel frattempo
    // qualcuno l'ha approvata, rifiutata o rimborsata, questo giro conta zero e
    // non sovrascrive la sua decisione.
    const presa = await db.rimborso.updateMany({
      where: { id: r.id, stato: r.stato },
      data: {
        stato: 'eseguito',
        eseguitoIl: ultimo?.createdAt ? new Date(ultimo.createdAt) : new Date(),
        decisoIl: new Date(),
        decisoDa: 'Controllo automatico',
        esito: r.esito.trim() ? `${nota} · ${r.esito.trim()}` : nota,
      },
    })
    if (presa.count === 1) {
      esito.chiusi++
      esito.righe.push(`${o.name ?? r.ordineNumero}: ${nota}`)
    }
  }

  return esito
}
