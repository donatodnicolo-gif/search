import { db } from './db'
import { chiaveNome } from './cerca-fornitore'

// A CHI ABBIAMO PAGATO, E QUANTO — l'elenco dei fornitori pagati davvero.
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «metti solo fornitori a cui abbiamo
// fatto pagamenti e l'importo totale dei pagamenti fatti». La prima versione
// partiva dagli ORDINI (`Ordine.fornitoreNome`) e mostrava chi aveva preparato;
// questa parte dai PAGAMENTI, che è un'altra domanda e ha un'altra risposta:
// «chi ha lavorato» è una decisione registrata, «a chi sono usciti i soldi» è un
// fatto contabile. I due elenchi non coincidono — su un ordine può lavorare
// qualcuno che non abbiamo ancora pagato, e si può pagare qualcuno su un ordine
// che non lo nomina.
//
// ⚠️⚠️ «PAGAMENTI FATTI» vuol dire `pagataIl` valorizzato, non «richiesta
// salvata». Sono due momenti diversi e fra loro possono passare giorni: contare
// le richieste aperte come denaro uscito gonfierebbe il totale di quello che
// dobbiamo ancora pagare. Misurato il 27/08/2026: 23 richieste, **22 pagate per
// 2.418 €** e una aperta da 253 € — che qui NON entra, ma si dice quante e per
// quanto (`aperte`, `importoAperte`), perché un elenco che tace su una richiesta
// aperta si legge come «con lui abbiamo chiuso».
//
// ⚠️ Il valore dell'ordine resta un contorno: si legge dall'ordine collegato
// quando c'è. Se manca, la riga dice «non indicato» e non zero — l'app non deve
// far sembrare gratis un ordine di cui non sa il prezzo.

export type PagamentoAlFornitore = {
  id: string
  /** L'ordine per cui è stato pagato, se è collegato. */
  ordineNumero: string
  /** Come l'intestatario è scritto SU QUESTA richiesta. */
  scrittoCome: string
  importo: number
  valuta: string
  /** Quando il denaro è uscito. */
  pagatoIl: string | null
  pagatoDa: string
  /** Con che mezzo risulta uscito (bonifico, contanti, POS…), quando è scritto. */
  pagatoCon: string
  /** iban · link · paypal · carta · altro. */
  metodo: string
  causale: string
  // ── Il contorno che viene dall'ordine, quando l'ordine c'è ──
  negozio: string
  cliente: string
  citta: string
  /** Quanto ha pagato il cliente. `0` = non lo sappiamo. */
  valoreOrdine: number
  /** Il fornitore scritto SULL'ORDINE, se è diverso da chi abbiamo pagato. */
  fornitoreDellOrdine: string
}

export type FornitorePagato = {
  /** `chiaveNome` dell'intestatario: lo stesso nome è scritto in modi diversi. */
  chiave: string
  nome: string
  /** Gli altri modi in cui è stato scritto, se sono più d'uno. */
  altriNomi: string[]
  pagamenti: PagamentoAlFornitore[]
  /** ⚠️ La somma dei pagamenti FATTI. È il numero che è stato chiesto. */
  totalePagato: number
  valuta: string
  /** L'ultimo pagamento, per data di uscita. */
  ultimoIl: string | null
  /** Quanto valevano in tutto gli ordini pagati di cui conosciamo il prezzo. */
  totaleVenduto: number
  /** Quanti dei suoi pagamenti non dicono quanto ha pagato il cliente. */
  senzaValoreOrdine: number
}

export type EsitoFornitoriUsati = {
  fornitori: FornitorePagato[]
  /** Quante richieste pagate in tutto, e per quanto. */
  pagamenti: number
  totalePagato: number
  /** ⚠️ Le richieste ancora DA pagare: non sono qui dentro, ma si dicono. */
  aperte: number
  importoAperte: number
  /**
   * ⚠️ Se un giorno arrivano pagamenti in valute diverse, un totale solo
   * mentirebbe: si dice invece di sommare mele e pere.
   */
  valuteDiverse: string[]
}

export async function fornitoriUsati(): Promise<EsitoFornitoriUsati> {
  const [richieste, aperte] = await Promise.all([
    db.richiestaPagamento.findMany({
      // ⚠️ `pagataIl: { not: null }` è tutta la differenza fra «gli abbiamo
      // chiesto di pagarlo» e «l'abbiamo pagato».
      where: { pagataIl: { not: null }, intestatario: { not: '' } },
      select: {
        id: true,
        intestatario: true,
        ordineNumero: true,
        importo: true,
        valuta: true,
        causale: true,
        metodo: true,
        pagataIl: true,
        pagataDaNome: true,
        pagatoCon: true,
      },
      orderBy: { pagataIl: 'desc' },
    }),
    db.richiestaPagamento.findMany({
      where: { pagataIl: null, intestatario: { not: '' } },
      select: { importo: true },
    }),
  ])

  // ── Il contorno: gli ordini citati, in UNA query sola ──
  //
  // ⚠️ Una query per riga sarebbe una ventina di andate e ritorni per una
  // schermata sola. Si chiedono tutti insieme i numeri che servono.
  const numeri = richieste.map((r) => r.ordineNumero).filter(Boolean)
  const varianti = [
    ...new Set(numeri.flatMap((n) => [n, n.replace(/^#+/, ''), `#${n.replace(/^#+/, '')}`])),
  ]
  const ordini = varianti.length
    ? await db.ordine.findMany({
        where: { numero: { in: varianti } },
        select: {
          numero: true,
          totale: true,
          negozioNome: true,
          clienteNome: true,
          citta: true,
          fornitoreNome: true,
        },
      })
    : []
  // ⚠️ Si indicizza per SOLE CIFRE: «#2799» e «2799» sono lo stesso ordine
  // scritto in due modi, e confrontarli secchi perderebbe metà degli agganci.
  const perNumero = new Map<string, (typeof ordini)[number]>()
  for (const o of ordini) {
    const k = soloCifre(o.numero)
    // ⚠️ Se lo stesso numero esiste su due negozi non si sceglie: si tiene il
    // primo e basta, perché qui l'ordine è un CONTORNO — il fatto che conta (il
    // pagamento) non dipende da lui. Il posto dove l'ambiguità si risolve è la
    // riconciliazione, che ha l'id dell'ordine.
    if (k && !perNumero.has(k)) perNumero.set(k, o)
  }

  const per = new Map<string, FornitorePagato>()
  for (const r of richieste) {
    const nome = r.intestatario.trim()
    const k = chiaveNome(nome)
    if (!k) continue
    const o = r.ordineNumero ? perNumero.get(soloCifre(r.ordineNumero)) : undefined
    const f =
      per.get(k) ??
      ({
        chiave: k,
        nome,
        altriNomi: [],
        pagamenti: [],
        totalePagato: 0,
        valuta: r.valuta || 'EUR',
        ultimoIl: null,
        totaleVenduto: 0,
        senzaValoreOrdine: 0,
      } satisfies FornitorePagato)
    // ⚠️ Le righe arrivano dal pagamento più recente: il nome mostrato è quindi
    // quello scritto l'ultima volta, non quello di mesi fa. Gli altri modi non
    // si buttano — spiegano perché due righe che sembravano diverse sono una.
    if (nome !== f.nome && !f.altriNomi.includes(nome)) f.altriNomi.push(nome)
    f.totalePagato += r.importo ?? 0
    const quando = r.pagataIl?.toISOString() ?? null
    if (quando && (!f.ultimoIl || quando > f.ultimoIl)) f.ultimoIl = quando
    const valore = o?.totale ?? 0
    if (valore) f.totaleVenduto += valore
    else f.senzaValoreOrdine++
    f.pagamenti.push({
      id: r.id,
      ordineNumero: r.ordineNumero,
      scrittoCome: nome,
      importo: r.importo ?? 0,
      valuta: r.valuta || 'EUR',
      pagatoIl: quando,
      pagatoDa: r.pagataDaNome ?? '',
      pagatoCon: r.pagatoCon ?? '',
      metodo: r.metodo || 'iban',
      causale: r.causale ?? '',
      negozio: o?.negozioNome ?? '',
      cliente: o?.clienteNome ?? '',
      citta: o?.citta ?? '',
      valoreOrdine: valore,
      // ⚠️ Si mostra SOLO se è un nome diverso da chi abbiamo pagato: uguale
      // sarebbe rumore, diverso è una cosa da guardare (l'ordine dice che l'ha
      // preparato Tizio e i soldi sono andati a Caio).
      fornitoreDellOrdine:
        o?.fornitoreNome && chiaveNome(o.fornitoreNome) !== k ? o.fornitoreNome : '',
    })
    per.set(k, f)
  }

  const fornitori = [...per.values()].sort(
    (a, b) => b.totalePagato - a.totalePagato || a.nome.localeCompare(b.nome, 'it')
  )
  return {
    fornitori,
    pagamenti: richieste.length,
    totalePagato: richieste.reduce((s, r) => s + (r.importo ?? 0), 0),
    aperte: aperte.length,
    importoAperte: aperte.reduce((s, r) => s + (r.importo ?? 0), 0),
    valuteDiverse: [...new Set(richieste.map((r) => r.valuta || 'EUR'))],
  }
}

/**
 * Le sole cifre del numero d'ordine.
 * ⚠️ «#2799» e «2799» sono lo stesso ordine scritto in due modi.
 */
function soloCifre(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}
