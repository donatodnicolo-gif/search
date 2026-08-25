// CERCARE UN FORNITORE FRA QUELLI CHE GIÀ CONOSCIAMO.
//
// ⚠️ Prima di chiedere un pagamento si riscriveva tutto a mano: nome, IBAN,
// importo. Ma il fornitore quasi sempre lo conosciamo già — sta nel registro
// Anagrafiche, o gli abbiamo dato altri ordini, o lo abbiamo già pagato. Far
// ribattere a mano un IBAN che abbiamo in casa non è solo lento: è il modo
// classico di sbagliare una cifra su ventisette.
//
// ⚠️ Questo file NON importa `db`: lo usa anche il modulo di ricerca dentro la
// pagina Pagamenti, che è un componente client. Le query stanno nella rotta.

/** Da dove viene quello che sappiamo di lui. Cambia quanto ci si può fidare. */
export type FonteFornitore = 'pagamento' | 'ordine' | 'registro' | 'maps'

export type FornitoreTrovato = {
  /** Come si chiama, nella forma migliore che abbiamo. */
  nome: string
  /** La ragione sociale, quando il registro ce l'ha: è quella che va sull'IBAN. */
  ragioneSociale: string
  citta: string
  telefono: string
  email: string
  /** L'IBAN, SOLO se lo abbiamo già usato per pagarlo. */
  iban: string
  /**
   * ⚠️ Se di questo nome risultano IBAN DIVERSI, qui c'è il conto e `iban`
   * resta vuoto. Scegliere il più recente sarebbe la cosa peggiore: due IBAN
   * diversi vogliono dire che è cambiato qualcosa (un conto nuovo, un'altra
   * società, un omonimo), e indovinare vuol dire mandare i soldi altrove.
   */
  ibanDiversi: number
  /** Quanti ordini gli abbiamo già dato, e quanto gli abbiamo dato l'ultima volta. */
  ordini: number
  ultimoCosto: number | null
  /** Quante volte l'abbiamo già pagato. */
  pagamenti: number
  fonti: FonteFornitore[]
  /** Lo stato nel registro Anagrafiche: «Partner», «Prospect»… */
  stato: string
  /**
   * La categoria del registro: FIORISTA, PASTICCERIA, BOUTIQUE…
   *
   * ⚠️⚠️ È l'unico modo in cui il registro dice «questo è un fornitore»: un
   * campo «fornitore sì/no» non esiste. Per questo si MOSTRA invece di essere
   * usata per filtrare — vedi `diMestiere` qui sotto.
   */
  categoria: string
  /** L'indirizzo per esteso, quando viene da Google Maps. */
  indirizzo: string
  /** L'id di Google, per chiedergli il telefono quando lo si sceglie. */
  mapsId: string
  /** Il giudizio su Maps: di uno che non conosciamo è tutto quello che sappiamo. */
  voto: number | null
  recensioni: number
  /** Risulta chiuso definitivamente su Maps. */
  chiuso: boolean
  /**
   * Quante parole della ricerca compaiono davvero nel nome.
   * ⚠️ È quello che mette in cima i risultati migliori senza buttare via gli
   * altri: chi cerca «Pasticceria Rossi» vede prima «Pasticceria Rossi Snc»,
   * ma vede anche le altre pasticcerie e gli altri Rossi.
   */
  corrispondenza: number
}

/**
 * Un fornitore «vuoto», da cui partire.
 *
 * ⚠️ Esiste perché le fonti sono quattro e ognuna sa poche cose: senza una base
 * comune, aggiungendo un campo al tipo bisogna ricordarsi di riempirlo in
 * quattro punti — e quello dimenticato non da' errore, da' `undefined` a
 * schermo. Così invece il compilatore lo pretende una volta sola, qui.
 */
export function fornitoreVuoto(): FornitoreTrovato {
  return {
    nome: '',
    ragioneSociale: '',
    citta: '',
    telefono: '',
    email: '',
    iban: '',
    ibanDiversi: 0,
    ordini: 0,
    ultimoCosto: null,
    pagamenti: 0,
    fonti: [],
    stato: '',
    categoria: '',
    indirizzo: '',
    mapsId: '',
    voto: null,
    recensioni: 0,
    chiuso: false,
    corrispondenza: 0,
  }
}

/** Come si confronta un nome: senza maiuscole, accenti né doppi spazi. */
export function chiaveNome(v: string): string {
  return (v ?? '')
    .normalize('NFD')
    // ⚠️ Il codice del segno, non il segno: scritto per esteso, un salvataggio
    // con la codifica sbagliata lo trasformerebbe in una regex che non toglie
    // più gli accenti — e «Caffè» smetterebbe di trovare «Caffe» in silenzio.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * La parola senza la vocale finale, per far combaciare i plurali italiani.
 *
 * ⚠️ «fiori» e «fiore» non sono uno il prefisso dell'altro — cambiano
 * sull'ultima lettera — quindi il confronto per prefisso li mancava e cercare
 * «fiori» non trovava «Fiore Blu». Si taglia UNA vocale sola, e solo da parole
 * di almeno quattro lettere: su parole corte farebbe combaciare cose diverse.
 * ⚠️ Non tocca «commercial» (finisce per consonante), quindi non riapre la
 * porta a «commercialisti».
 */
function senzaVocaleFinale(p: string): string {
  return p.length >= 4 && /[aeio]$/.test(p) ? p.slice(0, -1) : p
}

/**
 * Quanto il nome contiene DAVVERO quello che si è cercato.
 *
 * ⚠️⚠️ Serve perché il registro Anagrafiche cerca anche dentro le NOTE e i
 * contatti. Misurato: cercando «rossi» rispondevano ANTONIO MARRAS, BRIONI e
 * DOLCE & GABBANA — perché nelle loro note c'è scritto «p**rossi**ma
 * settimana». Su una pagina di pagamenti quel rumore non è solo fastidioso: si
 * sceglie un nome da un elenco credendo che c'entri con quello che si è
 * cercato, e si chiede un bonifico all'azienda sbagliata.
 *
 * ⚠️ Si controlla PAROLA PER PAROLA e non con un `includes` secco: «rossi
 * pasticceria» deve trovare «Pasticceria Rossi», che ha le stesse parole in
 * ordine diverso. Le parole di una o due lettere si ignorano — «di», «e», «s»
 * non distinguono niente e taglierebbero fuori risultati buoni.
 *
 * ⚠️⚠️ NON TUTTE LE CORRISPONDENZE VALGONO UGUALE, e questo è il difetto
 * segnalato dall'utente il 25/08/2026: cercando **«commercial garden»** in cima
 * uscivano **«Studio BM Commercialisti»** e **«Studio Commercialista
 * Pragmatika»**, perché `"commercialisti".includes("commercial")` è vero. Un
 * pezzo di parola dentro un'altra parola NON è il nome che si sta cercando:
 * «commercial» è una parola intera in «Commercial Garden Group» e un frammento
 * in «commercialisti», e le due cose non possono pesare uguale.
 *
 * Tre gradi, e il terzo esiste apposta per non perdere niente:
 *  · **parola intera** → 1, è lui;
 *  · **quasi** (uno è prefisso dell'altro, al massimo due lettere di scarto) →
 *    0,7: regge i plurali e le flessioni italiane («fiore»/«fiori»,
 *    «garden»/«gardens») senza aprire la porta a «commercialisti»;
 *  · **frammento** (dentro un'altra parola) → 0,15: **non si butta via**, ma
 *    pesa così poco che finisce sotto a chiunque corrisponda davvero.
 *
 * Il terzo grado è una scelta, non una dimenticanza: escludere del tutto i
 * frammenti farebbe sparire risultati buoni che nessuno saprebbe mancanti, ed è
 * l'errore opposto — quello che fa smettere di usare la casella di ricerca.
 */
export function paroleTrovate(
  f: { nome: string; ragioneSociale: string },
  cercato: string
): number {
  const parole = chiaveNome(cercato)
    .split(' ')
    .filter((p) => p.length >= 3)
  const testo = `${chiaveNome(f.nome)} ${chiaveNome(f.ragioneSociale)}`
  if (!parole.length) {
    // Ricerca di una o due lettere: non si esclude nessuno, ma non si finge
    // nemmeno una corrispondenza.
    return chiaveNome(cercato) && testo.includes(chiaveNome(cercato)) ? 1 : 0
  }
  const suoi = testo.split(' ').filter(Boolean)
  let punti = 0
  for (const p of parole) {
    let meglio = 0
    for (const s of suoi) {
      if (s === p) {
        meglio = 1
        break // meglio di così non si può: si passa alla parola dopo
      }
      const [corta, lunga] = s.length < p.length ? [s, p] : [p, s]
      if (
        (lunga.startsWith(corta) && lunga.length - corta.length <= 2) ||
        senzaVocaleFinale(s) === senzaVocaleFinale(p)
      ) {
        meglio = Math.max(meglio, 0.7)
      } else if (s.includes(p)) {
        meglio = Math.max(meglio, 0.15)
      }
    }
    punti += meglio
  }
  return punti
}

/**
 * Almeno una parola corrisponde per davvero (parola intera o quasi)?
 *
 * ⚠️ Serve a dire «fra i nostri non c'è» senza mentire: con i soli frammenti
 * l'elenco non è vuoto, ma non contiene niente che c'entri — ed è il caso in
 * cui bisogna mandare la persona su Google Maps invece di lasciarla scegliere
 * fra i commercialisti.
 */
export const CORRISPONDENZA_VERA = 0.7

export function corrispondenzaVera(
  f: { nome: string; ragioneSociale: string },
  cercato: string
): boolean {
  return paroleTrovate(f, cercato) >= CORRISPONDENZA_VERA
}

/**
 * Si tiene, sì o no.
 *
 * ⚠️⚠️ Basta UNA parola, non tutte — ed è la correzione di un difetto vero:
 * pretendendole tutte, cercare «Pasticceria Rossi» dava **zero risultati**
 * (misurato) perché nel registro non c'è un'insegna con tutte e due le parole.
 * Una casella che non trova mai niente si smette di usare dopo due volte, e si
 * torna a ribattere gli IBAN a mano — cioè il problema da cui si è partiti.
 * Chi corrisponde meglio va IN CIMA, non da solo.
 *
 * ⚠️ Ma almeno una parola dev'esserci: è quello che tiene fuori il rumore del
 * registro, che cerca anche dentro le note («p**rossi**ma settimana»).
 */
export function nomeCorrisponde(
  f: { nome: string; ragioneSociale: string },
  cercato: string
): boolean {
  const parole = chiaveNome(cercato)
    .split(' ')
    .filter((p) => p.length >= 3)
  if (!parole.length) return true
  return paroleTrovate(f, cercato) > 0
}

/**
 * L'IBAN come si mostra a chi deve riconoscerlo: le prime 4 e le ultime 4.
 *
 * ⚠️ NON si mostra intero in un elenco: è un dato bancario, e un elenco di
 * IBAN completi a schermo è una cosa che si finisce per fotografare o incollare
 * altrove. Chi deve capire «è lui?» gli bastano le ultime quattro.
 */
export function ibanAccorciato(iban: string): string {
  const v = (iban ?? '').replace(/\s+/g, '').toUpperCase()
  if (v.length < 10) return v
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

/**
 * Le categorie del registro che vogliono dire «da qui compriamo».
 *
 * ⚠️⚠️ Il registro NON ha un campo «fornitore»: la marcatura è la CATEGORIA, e
 * sono più parole per la stessa cosa (contate sul registro vero il 24/08/2026:
 * FIORISTA 144 **e** FIORI 5, PASTICCERIA 98 **e** CIOCCOLATERIA 5). Guardarne
 * una sola perde un pezzo di elenco senza che si veda che manca.
 *
 * ⚠️⚠️ E NON si filtra su questa lista: **340 partner su 1048 sono «DA
 * CLASSIFICARE»**. Filtrando, un terzo del registro sparirebbe dalla ricerca —
 * compreso, un giorno su tre, proprio quello che si sta cercando. Quindi si
 * MARCA e si ORDINA: i fornitori in cima, gli altri sotto, nessuno nascosto.
 */
const CATEGORIE_FORNITURA = new Set([
  'FIORISTA', 'FIORISTI', 'FIORAIO', 'FIORI',
  'PASTICCERIA', 'PASTICCERIE', 'CIOCCOLATERIA', 'CAKE',
  'CATERING', 'CHEF PRIVATO', 'RISTORANTE', 'ENOTECA', 'PARTY',
])

/** Da questa categoria si compra, sì o no. */
export function diMestiere(categoria: string): boolean {
  return CATEGORIE_FORNITURA.has((categoria || '').trim().toUpperCase())
}

/**
 * Quanto è buono un risultato: prima chi possiamo pagare subito.
 *
 * ⚠️ L'ordine non è alfabetico e nemmeno per «somiglianza del nome»: è per
 * QUANTO CI RISPARMIA. Un fornitore di cui abbiamo l'IBAN si sceglie con un
 * clic; uno che conosciamo solo dal registro va comunque compilato a mano; uno
 * di Google Maps va telefonato, e va in fondo.
 *
 * `dove` è la zona di consegna, quando si sa: vedi sotto perché conta.
 */
export function punteggio(f: FornitoreTrovato, dove = ''): number {
  // ⚠️ La corrispondenza pesa più di tutto il resto: chi cerca «Pasticceria
  // Rossi» vuole «Pasticceria Rossi» in cima, anche se di un'altra pasticceria
  // conosciamo già l'IBAN. Il resto ordina i pari merito.
  let p = f.corrispondenza * 5000
  if (f.iban) p += 1000
  if (f.ibanDiversi > 1) p += 500 // lo sa, ma deve scegliere lui
  p += Math.min(f.pagamenti, 20) * 10
  p += Math.min(f.ordini, 20) * 5
  if (f.ragioneSociale) p += 3
  if (f.stato === 'Partner') p += 2
  // ⚠️ Chi è segnato con una categoria da cui compriamo va davanti a chi è in
  // registro come cliente o come «da classificare» — a parità di nome. Pesa
  // meno della corrispondenza: cercando un nome preciso vince sempre il nome.
  if (diMestiere(f.categoria)) p += 400
  // ⚠️⚠️ LA ZONA CONTA ANCHE SUI NOSTRI. Misurato: cercando «pasticceria» per
  // una consegna a **Lecce**, in cima uscivano le pasticcerie di Firenze, Roma
  // e Siena — perché la zona restringeva solo la ricerca su Maps. Chi cerca un
  // fornitore per un ordine lo cerca DOVE si consegna: una pasticceria a 700 km
  // non è un risultato migliore di una a Lecce, è un risultato inutile.
  //
  // ⚠️ Si ALZA, non si filtra: un fornitore del paese accanto è quasi sempre
  // buono, e la città scritta nel registro non è sempre quella del laboratorio.
  if (dove && f.citta && chiaveNome(f.citta) === chiaveNome(dove)) p += 2000
  // ⚠️⚠️ Chi viene da Google Maps va IN FONDO, sempre. Non lo conosciamo: non
  // sappiamo se risponde, se fattura, se ha già lavorato per noi. Metterlo
  // vicino a uno che abbiamo già pagato dieci volte vuol dire farlo scegliere
  // per sbaglio, con la fretta di un ordine da sistemare.
  if (f.fonti.length === 1 && f.fonti[0] === 'maps') p -= 100000
  // Chiuso definitivamente: c'è, ma per ultimo.
  if (f.chiuso) p -= 5000
  return p
}

/** Unisce quello che sappiamo dello stesso fornitore da fonti diverse. */
export function unisci(pezzi: FornitoreTrovato[], dove = ''): FornitoreTrovato[] {
  const per = new Map<string, FornitoreTrovato>()
  for (const p of pezzi) {
    const k = chiaveNome(p.nome)
    if (!k) continue
    const prec = per.get(k)
    if (!prec) {
      per.set(k, { ...p, fonti: [...p.fonti] })
      continue
    }
    // ⚠️ Non si sovrascrive quello che c'è già con un vuoto: le fonti sono
    // parziali per natura — il registro non ha l'IBAN, i pagamenti non hanno la
    // città — e l'ultima che arriva cancellerebbe il lavoro delle altre.
    per.set(k, {
      nome: prec.nome || p.nome,
      ragioneSociale: prec.ragioneSociale || p.ragioneSociale,
      citta: prec.citta || p.citta,
      telefono: prec.telefono || p.telefono,
      email: prec.email || p.email,
      iban: prec.iban || p.iban,
      ibanDiversi: Math.max(prec.ibanDiversi, p.ibanDiversi),
      ordini: prec.ordini + p.ordini,
      ultimoCosto: prec.ultimoCosto ?? p.ultimoCosto,
      pagamenti: prec.pagamenti + p.pagamenti,
      fonti: [...new Set([...prec.fonti, ...p.fonti])],
      stato: prec.stato || p.stato,
      categoria: prec.categoria || p.categoria,
      indirizzo: prec.indirizzo || p.indirizzo,
      mapsId: prec.mapsId || p.mapsId,
      voto: prec.voto ?? p.voto,
      recensioni: Math.max(prec.recensioni, p.recensioni),
      // ⚠️ Se UNA fonte lo dà per chiuso, resta chiuso: la nostra copia può
      // essere vecchia di mesi, Maps no.
      chiuso: prec.chiuso || p.chiuso,
      corrispondenza: Math.max(prec.corrispondenza, p.corrispondenza),
    })
  }
  return [...per.values()].sort(
    (a, b) => punteggio(b, dove) - punteggio(a, dove) || a.nome.localeCompare(b.nome, 'it')
  )
}

/** In una riga: che cosa sappiamo già di lui. */
export function cosaSappiamo(f: FornitoreTrovato): string {
  const pezzi: string[] = []
  if (f.iban) pezzi.push(`IBAN ${ibanAccorciato(f.iban)}`)
  else if (f.ibanDiversi > 1) pezzi.push(`${f.ibanDiversi} IBAN diversi: scegli tu`)
  if (f.pagamenti) pezzi.push(`pagato ${f.pagamenti} volt${f.pagamenti === 1 ? 'a' : 'e'}`)
  if (f.ordini) pezzi.push(`${f.ordini} ordin${f.ordini === 1 ? 'e' : 'i'}`)
  if (f.ultimoCosto !== null && Number.isFinite(f.ultimoCosto)) {
    pezzi.push(
      `ultimo a ${f.ultimoCosto!.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`
    )
  }
  // ⚠️ Di uno trovato su Maps si dice CHE COSA NON SAPPIAMO, non si tace: la
  // riga sembrerebbe uguale a quella di un fornitore nostro, e a colpo d'occhio
  // si finirebbe per sceglierlo credendo di averci già lavorato.
  if (!pezzi.length && f.fonti.includes('maps')) {
    const voto = f.voto !== null ? `${f.voto.toFixed(1)}★ su ${f.recensioni} recensioni` : ''
    return [f.chiuso ? '⚠️ risulta CHIUSO' : '', 'da Google Maps: non ci abbiamo mai lavorato', voto]
      .filter(Boolean)
      .join(' · ')
  }
  if (!pezzi.length) pezzi.push('solo in anagrafica: IBAN da chiedere')
  return pezzi.join(' · ')
}
