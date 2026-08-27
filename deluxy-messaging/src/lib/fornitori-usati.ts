import { db } from './db'
import { chiaveNome } from './cerca-fornitore'

// CHI HA PREPARATO CHE COSA — l'elenco dei fornitori usati, ordine per ordine.
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «una sezione fornitori dove fai vedere
// quali fornitori sono stati utilizzati per quali ordini». Il dato c'era già
// tutto — `Ordine.fornitoreNome` e `fornitoreCosto` li scrive il riquadro «chi
// prepara quest'ordine» — ma si poteva solo guardare un ordine alla volta.
// `lavoro-fornitore.ts` ne fa la SOMMA (serve alla ricerca, per dire «gli
// abbiamo già dato N ordini»); qui serve il contrario: il DETTAGLIO.
//
// ⚠️⚠️ E LA COPERTURA SI DICE, sempre. Misurato il 27/08/2026: su **1.380
// ordini, 22** hanno un fornitore scritto. Un elenco che mostra ventidue righe
// senza dire «su 1.380» si legge come «abbiamo usato ventidue fornitori», che è
// falso: quelli sono i fornitori che qualcuno ha REGISTRATO. Gli altri ordini un
// fornitore l'hanno avuto, solo che non è scritto da nessuna parte — e questa
// pagina serve anche a far vedere quanto grande è quel buco.
//
// ⚠️ Qui non si ricopia niente da altre app: `fornitoreNome`, `fornitoreCosto` e
// `totale` sono colonne di QUESTA app (Standard Deluxy §7). L'anagrafica del
// fornitore resta di deluxy-anagrafiche, e infatti da qui non si legge.

export type OrdineDelFornitore = {
  id: string
  numero: string
  /** Come il fornitore è scritto SU QUESTO ordine (può variare fra ordini). */
  scrittoCome: string
  negozio: string
  cliente: string
  citta: string
  /** Quanto ha pagato il cliente. `0` = non lo sappiamo. */
  valore: number
  valuta: string
  /** Quanto va al fornitore. `null` = non è stato scritto: NON è zero. */
  costo: number | null
  /** Quando è stato registrato chi prepara. */
  registratoIl: string | null
  registratoDa: string
  consegna: string | null
  gestione: string
  annullato: boolean
  /**
   * Da dove sappiamo che è stato lui: `ordine` = c'è scritto sull'ordine;
   * `pagamento` = sull'ordine non c'è, ma esiste una richiesta di pagamento
   * intestata a lui e collegata a quell'ordine.
   *
   * ⚠️ Le due cose NON sono la stessa e non vanno mescolate in silenzio: la
   * prima è una decisione registrata, la seconda è un indizio contabile. Sulla
   * seconda il costo è l'importo del pagamento, che può essere un acconto.
   */
  fonte: 'ordine' | 'pagamento'
}

export type FornitoreUsato = {
  /** `chiaveNome` del nome: lo stesso fornitore è scritto in modi diversi. */
  chiave: string
  /** Il nome più recente fra quelli usati: è quello che la gente riconosce. */
  nome: string
  /** Tutti i modi in cui è stato scritto, se sono più d'uno. */
  altriNomi: string[]
  citta: string
  ordini: OrdineDelFornitore[]
  /** Somma dei costi SCRITTI. */
  totaleCosto: number
  /** Quanti dei suoi ordini non dicono quanto gli abbiamo dato. */
  senzaCosto: number
  /** Somma del venduto dei suoi ordini di cui conosciamo il valore. */
  totaleVenduto: number
  ultimoIl: string | null
}

export type EsitoFornitoriUsati = {
  fornitori: FornitoreUsato[]
  /** Il conto onesto: quanti ordini in tutto, quanti sanno chi li ha preparati. */
  ordiniTotali: number
  ordiniConFornitore: number
  /** Quanti arrivano solo dal pagamento (sull'ordine il fornitore non c'è). */
  soloDaPagamento: number
}

export async function fornitoriUsati(): Promise<EsitoFornitoriUsati> {
  const [ordiniTotali, righe, pagamenti] = await Promise.all([
    db.ordine.count(),
    db.ordine.findMany({
      where: { fornitoreNome: { not: '' } },
      select: {
        id: true,
        numero: true,
        negozioNome: true,
        clienteNome: true,
        citta: true,
        totale: true,
        valuta: true,
        gestione: true,
        annullatoIl: true,
        dataConsegna: true,
        fornitoreNome: true,
        fornitoreCitta: true,
        fornitoreCosto: true,
        fornitoreIl: true,
        fornitoreDaNome: true,
      },
      // ⚠️ Dal più recente: `fornitoreIl` può essere vuoto sui più vecchi, e
      // allora vale il numero — che in quest'app cresce nel tempo.
      orderBy: [{ fornitoreIl: 'desc' }, { numero: 'desc' }],
    }),
    // ⚠️ I pagamenti servono a coprire il caso «l'ordine non dice chi lo ha
    // preparato, ma qualcuno lo ha pagato»: è l'unica traccia che resta, e
    // buttarla via vorrebbe dire mostrare meno di quello che si sa.
    db.richiestaPagamento.findMany({
      where: { ordineNumero: { not: '' }, intestatario: { not: '' } },
      select: {
        id: true,
        intestatario: true,
        ordineNumero: true,
        ordineId: true,
        importo: true,
        valuta: true,
        creatoIl: true,
      },
      orderBy: { creatoIl: 'desc' },
    }),
  ])

  const per = new Map<string, FornitoreUsato>()
  const aggiungi = (nome: string, citta: string, o: OrdineDelFornitore) => {
    const k = chiaveNome(nome)
    if (!k) return
    const f = per.get(k) ?? {
      chiave: k,
      nome,
      altriNomi: [],
      citta: '',
      ordini: [],
      totaleCosto: 0,
      senzaCosto: 0,
      totaleVenduto: 0,
      ultimoIl: null,
    }
    // ⚠️ Il nome mostrato è quello del PRIMO che arriva, e i due elenchi
    // arrivano già ordinati dal più recente: così si legge come è scritto oggi,
    // non come lo scriveva qualcuno a luglio. Gli altri modi non si buttano —
    // servono a capire perché due righe che sembravano diverse sono una sola.
    if (nome !== f.nome && !f.altriNomi.includes(nome)) f.altriNomi.push(nome)
    if (!f.citta && citta) f.citta = citta
    f.ordini.push(o)
    if (o.costo == null) f.senzaCosto++
    else f.totaleCosto += o.costo
    f.totaleVenduto += o.valore
    if (o.registratoIl && (!f.ultimoIl || o.registratoIl > f.ultimoIl)) f.ultimoIl = o.registratoIl
    per.set(k, f)
  }

  const numeriGiaVisti = new Set<string>()
  for (const r of righe) {
    numeriGiaVisti.add(`${chiaveNome(r.fornitoreNome)}|${soloCifre(r.numero)}`)
    aggiungi(r.fornitoreNome, r.fornitoreCitta, {
      id: r.id,
      numero: r.numero,
      scrittoCome: r.fornitoreNome,
      negozio: r.negozioNome,
      cliente: r.clienteNome,
      citta: r.citta,
      valore: r.totale ?? 0,
      valuta: r.valuta || 'EUR',
      costo: r.fornitoreCosto ?? null,
      registratoIl: r.fornitoreIl?.toISOString() ?? null,
      registratoDa: r.fornitoreDaNome,
      consegna: r.dataConsegna?.toISOString() ?? null,
      gestione: r.gestione,
      annullato: !!r.annullatoIl,
      fonte: 'ordine',
    })
  }

  // ── Quello che sanno solo i pagamenti ──
  //
  // ⚠️ Si aggiunge SOLO se quella coppia fornitore+ordine non c'è già: altrimenti
  // lo stesso lavoro comparirebbe due volte, una col costo concordato e una con
  // l'importo del bonifico, e i due numeri non sono lo stesso numero.
  let soloDaPagamento = 0
  for (const p of pagamenti) {
    const chiave = `${chiaveNome(p.intestatario)}|${soloCifre(p.ordineNumero)}`
    if (numeriGiaVisti.has(chiave)) continue
    numeriGiaVisti.add(chiave)
    soloDaPagamento++
    aggiungi(p.intestatario, '', {
      id: p.ordineId || p.id,
      numero: p.ordineNumero,
      scrittoCome: p.intestatario,
      negozio: '',
      cliente: '',
      citta: '',
      // ⚠️ Il venduto qui NON lo sappiamo: la richiesta di pagamento non lo
      // porta. Zero vuol dire «non indicato», e infatti non entra nei conti
      // (`totaleVenduto` somma zero) invece di far sembrare l'ordine gratis.
      valore: 0,
      valuta: p.valuta || 'EUR',
      costo: p.importo || null,
      registratoIl: p.creatoIl.toISOString(),
      // ⚠️ Chi ha CHIESTO il pagamento la RichiestaPagamento non lo registra
      // (`pagataDaNome` è chi ha premuto «Pagata», che è un altro gesto e un
      // altro momento): meglio vuoto che il nome sbagliato.
      registratoDa: '',
      consegna: null,
      gestione: '',
      annullato: false,
      fonte: 'pagamento',
    })
  }

  const fornitori = [...per.values()].sort(
    (a, b) =>
      b.ordini.length - a.ordini.length ||
      b.totaleCosto - a.totaleCosto ||
      a.nome.localeCompare(b.nome, 'it')
  )
  return {
    fornitori,
    ordiniTotali,
    ordiniConFornitore: righe.length,
    soloDaPagamento,
  }
}

/**
 * Le sole cifre del numero d'ordine.
 * ⚠️ «#2799» e «2799» sono lo stesso ordine scritto in due modi: confrontarli
 * secchi farebbe comparire due volte lo stesso lavoro.
 */
function soloCifre(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}
