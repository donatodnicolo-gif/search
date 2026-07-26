// In che lingua scrivere a un cliente.
//
// Deluxy consegna soprattutto in Italia, ma non solo: sui 13.967 ordini del
// registro ce ne sono 104 in Francia, 57 nel Regno Unito, 25 negli Stati Uniti,
// 25 in Australia, e poi Svizzera, Monaco, Spagna, Olanda, Irlanda, Germania.
// Scrivere «Buongiorno, le scriviamo riguardo al suo ordine» a un cliente di
// Londra è il genere di dettaglio che fa sembrare improvvisato tutto il resto.
//
// ⚠️ SI GUARDA CHI COMPRA, NON DOVE VANNO I FIORI.
// Qui si vende soprattutto regalo: chi ordina e chi riceve sono spesso due
// persone diverse, in due paesi diversi. Il messaggio lo mandiamo al CLIENTE
// (sul suo telefono, alla sua email), quindi la lingua è la sua — e il paese di
// SPEDIZIONE parla del destinatario, non di lui. Usarlo per primo farebbe
// scrivere in italiano a un londinese che manda fiori a Milano, e in francese a
// un italiano che li manda a Parigi: sbagliato in entrambi i versi.
//
// L'ordine dei segnali, dal più vicino al cliente al più lontano:
//   1. PREFISSO del suo telefono (+44, +33…) — è il suo numero;
//   2. DOMINIO della sua email (.fr, .co.uk…) — indizio più debole ma suo;
//   3. PAESE di spedizione — ultimo, e solo perché su un ordine per sé stessi
//      coincide col cliente; se dice altro è comunque meglio di niente;
//   4. **inglese**, quando non si sa: fra sconosciuti è meno peggio
//      dell'italiano.
//
// I paesi con più lingue ufficiali (Svizzera, Belgio, Canada) NON si indovinano:
// da un indirizzo non si sa se una persona a Berna parli tedesco o francese.
// Vanno in inglese come tutti gli incerti — e l'operatore, che il messaggio lo
// vede prima di inviarlo, può cambiarlo.
//
// Nessuna traduzione automatica: i testi sono scritti qui, brevi, e sono solo
// l'apertura. Il resto lo scrive la persona.

export const LINGUE = [
  { chiave: 'it', nome: 'italiano' },
  { chiave: 'en', nome: 'inglese' },
  { chiave: 'fr', nome: 'francese' },
  { chiave: 'es', nome: 'spagnolo' },
  { chiave: 'de', nome: 'tedesco' },
] as const

export type ChiaveLingua = (typeof LINGUE)[number]['chiave']

export function nomeLingua(chiave: string): string {
  return LINGUE.find((l) => l.chiave === chiave)?.nome ?? chiave
}

// Paese di spedizione (ISO 2 lettere) → lingua in cui scrivere.
// Ci sono solo i casi in cui la lingua è ragionevolmente certa: la Svizzera
// (CH), il Belgio (BE) e il Canada (CA) sono volutamente ASSENTI, perché lì il
// paese non dice la lingua.
const PAESE_LINGUA: Record<string, ChiaveLingua> = {
  IT: 'it',
  SM: 'it', // San Marino
  VA: 'it', // Città del Vaticano
  FR: 'fr',
  MC: 'fr', // Monaco
  ES: 'es',
  DE: 'de',
  AT: 'de',
  GB: 'en',
  IE: 'en',
  US: 'en',
  AU: 'en',
  NZ: 'en',
}

// Prefisso telefonico → lingua, usato solo quando il paese non si sa.
// Ordinato dal più lungo al più corto: +377 (Monaco) va provato prima di +37…
const PREFISSO_LINGUA: [string, ChiaveLingua][] = [
  ['+378', 'it'], // San Marino
  ['+377', 'fr'], // Monaco
  ['+39', 'it'],
  ['+33', 'fr'],
  ['+34', 'es'],
  ['+49', 'de'],
  ['+43', 'de'],
  ['+44', 'en'],
  ['+353', 'en'],
  ['+1', 'en'], // USA/Canada: il Canada è bilingue, ma +1 è per larga parte USA
  ['+61', 'en'],
  ['+64', 'en'],
]

// Dominio di primo livello dell'email → lingua. Indizio più debole del telefono
// (un francese può avere una gmail), ma riguarda il cliente e non il
// destinatario, quindi vale più del paese di spedizione.
const TLD_LINGUA: [string, ChiaveLingua][] = [
  ['.co.uk', 'en'],
  ['.com.au', 'en'],
  ['.it', 'it'],
  ['.fr', 'fr'],
  ['.es', 'es'],
  ['.de', 'de'],
  ['.at', 'de'],
  ['.ie', 'en'],
  ['.uk', 'en'],
]

export type EsitoLingua = {
  lingua: ChiaveLingua
  /**
   * Da cosa è stata dedotta: serve a dirlo all'operatore, non a decorare.
   * `estero-ignoto` = sappiamo che non è italiano ma non quale lingua parli;
   * `nessun-segnale` = non sappiamo niente e si applica la base dell'archivio.
   */
  da: 'telefono' | 'email' | 'paese' | 'estero-ignoto' | 'nessun-segnale'
}

/**
 * In che lingua scrivere a questo cliente.
 *
 * I segnali si guardano dal più vicino al cliente al più lontano — telefono,
 * email, e solo per ultimo il paese di SPEDIZIONE, che descrive il destinatario
 * (vedi la nota in testa al file). Quando non si sa nulla si torna `en` con
 * `da: 'predefinita'`, così chi guarda sa che è un ripiego e non un dato.
 */
export function linguaCliente(paese: string, telefono = '', email = ''): EsitoLingua {
  // 1. Il suo telefono CON prefisso internazionale: l'unico segnale che dichiara
  //    davvero un paese.
  const t = (telefono || '').replace(/[^\d+]/g, '')
  if (t.startsWith('+')) {
    for (const [pre, lingua] of PREFISSO_LINGUA) {
      if (t.startsWith(pre)) return { lingua, da: 'telefono' }
    }
  }

  // 2. La sua email.
  const e = (email || '').trim().toLowerCase()
  if (e.includes('@')) {
    for (const [tld, lingua] of TLD_LINGUA) {
      if (e.endsWith(tld)) return { lingua, da: 'email' }
    }
  }

  // 3. Ha un prefisso internazionale che non sappiamo tradurre (+971, +41…):
  //    è la prova che il cliente NON sta nel paese di spedizione, quindi qui ci
  //    si ferma e si va in inglese. Andare avanti al paese vorrebbe dire
  //    scrivere in francese a un cliente di Dubai che manda fiori a Parigi —
  //    caso vero, l'ordine #2378.
  if (t.startsWith('+')) return { lingua: 'en', da: 'estero-ignoto' }

  // 4. Il paese di spedizione, se la lingua è ragionevolmente certa. Svizzera,
  //    Belgio e Canada non sono in tabella di proposito.
  const p = (paese || '').trim().toUpperCase()
  if (p && PAESE_LINGUA[p]) return { lingua: PAESE_LINGUA[p], da: 'paese' }

  // 5. Solo adesso il numero SENZA prefisso (338…, 02…): un numero nudo non
  //    dichiara nessun paese, è un'assunzione sull'archivio — e infatti
  //    `07534 356375` è un mobile inglese che sembra un fisso italiano. Vale
  //    quindi meno di email e paese, e si usa quando non resta altro.
  if (t && /^(0|3)/.test(t)) return { lingua: 'it', da: 'telefono' }

  // 6. Nessun segnale utilizzabile. Qui la scelta non è fra "giusto" e
  //    "sbagliato" ma fra due scommesse, e si guarda cosa dicono i dati:
  //    - se c'è un INDIZIO DI ESTERO che non sappiamo tradurre (un prefisso +…
  //      fuori tabella come +971 o +41, un paese fuori tabella come LV, un
  //      numero che non ha forma italiana) → **inglese**: sappiamo che non è
  //      italiano, anche se non sappiamo cos'è;
  //    - se non c'è NIENTE (nessun telefono, nessuna email, nessun paese) →
  //      **italiano**, perché in questo archivio 3 ordini su 4 spediscono in
  //      Italia. Rispondere inglese a un cliente italiano solo perché ci manca
  //      il suo numero sarebbe scommettere contro i nostri stessi dati.
  const indizioEstero = (!!t && !/^(0|3)/.test(t)) || !!p
  if (indizioEstero) return { lingua: 'en', da: 'estero-ignoto' }
  return { lingua: 'it', da: 'nessun-segnale' }
}

// ── I testi ─────────────────────────────────────────────────────────────────
//
// Solo l'apertura del messaggio: dice chi siamo e di quale ordine parliamo.
// Il resto lo scrive la persona, che il messaggio lo rilegge prima di inviarlo.

type Testi = { saluto: (nome: string) => string; oggetto: (numero: string) => string; corpo: (numero: string) => string }

const TESTI: Record<ChiaveLingua, Testi> = {
  it: {
    saluto: (n) => (n ? `Buongiorno ${n}` : 'Buongiorno'),
    oggetto: (num) => `Ordine ${num}`,
    corpo: (num) => `le scriviamo riguardo al suo ordine ${num}.`,
  },
  en: {
    saluto: (n) => (n ? `Hello ${n}` : 'Hello'),
    oggetto: (num) => `Order ${num}`,
    corpo: (num) => `we are writing about your order ${num}.`,
  },
  fr: {
    saluto: (n) => (n ? `Bonjour ${n}` : 'Bonjour'),
    oggetto: (num) => `Commande ${num}`,
    corpo: (num) => `nous vous écrivons au sujet de votre commande ${num}.`,
  },
  es: {
    saluto: (n) => (n ? `Buenos días ${n}` : 'Buenos días'),
    oggetto: (num) => `Pedido ${num}`,
    corpo: (num) => `le escribimos en relación con su pedido ${num}.`,
  },
  de: {
    saluto: (n) => (n ? `Guten Tag ${n}` : 'Guten Tag'),
    oggetto: (num) => `Bestellung ${num}`,
    corpo: (num) => `wir schreiben Ihnen bezüglich Ihrer Bestellung ${num}.`,
  },
}

/** Solo il nome di battesimo: «Buongiorno Mario», non «Buongiorno Mario Rossi». */
function primoNome(clienteNome: string): string {
  return (clienteNome || '').trim().split(/\s+/)[0] ?? ''
}

/** L'apertura del messaggio al cliente, nella sua lingua. */
export function messaggioCliente(
  lingua: ChiaveLingua,
  clienteNome: string,
  numeroOrdine: string
): string {
  const t = TESTI[lingua] ?? TESTI.en
  return `${t.saluto(primoNome(clienteNome))}, ${t.corpo(numeroOrdine)}`
}

/** L'oggetto della mail, nella lingua del cliente. */
export function oggettoCliente(lingua: ChiaveLingua, numeroOrdine: string): string {
  return (TESTI[lingua] ?? TESTI.en).oggetto(numeroOrdine)
}
