// LE VENDITE GESTITE CON UN PAGAMENTO IN APP HANNO LA LORO CONSEGNA IN PIATTAFORMA.
//
// Regola dell'utente (06/09/2026): «le vendite che abbiamo già gestito con
// pagamento in app: crea la consegna anche in app delivery e porta sempre nella
// stessa app la vendita in storico». E: partner SEMPRE «Artista Locale» (il
// fornitore vero, pagato dall'app, va nelle note).
//
// Chi entra: ordini «Gestito», non annullati, con una richiesta di pagamento al
// fornitore PAGATA, senza una consegna agganciata qui. Per ognuno si chiede
// alla piattaforma se una consegna con quel DDT esiste già (`?ddt=`): se sì si
// aggancia e basta — non si crea un doppione; se no si crea dal canale app con
// `giaConsegnata`, così di là nasce direttamente in storico («consegnata»), e
// qui l'ordine resta «Gestito».
//
// ⚠️ Nessuna scrittura diretta sul database della piattaforma: lo stato della
// consegna è suo, e glielo si chiede (Standard §7). La prima volta, il 06/09,
// le sei mancanti erano state chiuse con un UPDATE sul suo schema: da qui in
// poi passa tutto dal canale.
//
// Gira nella sincronizzazione con la piattaforma (ogni 15 minuti) e nello
// script `scripts/consegne-da-pagamenti-in-app.mts`.

import { db } from './db'
import { CHIUSURA } from './gestione'
import { chiPrepara } from './chi-prepara'
import { mandaInApp, marchioDdt, prefillInApp } from './manda-in-app'
import { listaEscluse } from './dettaglio-ordine'
import { righeOrdineDaOrders } from './orders'
import { consegnePerDdt, partnerPiattaforma, prodottiPiattaforma, serviziPiattaforma } from './piattaforma'

export type EsitoConsegnaDaPagamento = {
  numero: string
  esito: 'creata' | 'agganciata' | 'saltata' | 'errore'
  testo: string
}

export type EsitoConsegneDaPagamenti = {
  righe: EsitoConsegnaDaPagamento[]
  create: number
  agganciate: number
  /** Perché non si è potuto fare niente (piattaforma non collegata, Artista Locale assente…). */
  errore: string
}

const ARTISTA_LOCALE = 'artista locale'

/**
 * @param opz.prova   non scrive niente, dice cosa farebbe
 * @param opz.soloNumeri limita a certi ordini («#2868»)
 * @param opz.giorni  quanto indietro guardare sulla data di consegna (di suo 60)
 */
export async function consegnePerPagamentiInApp(opz: {
  prova?: boolean
  soloNumeri?: string[]
  giorni?: number
} = {}): Promise<EsitoConsegneDaPagamenti> {
  const vuoto: EsitoConsegneDaPagamenti = { righe: [], create: 0, agganciate: 0, errore: '' }
  const dal = new Date(Date.now() - (opz.giorni ?? 60) * 86_400_000)

  // ── Chi ha un pagamento in app ──
  const richieste = await db.richiestaPagamento.findMany({
    where: {
      pagataIl: { not: null },
      importo: { gt: 0 },
      OR: [{ NOT: { ordineNumero: '' } }, { NOT: { ordineId: '' } }],
    },
    select: { ordineNumero: true, ordineId: true, intestatario: true, fornitore: true, importo: true, pagataIl: true },
  })
  if (!richieste.length) return vuoto
  const numeri = [...new Set(richieste.map((r) => '#' + r.ordineNumero.replace(/^#/, '')).filter((n) => n !== '#'))]
  let ordini = await db.ordine.findMany({
    where: {
      OR: [{ numero: { in: numeri } }, { id: { in: richieste.map((r) => r.ordineId).filter(Boolean) } }],
      annullatoIl: null,
      appConsegnaId: '',
      gestione: CHIUSURA,
      dataConsegna: { gte: dal },
    },
    select: { id: true, numero: true, shopifyId: true, negozioNome: true, clienteNome: true, citta: true, dataConsegna: true, fornitoreNome: true, appConsegneEscluse: true },
    orderBy: { dataConsegna: 'asc' },
  })
  if (opz.soloNumeri?.length) ordini = ordini.filter((o) => opz.soloNumeri!.includes(o.numero))
  if (!ordini.length) return vuoto

  // ── «Artista Locale» e «Vendita Deluxy», una volta sola ──
  const partner = await partnerPiattaforma()
  if (partner.stato !== 'ok') return { ...vuoto, errore: partner.stato === 'errore' ? partner.messaggio : 'piattaforma non collegata' }
  const artista = partner.dati.find((p) => p.insegna.trim().toLowerCase() === ARTISTA_LOCALE)
  if (!artista) return { ...vuoto, errore: '«Artista Locale» non è fra i partner della piattaforma' }
  const servizi = await serviziPiattaforma()
  if (servizi.stato !== 'ok') return { ...vuoto, errore: servizi.stato === 'errore' ? servizi.messaggio : 'piattaforma non collegata' }
  const vendita = servizi.dati.find((s) => /vendita\s*deluxy/i.test(s.nome || s.name || ''))
  if (!vendita) return { ...vuoto, errore: '«Vendita Deluxy» non è fra i servizi della piattaforma' }
  if (artista.servizi && !artista.servizi.includes(vendita.id)) {
    return { ...vuoto, errore: '«Vendita Deluxy» non è nel listino di Artista Locale: la piattaforma rifiuterebbe' }
  }

  const esito: EsitoConsegneDaPagamenti = { righe: [], create: 0, agganciate: 0, errore: '' }
  for (const o of ordini) {
    const ddt = o.numero.replace(/^#/, '')
    const mie = richieste.filter((r) => r.ordineId === o.id || '#' + r.ordineNumero.replace(/^#/, '') === o.numero)
    const pagata = mie.find((r) => r.pagataIl) ?? mie[0]
    if (!pagata) continue

    // ── C'è già di là? Allora si aggancia e basta ──
    // ⚠️ Col marchio: il DDT è numerato per negozio, e senza marchio la regola
    // agganciava al #1834 di Cake la consegna del #1834 di Flowers.
    const gia = await consegnePerDdt(ddt, marchioDdt(o.negozioNome ?? ''), listaEscluse(o.appConsegneEscluse))
    if (gia.stato !== 'ok') {
      esito.righe.push({ numero: o.numero, esito: 'errore', testo: `non ho potuto chiedere alla piattaforma: ${gia.stato === 'errore' ? gia.messaggio : 'non collegata'}` })
      continue
    }
    const esistente = gia.dati.consegne[0]
    if (esistente) {
      if (!opz.prova) {
        await db.ordine.update({
          where: { id: o.id },
          data: { appConsegnaId: esistente.id, appConsegnaStato: esistente.stato },
        })
      }
      esito.agganciate++
      esito.righe.push({ numero: o.numero, esito: 'agganciata', testo: `consegna #${esistente.numero ?? ''} già in piattaforma (${esistente.stato}): agganciata` })
      continue
    }

    // ── Si crea, già consegnata ──
    const pre = await prefillInApp(o.id)
    if (!pre) { esito.righe.push({ numero: o.numero, esito: 'saltata', testo: 'prefill vuoto' }); continue }
    const righe = await righeOrdineDaOrders(o.numero, o.shopifyId)
    const riga = righe.stato === 'ok' ? righe.righe[0] : undefined
    const sku = (riga?.sku ?? '').trim().toUpperCase()
    const cat = await prodottiPiattaforma(sku || riga?.titolo || '', '')
    let prodotto: { id: string; sku: string; nome: string } | null = null
    let come = ''
    if (cat.stato === 'ok') {
      const lista = cat.dati.prodotti
      const perSku = (x: { sku: string }) => (x.sku ?? '').toUpperCase()
      const padre = sku ? lista.find((x) => perSku(x) === sku) : undefined
      const famiglia = sku ? lista.filter((x) => perSku(x).startsWith(sku)) : []
      if (padre) { prodotto = padre; come = 'padre' }
      else if (famiglia.length) { prodotto = famiglia[0]; come = 'prima della famiglia' }
      else if (cat.dati.generico) { prodotto = cat.dati.generico; come = 'generico' }
    }
    if (!prodotto) { esito.righe.push({ numero: o.numero, esito: 'saltata', testo: `nessun prodotto utilizzabile (sku «${sku}»)` }); continue }
    const quando = pagata.pagataIl ? pagata.pagataIl.toLocaleDateString('it-IT') : ''
    const notaFornitore = `Fornitore pagato dall'app: ${chiPrepara(pagata) || o.fornitoreNome} — ${pagata.importo.toFixed(2)} € (pagamento del ${quando}). Consegna già avvenuta, registrata a posteriori dal Customer Service.`
    const fine = (pre.campi.deliveryTimeTo || '18:00').padStart(5, '0')
    const giorno = (o.dataConsegna ?? new Date()).toISOString().slice(0, 10)
    const campi = {
      ...pre.campi,
      partnerId: artista.id,
      serviceTypeId: vendita.id,
      notes: [pre.campi.notes, riga?.titolo ? `Prodotto: ${riga.titolo}` : '', notaFornitore].filter(Boolean).join('\n'),
      products: [{ productId: prodotto.id, quantity: Math.max(1, riga?.quantita ?? 1), price: pagata.importo, flexiblePrice: true }],
      giaConsegnata: true,
      consegnataIl: new Date(`${giorno}T${fine}:00+02:00`).toISOString(),
    }
    if (opz.prova) {
      esito.righe.push({ numero: o.numero, esito: 'creata', testo: `(prova) creerei: ${prodotto.nome} [${prodotto.sku}] (${come}) · ${pagata.importo} € · consegnata il ${giorno} ${fine}` })
      esito.create++
      continue
    }
    const fatto = await mandaInApp(o.id, campi, { id: '', nome: 'Piattaforma consegne (pagamento in app)' })
    if (!fatto.ok) { esito.righe.push({ numero: o.numero, esito: 'errore', testo: fatto.errore }); continue }
    // ⚠️ `mandaInApp` mette l'ordine «In App»: qui era e resta «Gestito» — la
    // consegna è già avvenuta, e riaprirlo lo rimetterebbe in lista per niente.
    await db.ordine.update({
      where: { id: o.id },
      data: {
        gestione: CHIUSURA,
        gestioneDaNome: 'Piattaforma consegne',
        gestioneIl: new Date(),
        appConsegnaStato: 'delivered',
        appConsegnaData: o.dataConsegna,
        appConsegnaFascia: `${pre.campi.deliveryTimeFrom}-${pre.campi.deliveryTimeTo}`,
      },
    })
    esito.create++
    esito.righe.push({ numero: o.numero, esito: 'creata', testo: `consegna #${fatto.numero} creata in storico · ${prodotto.nome} (${come}) · ${pagata.importo} €` })
  }
  return esito
}
