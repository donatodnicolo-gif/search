import { db } from './db'
import { statoProvincia } from './vendite'
import { leggiDallaPiattaforma } from './piattaforma'
import { siglaProvincia } from './province'

// ⭐ 06/09/2026 sera — LISTE DI PRODOTTO (regola utente).
//
// La tipologia di vendita di un prodotto la decide MERCHANDISING (unico | quantita | mix |
// preventivo) e la piattaforma consegne la rimanda insieme ai prezzi. Qui si costruiscono le
// liste che servono al Customer Service quando la percentuale di sconto non basta:
//
//  · «a quantità» — il prezzo è quello UNITARIO del partner (12 rose = 12 × il suo prezzo a
//    stelo): serve sapere chi, in quella provincia, ha un prezzo per quel prodotto;
//  · «a preventivo» — nessuno ha un prezzo: si CHIEDE ai partner che fanno quel mestiere e la
//    risposta si scrive qui, dove resta per le prossime vendite.
//
// «mix» non entra: lì il prezzo lo fa la regola del territorio, e una lista di prodotto
// sarebbe una seconda verità sullo stesso numero.

export type RigaPrezzo = {
  id: string
  codice: string
  prodotto: string
  variante: string
  tipologia: string
  mestiere: string
  provincia: string
  partnerId: string
  partner: string
  prezzo: number
  unita: string
  pubblico: number | null
  fonte: string
  nota: string
  chiestoIl: Date | null
  rispostoIl: Date | null
  aggiornatoIl: Date
}

type PrezzoDallaPiattaforma = {
  origine: string
  prodotto: string
  sku: string | null
  variante: string
  categoria: string | null
  mestiere: string | null
  tipologia: string | null
  provincia: string | null
  partnerId: string
  partner: string
  prezzoPartner: number
  pubblico: number | null
}

/** Solo queste due tipologie hanno una lista di prodotto: le altre no, ed è una scelta. */
export const TIPOLOGIE_CON_LISTA = ['quantita', 'preventivo'] as const

/**
 * IMPORTA i prezzi già praticati dalla piattaforma consegne (patti di riconciliazione
 * accettati e listini dei prodotti unici) per i prodotti «a quantità» e «a preventivo».
 *
 * ⚠️ Non tocca i PREVENTIVI scritti qui: quelli li ha raccolti una persona parlando col
 * partner, e un import non deve cancellare una parola data. Si aggiornano solo le righe
 * con fonte «piattaforma».
 */
export async function importaPrezziDallaPiattaforma(provincia?: string): Promise<{ letti: number; create: number; aggiornate: number; lasciate: number; errore?: string }> {
  const sigla = provincia ? (siglaProvincia(provincia) || provincia.trim().toUpperCase()) : ''
  const esito = await leggiDallaPiattaforma<{ provincia: string | null; righe: PrezzoDallaPiattaforma[] }>(
    `/api/v1/app/prezzi-partner${sigla ? `?provincia=${encodeURIComponent(sigla)}` : ''}`,
  )
  if (esito.stato !== 'ok') {
    return { letti: 0, create: 0, aggiornate: 0, lasciate: 0, errore: esito.stato === 'non-configurato' ? 'Piattaforma non configurata (Impostazioni).' : esito.stato === 'errore' ? esito.messaggio : 'Prezzi non letti.' }
  }
  const righe = esito.dati.righe.filter((r) => r.sku && r.tipologia && (TIPOLOGIE_CON_LISTA as readonly string[]).includes(r.tipologia))
  let create = 0, aggiornate = 0, lasciate = 0
  for (const r of righe) {
    const chiave = { codice: r.sku!.trim().toUpperCase(), variante: r.variante ?? '', partnerId: r.partnerId, provincia: r.provincia ?? '' }
    const gia = await db.prezzoProdottoPartner.findUnique({ where: { codice_variante_partnerId_provincia: chiave } })
    if (gia && gia.fonte === 'preventivo') { lasciate++; continue }
    const dati = {
      prodotto: r.prodotto,
      tipologia: r.tipologia!,
      mestiere: r.mestiere ?? '',
      partner: r.partner,
      prezzo: r.prezzoPartner,
      pubblico: r.pubblico,
      fonte: 'piattaforma',
    }
    if (gia) { await db.prezzoProdottoPartner.update({ where: { id: gia.id }, data: dati }); aggiornate++ }
    else { await db.prezzoProdottoPartner.create({ data: { ...chiave, ...dati } }); create++ }
  }
  return { letti: esito.dati.righe.length, create, aggiornate, lasciate }
}

/** Tutte le righe, filtrabili: è l'elenco che si guarda in Vendite → Liste di prodotto. */
export async function righePrezzo(filtro: { tipologia?: string; provincia?: string; cerca?: string } = {}): Promise<RigaPrezzo[]> {
  const where: Record<string, unknown> = {}
  if (filtro.tipologia) where.tipologia = filtro.tipologia
  if (filtro.provincia) where.provincia = filtro.provincia.trim().toUpperCase()
  if (filtro.cerca?.trim()) {
    const q = filtro.cerca.trim()
    where.OR = [
      { prodotto: { contains: q, mode: 'insensitive' } },
      { codice: { contains: q, mode: 'insensitive' } },
      { partner: { contains: q, mode: 'insensitive' } },
    ]
  }
  const righe = await db.prezzoProdottoPartner.findMany({ where, orderBy: [{ prodotto: 'asc' }, { prezzo: 'asc' }], take: 500 })
  return righe as unknown as RigaPrezzo[]
}

/**
 * LA LISTA DI UN PRODOTTO in una provincia: i partner in ordine di priorità (quella della
 * piattaforma per quella provincia), ciascuno col suo prezzo se ce l'ha.
 *
 * Chi non ha un prezzo esce lo stesso, marcato: per un prodotto a preventivo è proprio quello
 * l'elenco delle persone a cui telefonare. Nascondere chi non ha risposto vorrebbe dire
 * dimenticarsi di chiederglielo.
 */
export async function listaProdotto(codice: string, provincia: string, mestiere?: string): Promise<{
  codice: string
  provincia: string
  righe: { partnerId: string; partner: string; posizione: number; prezzo: number | null; unita: string; fonte: string | null; chiestoIl: Date | null; rispostoIl: Date | null; nota: string }[]
  piattaforma: 'ok' | 'non-risponde'
}> {
  const sigla = (siglaProvincia(provincia) || provincia.trim().toUpperCase()).trim()
  const chiave = codice.trim().toUpperCase()
  const prezzi = await db.prezzoProdottoPartner.findMany({ where: { codice: chiave } })
  const perPartner = new Map(prezzi.filter((p) => !p.provincia || p.provincia === sigla).map((p) => [p.partnerId, p]))
  const stato = await statoProvincia(sigla)
  const righe: { partnerId: string; partner: string; posizione: number; prezzo: number | null; unita: string; fonte: string | null; chiestoIl: Date | null; rispostoIl: Date | null; nota: string }[] = []
  if (stato) {
    const mest = mestiere ?? prezzi[0]?.mestiere ?? ''
    const lista = stato.listePriorita.find((l) => (mest ? l.mestiere === mest : true))
    const ordine = lista?.partner.map((p) => p.id) ?? []
    const candidati = stato.partner.filter((p) => !p.esclusoDalleProposte && (!mest || p.mestieri.includes(mest)))
    const ordinati = [
      ...ordine.map((id) => candidati.find((p) => p.id === id)).filter(Boolean),
      ...candidati.filter((p) => !ordine.includes(p.id)),
    ] as typeof candidati
    ordinati.forEach((p, i) => {
      const prezzo = perPartner.get(p.id)
      righe.push({
        partnerId: p.id, partner: p.insegna, posizione: i + 1,
        prezzo: prezzo?.prezzo ?? null, unita: prezzo?.unita ?? '', fonte: prezzo?.fonte ?? null,
        chiestoIl: prezzo?.chiestoIl ?? null, rispostoIl: prezzo?.rispostoIl ?? null, nota: prezzo?.nota ?? '',
      })
    })
  }
  return { codice: chiave, provincia: sigla, righe, piattaforma: stato ? 'ok' : 'non-risponde' }
}

/** Scrive (o corregge) il preventivo dato da un partner. Resta, e vale per le prossime vendite. */
export async function salvaPreventivo(input: {
  codice: string; prodotto: string; variante?: string; tipologia?: string; mestiere?: string
  provincia?: string; partnerId: string; partner: string; prezzo: number; unita?: string
  pubblico?: number | null; nota?: string; chi?: string
}): Promise<RigaPrezzo> {
  const chiave = {
    codice: input.codice.trim().toUpperCase(),
    variante: input.variante ?? '',
    partnerId: input.partnerId,
    provincia: (input.provincia ?? '').trim().toUpperCase(),
  }
  const dati = {
    prodotto: input.prodotto,
    tipologia: input.tipologia ?? 'preventivo',
    mestiere: input.mestiere ?? '',
    partner: input.partner,
    prezzo: input.prezzo,
    unita: input.unita ?? '',
    pubblico: input.pubblico ?? null,
    fonte: 'preventivo',
    nota: input.nota ?? '',
    rispostoIl: new Date(),
    scrittoDa: input.chi ?? null,
  }
  const riga = await db.prezzoProdottoPartner.upsert({
    where: { codice_variante_partnerId_provincia: chiave },
    create: { ...chiave, ...dati, chiestoIl: new Date() },
    update: dati,
  })
  return riga as unknown as RigaPrezzo
}

/**
 * IL CANCELLO: un prodotto «a preventivo» non si può proporre finché il preventivo non c'è.
 * Torna il motivo se manca, null se si può andare avanti.
 */
export async function preventivoMancante(codice: string, partnerId: string, provincia: string): Promise<string | null> {
  const chiave = codice.trim().toUpperCase()
  const sigla = (siglaProvincia(provincia) || provincia.trim().toUpperCase()).trim()
  const righe = await db.prezzoProdottoPartner.findMany({ where: { codice: chiave, partnerId } })
  const buona = righe.find((r) => (!r.provincia || r.provincia === sigla) && r.prezzo > 0)
  if (buona) return null
  return `Manca il preventivo del partner per ${chiave}${sigla ? ` in ${sigla}` : ''}: chiediglielo e scrivilo in Vendite → Liste di prodotto, poi la vendita si può accettare.`
}
