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
export type FonteFornitore = 'pagamento' | 'ordine' | 'registro'

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
   * Quante parole della ricerca compaiono davvero nel nome.
   * ⚠️ È quello che mette in cima i risultati migliori senza buttare via gli
   * altri: chi cerca «Pasticceria Rossi» vede prima «Pasticceria Rossi Snc»,
   * ma vede anche le altre pasticcerie e gli altri Rossi.
   */
  corrispondenza: number
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
 * Il nome (o la ragione sociale) contiene DAVVERO quello che si è cercato?
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
 */
export function paroleTrovate(
  f: { nome: string; ragioneSociale: string },
  cercato: string
): number {
  const parole = chiaveNome(cercato)
    .split(' ')
    .filter((p) => p.length >= 3)
  const dove = `${chiaveNome(f.nome)} ${chiaveNome(f.ragioneSociale)}`
  if (!parole.length) {
    // Ricerca di una o due lettere: non si esclude nessuno, ma non si finge
    // nemmeno una corrispondenza.
    return chiaveNome(cercato) && dove.includes(chiaveNome(cercato)) ? 1 : 0
  }
  return parole.filter((p) => dove.includes(p)).length
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
 * Quanto è buono un risultato: prima chi possiamo pagare subito.
 *
 * ⚠️ L'ordine non è alfabetico e nemmeno per «somiglianza del nome»: è per
 * QUANTO CI RISPARMIA. Un fornitore di cui abbiamo l'IBAN si sceglie con un
 * clic; uno che conosciamo solo dal registro va comunque compilato a mano.
 */
export function punteggio(f: FornitoreTrovato): number {
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
  return p
}

/** Unisce quello che sappiamo dello stesso fornitore da fonti diverse. */
export function unisci(pezzi: FornitoreTrovato[]): FornitoreTrovato[] {
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
      corrispondenza: Math.max(prec.corrispondenza, p.corrispondenza),
    })
  }
  return [...per.values()].sort((a, b) => punteggio(b) - punteggio(a) || a.nome.localeCompare(b.nome, 'it'))
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
  if (!pezzi.length) pezzi.push('solo in anagrafica: IBAN da chiedere')
  return pezzi.join(' · ')
}
