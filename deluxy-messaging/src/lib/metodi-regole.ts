/**
 * ⭐ 11/09/2026 — I METODI DI PAGAMENTO: TIPI E REGOLE, senza database.
 *
 * Richiesta dell'utente: «in nuovo ordine la terza opzione è altri metodi di
 * pagamento: consentimi su impostazioni di stabilire per ogni metodo che viene
 * elencato le specifiche».
 *
 * ⚠️⚠️ «Specifiche» qui vuol dire **comportamento**, non etichetta. Un metodo
 * dice quattro cose, e ognuna cambia qualcosa di vero:
 *   1. **come nasce l'ordine** su Shopify — da incassare (PENDING) o pagato;
 *   2. **quando è dovuto** il pagamento — alla consegna o alla ricezione: sono
 *      i termini di pagamento di Shopify, ed è quello che fa nascere il PENDING;
 *   3. **che cosa si dice al cliente** — l'IBAN del bonifico, «paga al valet»;
 *   4. **che cosa resta scritto** — la riga per chi consegna (nota) e
 *      l'attributo per le macchine (in piattaforma fa nascere la vendita in
 *      contrassegno).
 *
 * Prima erano sette parole scritte nel codice e una strada sola: qualunque cosa
 * si scegliesse, l'ordine nasceva allo stesso modo.
 *
 * ⚠️ Questo file NON tocca il database apposta: lo importa anche la schermata
 * (un componente client), e la validazione dev'essere la stessa di qua e di là
 * — il server non si fida di quello che arriva dal browser, ma le frasi che
 * legge chi sbaglia devono essere identiche.
 */

/** Come nasce l'ordine su Shopify. ⚠️ Sono i soldi: si cambia solo di proposito. */
export type ComeNasce = 'da-incassare' | 'pagato'
/** Quando il pagamento è dovuto (solo per «da incassare»). */
export type QuandoDovuto = 'consegna' | 'ricevuta'

export type Metodo = {
  id: string
  nome: string
  attivo: boolean
  posizione: number
  negozioId: string | null
  comeNasce: ComeNasce
  quandoDovuto: QuandoDovuto
  istruzioni: string
  notaConsegna: string
  attributo: string
}

/**
 * ⚠️⚠️ IL METODO DI RIPIEGO, e il motivo per cui esiste.
 *
 * Fino a oggi il contrassegno era una scelta del codice (`pagamento:
 * 'alla-consegna'`) e da lì passano ancora il CRM e la rotta `/api/v1`. Quelle
 * chiamate non conoscono gli id dei metodi: se arrivano senza, si comportano
 * ESATTAMENTE come prima invece di rompersi. È lo stesso comportamento che la
 * migrazione ha seminato in «Contanti alla consegna».
 */
export const METODO_CONTRASSEGNO: Metodo = {
  id: '',
  nome: '',
  attivo: true,
  posizione: 0,
  negozioId: null,
  comeNasce: 'da-incassare',
  quandoDovuto: 'consegna',
  istruzioni: '',
  notaConsegna: '',
  attributo: 'Pagamento_Alla_Consegna',
}

export function comeNasceValido(v: unknown): ComeNasce {
  return v === 'pagato' ? 'pagato' : 'da-incassare'
}
export function quandoValido(v: unknown): QuandoDovuto {
  return v === 'ricevuta' ? 'ricevuta' : 'consegna'
}

export type DatiMetodo = Omit<Metodo, 'id'>

/**
 * Controlla quello che arriva dal modulo di Impostazioni. Gli errori tornano
 * TUTTI INSIEME, come negli orari: si correggono in un giro solo.
 */
export function validaMetodo(body: unknown): { ok: true; dati: DatiMetodo } | { ok: false; errori: string[] } {
  const b = (body ?? {}) as Record<string, unknown>
  const errori: string[] = []
  const nome = String(b.nome ?? '').trim()
  if (!nome) errori.push('Il nome non può restare vuoto: è quello che si legge nella tendina e nella nota dell’ordine.')
  if (nome.length > 60) errori.push('Il nome è troppo lungo (max 60 caratteri).')

  const comeNasce = comeNasceValido(b.comeNasce)
  const quandoDovuto = quandoValido(b.quandoDovuto)
  const attributo = String(b.attributo ?? '').trim()
  // ⚠️ L'attributo lo legge una macchina: Shopify accetta quasi tutto, ma un
  // nome con spazi o accenti nessuno lo va più a cercare. Si dice, non si
  // corregge di nascosto.
  if (attributo && !/^[A-Za-z0-9_]{1,40}$/.test(attributo)) {
    errori.push('L’attributo lo legge una macchina: lettere, numeri e _ (es. Pagamento_Alla_Consegna), max 40.')
  }
  const istruzioni = String(b.istruzioni ?? '').trim()
  const notaConsegna = String(b.notaConsegna ?? '').trim()
  if (istruzioni.length > 500) errori.push('Le istruzioni per il cliente sono troppo lunghe (max 500 caratteri).')
  if (notaConsegna.length > 300) errori.push('La nota per chi consegna è troppo lunga (max 300 caratteri).')
  // ⚠️ Un ordine che nasce PAGATO non ha niente da incassare: una riga che dice
  // a chi consegna di tornare coi soldi sarebbe un'istruzione sbagliata.
  if (comeNasce === 'pagato' && notaConsegna) {
    errori.push(
      'Un metodo che fa nascere l’ordine già pagato non può avere una riga per chi consegna: non c’è niente da incassare.'
    )
  }
  const posizioneN = Number(b.posizione ?? 0)
  if (!Number.isFinite(posizioneN) || posizioneN < 0 || posizioneN > 9999) {
    errori.push('La posizione è un numero da 0 a 9999 (piccolo = in alto).')
  }
  if (errori.length) return { ok: false, errori }
  return {
    ok: true,
    dati: {
      nome,
      attivo: b.attivo !== false,
      posizione: Math.round(posizioneN),
      negozioId: String(b.negozioId ?? '').trim() || null,
      comeNasce,
      quandoDovuto,
      istruzioni,
      notaConsegna,
      attributo,
    },
  }
}

/**
 * Che cosa succederà, a parole. ⚠️ La stessa frase in Impostazioni e in Nuovo
 * ordine: chi imposta e chi usa devono leggere la stessa cosa, altrimenti la
 * seconda sembra una promessa diversa dalla prima.
 */
export function descriviMetodo(m: Pick<Metodo, 'comeNasce' | 'quandoDovuto'>): string {
  return m.comeNasce === 'pagato'
    ? 'L’ordine nasce GIÀ PAGATO: usalo solo quando i soldi sono arrivati davvero.'
    : `L’ordine nasce DA INCASSARE (su Shopify «in attesa di pagamento»), dovuto ${
        m.quandoDovuto === 'consegna' ? 'alla consegna' : 'alla ricezione della richiesta'
      }.`
}
