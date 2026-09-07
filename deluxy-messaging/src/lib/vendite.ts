import { db } from './db'
import { leggiDallaPiattaforma } from './piattaforma'
import { siglaProvincia } from './province'

// ⭐ 06/09/2026 — NUOVA ARCHITETTURA VENDITE (decisione dell'utente).
//
// Orders gestisce SOLO l'ordine. Chi decide **a chi proporre** un ordine e **con
// che sconto** è il Customer Service: da qui è il custode di due cose, con due
// aree dedicate nella pagina Vendite:
//   · lo SCONTO PER PROVINCIA sul prezzo pubblico, per i prodotti NON unici:
//     40 % dove non abbiamo partner (fornitori dell'occasione, da cui prendiamo
//     una fee); dove ce l'abbiamo 20 % a Milano e 30 % altrove. Prezzo
//     arrotondato a 5 o a 0. Per provincia si può personalizzare.
//   · le LISTE DI PRIORITÀ per AREA COMMERCIALE (gruppi di province della
//     piattaforma), importate dalla piattaforma consegne e modificabili qui.
//
// «C'è un partner in questa provincia?» lo sa SOLO la piattaforma consegne
// (mestieri, servizio di vendita, area commerciale, area di consegna): glielo si
// chiede (`GET /api/v1/app/vendita/provincia/:sigla`) e la risposta si tiene
// dieci minuti. Non si copia: una copia invecchia senza dirlo.

export const SCONTI_PREDEFINITI = { senzaPartner: 40, milanoConPartner: 20, provinciaConPartner: 30 } as const
/** Le province dove deluxy.it consegna in «guanti bianchi» senza extra. */
export const PROVINCE_GUANTI_BIANCHI = ['MI', 'RM', 'FI'] as const

/** Arrotonda a 5 o a 0, al più vicino. */
export function arrotondaA5(n: number): number {
  return Math.round(n / 5) * 5
}

export type ScontoDeciso = {
  sconto: number
  quota: number
  regola: 'personalizzata' | 'territorio' | 'default'
  motivo: string
}

/** Lo sconto predefinito della regola del territorio. */
export function scontoTerritorio(provincia: string, conPartner: boolean): { sconto: number; motivo: string } {
  if (!conPartner) return { sconto: SCONTI_PREDEFINITI.senzaPartner, motivo: `provincia ${provincia} senza partner: sconto ${SCONTI_PREDEFINITI.senzaPartner}% sul prezzo pubblico` }
  if (provincia === 'MI') return { sconto: SCONTI_PREDEFINITI.milanoConPartner, motivo: `Milano con partner: sconto ${SCONTI_PREDEFINITI.milanoConPartner}% sul prezzo pubblico` }
  return { sconto: SCONTI_PREDEFINITI.provinciaConPartner, motivo: `provincia ${provincia} con partner: sconto ${SCONTI_PREDEFINITI.provinciaConPartner}% sul prezzo pubblico` }
}

/**
 * Lo sconto per una provincia: la riga personalizzata vince sulla regola del
 * territorio; senza sapere se c'è un partner (`null`) si resta sul default 60/40
 * e lo si dice.
 */
export async function scontoPerProvincia(provincia: string, conPartner: boolean | null): Promise<ScontoDeciso> {
  const sigla = siglaProvincia(provincia) || provincia.trim().toUpperCase()
  if (sigla) {
    const riga = await (db as unknown as { scontoProvincia?: { findUnique: (a: unknown) => Promise<{ conPartner: number | null; senzaPartner: number | null } | null> } }).scontoProvincia?.findUnique({ where: { provincia: sigla } })?.catch(() => null)
    if (riga && conPartner !== null) {
      const s = conPartner ? riga.conPartner : riga.senzaPartner
      if (s !== null && s !== undefined) {
        return { sconto: s, quota: 100 - s, regola: 'personalizzata', motivo: `sconto scritto per ${sigla} (${conPartner ? 'con' : 'senza'} partner)` }
      }
    }
    if (conPartner !== null) {
      const t = scontoTerritorio(sigla, conPartner)
      return { sconto: t.sconto, quota: 100 - t.sconto, regola: 'territorio', motivo: t.motivo }
    }
  }
  return { sconto: 40, quota: 60, regola: 'default', motivo: sigla ? `non si sa se in ${sigla} c'è un partner: quota indicativa` : 'senza provincia: quota indicativa' }
}

// ── LO STATO DI UNA PROVINCIA, DALLA PIATTAFORMA ──────────────────────────────

export type PartnerInProvincia = {
  id: string
  insegna: string
  citta: string | null
  mestieri: string[]
  consegnaDaPartner: boolean
  /** ⭐ 06/09 sera: partner «nostro» di ripiego, mai nelle proposte. */
  esclusoDalleProposte?: boolean
  consegnaInProvincia: boolean
  minimoOrdine: number | null
  raggioKm: number | null
  areeCommerciali: string[]
}
export type ListaInProvincia = { id: string; mestiere: string | null; categoria: string | null; partner: { posizione: number; id: string; insegna: string }[] }
export type StatoProvincia = {
  provincia: string
  nome: string
  conPartner: boolean
  partner: PartnerInProvincia[]
  listePriorita: ListaInProvincia[]
  areeCommerciali: { id: string; nome: string; province: number }[]
}

const cacheStato = new Map<string, { quando: number; dati: StatoProvincia }>()
const DIECI_MINUTI = 10 * 60_000

/** Chi c'è in una provincia (partner con vendita, liste, aree). `null` = la piattaforma non ha risposto. */
export async function statoProvincia(provincia: string, fresco = false): Promise<StatoProvincia | null> {
  const sigla = siglaProvincia(provincia) || provincia.trim().toUpperCase()
  if (!sigla) return null
  const inCache = cacheStato.get(sigla)
  if (!fresco && inCache && Date.now() - inCache.quando < DIECI_MINUTI) return inCache.dati
  const esito = await leggiDallaPiattaforma<StatoProvincia>(`/api/v1/app/vendita/provincia/${encodeURIComponent(sigla)}`)
  if (esito.stato !== 'ok') return null
  cacheStato.set(sigla, { quando: Date.now(), dati: esito.dati })
  return esito.dati
}

// ── LE LISTE DI PRIORITÀ PER AREA COMMERCIALE ─────────────────────────────────

export type PartnerInLista = { id: string; insegna: string }
export type ListaArea = {
  id: string
  area: string
  province: string[]
  mestiere: string
  partner: PartnerInLista[]
  origine: string
  importataIl: Date | null
  modificataIl: Date | null
  modificataDa: string | null
}

type AreaPiattaforma = { id: string; nome: string; province: string[]; partner: { id: string; insegna: string; vendita: boolean; consegnaDaPartner: boolean; mestieri: string[] }[] }
type ListaPiattaforma = { id: string; provincia: string; mestiere: string | null; categoria: string | null; areeCommerciali: string[]; partner: { posizione: number; id: string; insegna: string; attivo: boolean }[] }

function daRiga(r: { id: string; area: string; province: string; mestiere: string; partner: string; origine: string; importataIl: Date | null; modificataIl: Date | null; modificataDa: string | null }): ListaArea {
  const leggi = <T,>(s: string, ripiego: T): T => { try { return JSON.parse(s) as T } catch { return ripiego } }
  return { ...r, province: leggi<string[]>(r.province, []), partner: leggi<PartnerInLista[]>(r.partner, []) }
}

export async function listeArea(): Promise<ListaArea[]> {
  const righe = await (db.listaPrioritaArea ? db.listaPrioritaArea.findMany({ orderBy: [{ area: 'asc' }, { mestiere: 'asc' }] }) : Promise.resolve([]))
  return righe.map(daRiga)
}

/**
 * IMPORTA dalla piattaforma: per ogni area commerciale × mestiere, l'unione (in
 * ordine di prima comparsa) delle liste di priorità delle province dell'area;
 * dove non c'è nessuna lista ma nell'area c'è UN solo partner attivo col
 * mestiere e un servizio di vendita, la lista nasce con lui (regola utente:
 * «o che crea se c'è un solo partner attivo»). Le liste MODIFICATE A MANO qui
 * non si toccano: si aggiornano solo quelle mai modificate.
 */
export async function importaListeDallaPiattaforma(): Promise<{ aree: number; create: number; aggiornate: number; lasciate: number; errore?: string }> {
  const [aree, liste] = await Promise.all([
    leggiDallaPiattaforma<AreaPiattaforma[]>('/api/v1/app/aree-commerciali'),
    leggiDallaPiattaforma<ListaPiattaforma[]>('/api/v1/app/liste-priorita'),
  ])
  if (aree.stato !== 'ok') return { aree: 0, create: 0, aggiornate: 0, lasciate: 0, errore: aree.stato === 'non-configurato' ? 'Piattaforma non configurata (Impostazioni).' : aree.stato === 'errore' ? aree.messaggio : 'Aree non lette.' }
  if (liste.stato !== 'ok') return { aree: 0, create: 0, aggiornate: 0, lasciate: 0, errore: liste.stato === 'errore' ? liste.messaggio : 'Liste non lette.' }
  let create = 0, aggiornate = 0, lasciate = 0
  for (const a of aree.dati) {
    // Solo i mestieri che si smistano da qui: per ora i FIORI (regola utente «per ora solo di fiori»),
    // ma la lista si importa per ogni mestiere presente, così quando si allarga è già pronta.
    const mestieri = new Set<string>()
    for (const l of liste.dati) if (l.mestiere && a.province.includes(l.provincia)) mestieri.add(l.mestiere)
    for (const p of a.partner) if (p.vendita) for (const m of p.mestieri) mestieri.add(m)
    for (const mestiere of mestieri) {
      const ordinati: PartnerInLista[] = []
      const visti = new Set<string>()
      for (const prov of a.province) {
        for (const l of liste.dati.filter((x) => x.provincia === prov && x.mestiere === mestiere)) {
          for (const p of l.partner) if (p.attivo && !visti.has(p.id)) { visti.add(p.id); ordinati.push({ id: p.id, insegna: p.insegna }) }
        }
      }
      let origine = 'liste di priorità della piattaforma'
      if (!ordinati.length) {
        const soli = a.partner.filter((p) => p.vendita && p.mestieri.includes(mestiere))
        if (soli.length === 1) { ordinati.push({ id: soli[0].id, insegna: soli[0].insegna }); origine = 'unico partner attivo dell\'area' }
        else continue // più partner senza lista: la decide una persona, non si inventa un ordine
      }
      const gia = await db.listaPrioritaArea.findUnique({ where: { area_mestiere: { area: a.nome, mestiere } } })
      if (gia?.modificataIl) { lasciate++; continue }
      const dati = { province: JSON.stringify(a.province), partner: JSON.stringify(ordinati), origine, importataIl: new Date() }
      if (gia) { await db.listaPrioritaArea.update({ where: { id: gia.id }, data: dati }); aggiornate++ }
      else { await db.listaPrioritaArea.create({ data: { area: a.nome, mestiere, ...dati } }); create++ }
    }
  }
  return { aree: aree.dati.length, create, aggiornate, lasciate }
}

// ── LA PROPOSTA SU UN ORDINE ──────────────────────────────────────────────────

/** Un prodotto come lo espone la piattaforma consegne (canale app). */
type ProdottoPiattaforma = {
  id: string
  nome: string
  sku: string
  prezzo: number | null
  prezzoPubblico: number | null
  tipo: string
  tipologia: string | null
  varianti?: { id: string; nome: string; sku: string; prezzo: number | null; prezzoPubblico: number | null }[]
  partnerId: string
  partner: string
}

/** Il numero di pezzi scritto in un titolo: «12 rose», «Praline 16», «x 24». */
export function numeroPezzi(testo: string): number | null {
  const t = (testo ?? '').toLowerCase()
  const m =
    t.match(/(?:^|[^d])(d{1,3})s*(?:xs*)?(?:rose|rosa|steli|stelo|tulipani|girasoli|praline|cupcake|macaron|cioccolatini|pezzi|pz)/) ||
    t.match(/(?:x|per)s*(d{1,3})/)
  return m ? Number(m[1]) : null
}

/** La parola che identifica un fiore o un dolce dentro un titolo, per legarlo al listino. */
function parolaChiave(nome: string): string {
  const pulito = (nome ?? '').replace(/[()]/g, ' ').trim()
  const parole = pulito.split(/s+/).filter((p) => p.length > 3)
  return parole[1] ?? parole[0] ?? pulito
}

export type PropostaVendita = {
  provincia: string | null
  guantiBianchi: boolean
  speseConsegna: number | null
  extraPagato: boolean | null
  anomalia: string | null
  conPartner: boolean | null
  sconto: ScontoDeciso | null
  prezzoPubblico: number
  prezzoFornitore: number | null
  mestiere: string
  candidati: { id: string; insegna: string; posizione: number; consegnaDaPartner: boolean; consegnaInProvincia: boolean; minimoOrdine: number | null; raggioKm: number | null; fonte: string }[]
  /** ⭐ 06/09 sera: i prodotti dell'ordine che vanno A PREVENTIVO, con chi un prezzo l'ha già dato. */
  preventivi: { codice: string; prodotto: string; conPrezzo: { partnerId: string; partner: string; prezzo: number }[] }[]
  /** ⭐ 07/09: i prodotti A NUMERO dell'ordine, coi pezzi e il prezzo unitario dei partner. */
  aQuantita: { codice: string; prodotto: string; pezzi: number | null; offerte: { partnerId: string; partner: string; unitario: number; totale: number | null }[] }[]
  note: string[]
  piattaforma: 'ok' | 'non-risponde'
}

/**
 * Che cosa farebbe il Customer Service con quest'ordine, secondo le regole del
 * 06/09/2026:
 *  · deluxy.it = consegna in guanti bianchi (valet). Fuori MI/RM/FI serve un
 *    EXTRA pagato: con l'extra si propone a TUTTI i partner della lista
 *    dell'area commerciale; senza, è un'ANOMALIA da segnalare.
 *  · gli altri marchi: si propone solo a chi in quella provincia CONSEGNA DA
 *    SOLO («Consegna da Partner» e provincia nella sua area di consegna),
 *    nell'ordine della lista dell'area.
 *  · lo sconto è quello della provincia (con/senza partner), e il prezzo al
 *    fornitore è il prezzo pubblico dei prodotti meno lo sconto, a 5 o a 0.
 * ⚠️ L'extra si legge come «totale dell'ordine − somma delle righe prodotto»: le
 * righe di spedizione Shopify non arrivano da Orders. Senza righe non si giudica.
 */
export async function propostaVendita(input: {
  negozioNome: string
  totale: number
  righe: { prezzo: number; quantita: number }[] | null
  provincia: string
  mestiere?: string
  /** Gli SKU delle righe dell'ordine: servono a riconoscere i prodotti A PREVENTIVO. */
  sku?: string[]
  /** Le righe intere dell'ordine (titolo, variante, sku, quantità): servono al controllo a monte. */
  righe2?: { titolo?: string; variante?: string; sku?: string; quantita?: number }[]
}): Promise<PropostaVendita> {
  const note: string[] = []
  const sigla = siglaProvincia(input.provincia) || input.provincia.trim().toUpperCase() || null
  const guantiBianchi = /deluxy\.it/i.test(input.negozioNome) && !/business|flowers|cake/i.test(input.negozioNome)
  const prezzoPubblico = input.righe ? Math.round(input.righe.reduce((n, r) => n + (r.prezzo ?? 0) * (r.quantita ?? 1), 0) * 100) / 100 : input.totale
  const speseConsegna = input.righe ? Math.max(0, Math.round((input.totale - prezzoPubblico) * 100) / 100) : null
  const extraPagato = speseConsegna === null ? null : speseConsegna > 0
  const mestiere = input.mestiere ?? 'Fiorista'
  const stato = sigla ? await statoProvincia(sigla) : null
  const conPartner = stato ? stato.conPartner : null
  const sconto = sigla ? await scontoPerProvincia(sigla, conPartner) : null
  const prezzoFornitore = sconto ? arrotondaA5(prezzoPubblico * (sconto.quota / 100)) : null
  let anomalia: string | null = null
  const candidati: PropostaVendita['candidati'] = []

  if (!sigla) note.push('Provincia di consegna non riconosciuta: nessuna proposta.')
  if (!stato) note.push('La piattaforma consegne non ha risposto: partner e liste non letti.')
  if (stato && sigla) {
    const fuoriBase = !PROVINCE_GUANTI_BIANCHI.includes(sigla as (typeof PROVINCE_GUANTI_BIANCHI)[number])
    // La lista dell'AREA commerciale (qui), altrimenti quella della provincia (piattaforma).
    const areeQui = await (db.listaPrioritaArea ? db.listaPrioritaArea.findMany({ where: { mestiere } }) : Promise.resolve([]))
    const listaArea = areeQui.map(daRiga).find((l) => l.province.includes(sigla))
    const ordine: { id: string; insegna: string }[] = listaArea?.partner ?? stato.listePriorita.find((l) => l.mestiere === mestiere)?.partner.map((p) => ({ id: p.id, insegna: p.insegna })) ?? []
    const fonte = listaArea ? `lista dell'area «${listaArea.area}»` : 'lista di priorità della provincia (piattaforma)'
    const perId = new Map(stato.partner.map((p) => [p.id, p]))
    // (06/09 sera, regola utente) gli ESCLUSI DALLE PROPOSTE — Artista Locale, Deluxy Flowers, Cakedesignme — non si propongono mai.
    const conMestiere = stato.partner.filter((p) => p.mestieri.includes(mestiere) && !p.esclusoDalleProposte)
    const sequenza = [...ordine.filter((o) => perId.has(o.id) && !perId.get(o.id)!.esclusoDalleProposte).map((o) => perId.get(o.id)!), ...conMestiere.filter((p) => !ordine.some((o) => o.id === p.id))]
    if (guantiBianchi) {
      if (fuoriBase && extraPagato === false) anomalia = `Consegna deluxy.it fuori da ${PROVINCE_GUANTI_BIANCHI.join('/')} (${sigla}) SENZA extra pagato: da verificare col cliente prima di proporre.`
      if (fuoriBase && extraPagato === null) note.push('Righe dell\'ordine non lette: non si sa se l\'extra fuori provincia è stato pagato.')
      // Con l'extra (o in città): tutti i partner della lista dell'area, consegna col valet.
      sequenza.forEach((p, i) => candidati.push({ id: p.id, insegna: p.insegna, posizione: i + 1, consegnaDaPartner: p.consegnaDaPartner, consegnaInProvincia: p.consegnaInProvincia, minimoOrdine: p.minimoOrdine, raggioKm: p.raggioKm, fonte }))
      if (fuoriBase && extraPagato) note.push(`Extra fuori provincia pagato (${speseConsegna} €): si propone a tutti i partner dell'area, consegna Deluxy.`)
    } else {
      // Non guanti bianchi: solo chi consegna DA SOLO in questa provincia.
      const daSoli = sequenza.filter((p) => p.consegnaDaPartner && p.consegnaInProvincia)
      daSoli.forEach((p, i) => candidati.push({ id: p.id, insegna: p.insegna, posizione: i + 1, consegnaDaPartner: true, consegnaInProvincia: true, minimoOrdine: p.minimoOrdine, raggioKm: p.raggioKm, fonte }))
      if (!daSoli.length) note.push(`Nessun partner che consegna da solo in ${sigla}: si cerca un fornitore dell'occasione (sconto senza partner).`)
      const sottoMinimo = daSoli.filter((p) => p.minimoOrdine != null && prezzoFornitore != null && prezzoFornitore < p.minimoOrdine)
      if (sottoMinimo.length) note.push(`Sotto il minimo d'ordine di: ${sottoMinimo.map((p) => `${p.insegna} (${p.minimoOrdine} €)`).join(', ')}.`)
    }
  }
  // ⭐ 06/09 sera + 07/09 (regole utente) — IL CONTROLLO A MONTE SUL PRODOTTO.
  //
  // Prima di proporre, il Customer Service guarda CHE TIPO di prodotto è, perché il prezzo si
  // fa in tre modi diversi e la percentuale non basta:
  //  · «a preventivo» → serve il prezzo dato dal partner, altrimenti non si accetta;
  //  · «a quantità» (l'utente: «rose rosse 9 è un prodotto a numero») → il prezzo è il
  //    prezzo UNITARIO del partner per il numero di pezzi, non il pubblico meno lo sconto;
  //  · «mix» → vale la regola del territorio, ed è il caso già coperto sopra.
  //
  // ⚠️ Lo SKU di una riga d'ordine è quello della VARIANTE (DLEIXX-1, non DLEIXX): si cerca
  // per entrambi, e il numero di pezzi si legge dal nome della variante («9») o dal titolo.
  const preventivi: PropostaVendita['preventivi'] = []
  const aQuantita: PropostaVendita['aQuantita'] = []
  const codici = [...new Set((input.righe2 ?? []).map((r) => (r.sku ?? '').trim()).filter(Boolean))]
  for (const codice of codici) {
    const esito = await leggiDallaPiattaforma<{ prodotti?: ProdottoPiattaforma[] }>(
      `/api/v1/app/prodotti?q=${encodeURIComponent(codice)}`,
    )
    if (esito.stato !== 'ok') continue
    const su = (x: string | null | undefined) => (x ?? '').trim().toUpperCase()
    const p = (esito.dati.prodotti ?? []).find(
      (x) => su(x.sku) === su(codice) || (x.varianti ?? []).some((v) => su(v.sku) === su(codice)),
    )
    if (!p) continue
    const variante = (p.varianti ?? []).find((v) => su(v.sku) === su(codice)) ?? null
    const riga = (input.righe2 ?? []).find((r) => su(r.sku) === su(codice))
    const nome = `${p.nome}${variante ? ` · ${variante.nome}` : ''}`

    if (p.tipologia === 'preventivo') {
      const scritti = await db.prezzoProdottoPartner.findMany({ where: { codice: { in: [su(codice), su(p.sku)] } } })
      const conPrezzo = scritti
        .filter((r) => r.prezzo > 0 && (!r.provincia || r.provincia === sigla))
        .map((r) => ({ partnerId: r.partnerId, partner: r.partner, prezzo: r.prezzo }))
      preventivi.push({ codice: su(codice), prodotto: nome, conPrezzo })
      note.push(
        conPrezzo.length
          ? `«${nome}» va a preventivo: ${conPrezzo.map((c) => `${c.partner} ${c.prezzo} €`).join(', ')}.`
          : `«${nome}» va a preventivo e nessun partner ha ancora dato un prezzo: chiedilo e scrivilo in Vendite → Liste di prodotto, poi la vendita si può accettare.`,
      )
      continue
    }

    if (p.tipologia === 'quantita') {
      // I pezzi: il nome della variante è già il numero («9», «12»); altrimenti si legge dal
      // titolo. Per la quantità della riga si moltiplica: 2 confezioni da 9 sono 18 steli.
      const daVariante = variante && /^\d{1,3}$/.test(variante.nome.trim()) ? Number(variante.nome.trim()) : null
      const daTitolo = numeroPezzi(`${riga?.titolo ?? ''} ${p.nome}`)
      const unitari = daVariante ?? daTitolo
      const pezzi = unitari ? unitari * (riga?.quantita ?? 1) : null
      // I prezzi unitari dei partner: quelli scritti nelle liste di prodotto (listino del
      // fioraio importato dalla piattaforma, o preventivo raccolto qui).
      const scritti = await db.prezzoProdottoPartner.findMany({
        where: { OR: [{ codice: { in: [su(codice), su(p.sku)] } }, { prodotto: { contains: parolaChiave(p.nome), mode: 'insensitive' } }] },
      })
      const offerte = scritti
        .filter((r) => r.prezzo > 0 && (!r.provincia || r.provincia === sigla))
        .map((r) => ({ partnerId: r.partnerId, partner: r.partner, unitario: r.prezzo, totale: pezzi ? Math.round(r.prezzo * pezzi * 100) / 100 : null }))
        .sort((a, b) => a.unitario - b.unitario)
      aQuantita.push({ codice: su(codice), prodotto: nome, pezzi, offerte })
      note.push(
        pezzi === null
          ? `«${nome}» è un prodotto a numero, ma il numero di pezzi non si legge dalla riga: mettilo a mano prima di fare il prezzo.`
          : offerte.length
            ? `«${nome}» è un prodotto a numero: ${pezzi} pezzi. Col prezzo unitario dei partner sarebbero ${offerte.map((o) => `${o.partner} ${o.totale} € (${o.unitario} € l'uno)`).join(', ')} — questo prezzo vale più della percentuale.`
            : `«${nome}» è un prodotto a numero (${pezzi} pezzi) ma nessun partner ha un prezzo unitario: chiedilo e scrivilo in Vendite → Liste di prodotto.`,
      )
    }
  }

  return { provincia: sigla, guantiBianchi, speseConsegna, extraPagato, anomalia, conPartner, sconto, prezzoPubblico, prezzoFornitore, mestiere, candidati, preventivi, aQuantita, note, piattaforma: stato ? 'ok' : 'non-risponde' }
}
