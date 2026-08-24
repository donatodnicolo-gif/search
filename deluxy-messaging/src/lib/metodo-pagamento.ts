// COME paghiamo un fornitore. Non sempre con un bonifico.
//
// ⚠️⚠️ Finché l'unica forma prevista era l'IBAN, tutto il resto **non si
// registrava affatto**: chi manda un link di pagamento, chi dà un indirizzo
// PayPal, chi si accorda a voce. Quelle spese restavano in una chat, e
// sull'ordine risultava che non avevamo pagato nessuno.
//
// ⚠️ Questo file NON importa `db`: lo usa la pagina Pagamenti, che è un
// componente client.

export type Metodo = 'iban' | 'link' | 'paypal' | 'altro'

export const METODI: { chiave: Metodo; nome: string; aiuto: string; segnaposto: string }[] = [
  {
    chiave: 'iban',
    nome: 'Bonifico (IBAN)',
    aiuto: 'L’unico che si può verificare col codice di controllo.',
    segnaposto: 'IT60X0542811101000000123456',
  },
  {
    chiave: 'link',
    nome: 'Link di pagamento',
    aiuto: 'Il link che ci ha mandato: si incolla qui e resta scritto sull’ordine.',
    segnaposto: 'https://…',
  },
  {
    chiave: 'paypal',
    nome: 'PayPal',
    aiuto: 'L’indirizzo del conto PayPal, o il suo @nome.',
    segnaposto: 'nome@esempio.it',
  },
  {
    chiave: 'altro',
    nome: 'Altro (scritto)',
    aiuto: 'Contanti alla consegna, compensazione, quello che è: scrivilo com’è.',
    segnaposto: 'contanti alla consegna, concordato al telefono',
  },
]

export function nomeMetodo(m: string): string {
  return METODI.find((x) => x.chiave === m)?.nome ?? m
}

export function metodoValido(m: string): m is Metodo {
  return METODI.some((x) => x.chiave === m)
}

/**
 * Che cosa deve esserci perché la richiesta abbia senso.
 *
 * ⚠️ Non è la stessa cosa per tutti i metodi, e fingere che lo sia porta a
 * salvare righe vuote: un bonifico senza IBAN non è pagabile, un «altro» senza
 * la frase non dice niente a nessuno. L'unica cosa che serve **sempre** è a chi
 * stiamo dando i soldi.
 */
export function cosaManca(d: {
  metodo: string
  iban: string
  riferimento: string
  intestatario: string
}): string {
  if (!d.intestatario.trim()) return 'Serve almeno il nome di chi va pagato.'
  if (d.metodo === 'iban' && !d.iban.trim()) return 'Serve l’IBAN.'
  if (d.metodo !== 'iban' && !d.riferimento.trim()) {
    return d.metodo === 'link'
      ? 'Serve il link di pagamento.'
      : d.metodo === 'paypal'
        ? 'Serve l’indirizzo PayPal.'
        : 'Scrivi come è stato concordato il pagamento.'
  }
  return ''
}

/**
 * Un link si vede se è un link. ⚠️ Solo `http`/`https`: un `javascript:` o un
 * `data:` incollati per sbaglio (o non per sbaglio) non devono diventare una
 * cosa cliccabile dentro l'app.
 */
export function linkSicuro(v: string): string {
  const t = (v ?? '').trim()
  if (!/^https?:\/\//i.test(t)) return ''
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : ''
  } catch {
    return ''
  }
}

// ── LA RICEVUTA ──

/**
 * ⚠️ Il tetto NON è una scelta di stile: il corpo di una funzione serverless
 * arriva a ~4,5 MB, e un file più grande non ci arriva nemmeno — muore prima
 * con un errore che non spiega niente. Meglio dirlo noi, e dirlo prima di far
 * aspettare il caricamento.
 */
export const TETTO_RICEVUTA = 1_500_000

/** Che cosa accettiamo come prova di un pagamento. */
export const TIPI_RICEVUTA = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]

/**
 * Come si chiama il file che si scarica.
 *
 * ⚠️⚠️ Il nome NON si passa così com'è nell'intestazione HTTP: viene da un file
 * scelto da qualcuno, e le virgolette o un a-capo dentro un
 * `Content-Disposition` spezzano l'intestazione — è il modo classico per farne
 * apparire un'altra. Si tiene solo quello che in un nome di file ha senso.
 *
 * ⚠️ E se il nome non c'è (una schermata incollata, un file senza nome) se ne
 * costruisce uno con la causale: «ricevuta.png» ripetuto venti volte nella
 * cartella dei download non si distingue più.
 */
export function nomeFileRicevuta(nome: string, causale: string, tipo: string): string {
  const estensione =
    tipo === 'application/pdf'
      ? 'pdf'
      : tipo.startsWith('image/')
        ? tipo.slice(6).replace('jpeg', 'jpg')
        : 'bin'
  const pulito = (nome || '')
    .replace(/[\\/]/g, ' ')
    .replace(/[^\w .()-]/g, '')
    .trim()
    .slice(0, 80)
  if (pulito && /\.[a-z0-9]{2,4}$/i.test(pulito)) return pulito
  const daCausale = (causale || 'ricevuta')
    .replace(/[^\w -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${pulito || daCausale || 'ricevuta'}.${estensione}`
}

export function ricevutaAccettabile(tipo: string, byte: number): string {
  if (!TIPI_RICEVUTA.includes(tipo)) {
    return 'Si può caricare un’immagine (PNG, JPG, WEBP, GIF) o un PDF.'
  }
  if (byte > TETTO_RICEVUTA) {
    return `Il file pesa ${(byte / 1_000_000).toFixed(1)} MB: il massimo è 1,5 MB. Ritaglia la schermata o riducila.`
  }
  return ''
}

// ── DA DOVE È USCITO IL DENARO ──
//
// ⚠️⚠️ Un bonifico NON parte per forza da un'app nostra. Quasi sempre esce dal
// portale della banca, a mano; a volte si paga in contanti alla consegna, o si
// scala da quello che quel fornitore ci deve. Dare per scontato che passi da
// Deluxy Transactions vuol dire costruire un registro che descrive un mondo che
// non esiste — e che quindi nessuno tiene aggiornato.
//
// ⚠️ È lo stesso fatto che nel resto dell'ecosistema si chiama
// `pagatoCon: "fuori_app"`: là serve a ricordare che la prova del pagamento non
// ce l'ha l'app. Qui la prova c'è — è la ricevuta — ma resta importante sapere
// da dove è uscito, perché è l'unica cosa che permette di ritrovarlo in banca.

export const USCITE: { chiave: string; nome: string }[] = [
  { chiave: 'banca', nome: 'Dal portale della banca' },
  { chiave: 'app', nome: 'Da Deluxy Transactions' },
  { chiave: 'contanti', nome: 'Contanti' },
  { chiave: 'compensazione', nome: 'Compensato con quello che ci deve' },
  { chiave: 'altro', nome: 'Altro' },
]

export function nomeUscita(v: string): string {
  // ⚠️ Vuoto = «non indicato», e si scrive così. Indovinare il canale di
  // un'uscita di denaro è la cosa che non si deve fare: fra sei mesi qualcuno
  // andrebbe a cercare quel bonifico dove non è mai passato.
  if (!v) return 'non indicato'
  return USCITE.find((u) => u.chiave === v)?.nome ?? v
}

/** Quanto pesa, scritto come si legge. */
export function pesoScritto(byte: number): string {
  if (byte < 1000) return `${byte} byte`
  if (byte < 1_000_000) return `${Math.round(byte / 1000)} KB`
  return `${(byte / 1_000_000).toFixed(1)} MB`
}

// ── AVVISARE CHI ABBIAMO PAGATO ──
//
// ⚠️⚠️ Il messaggio si PREPARA, non parte da solo. È la stessa regola che vale
// in tutta l'app per quello che esce verso una persona: un avviso mandato da un
// automatismo, su un pagamento, è una promessa fatta a nome nostro senza che
// nessuno l'abbia riletta — e se la riga era sbagliata l'abbiamo appena detto al
// fornitore.
//
// ⚠️ Non si scrive «il bonifico è arrivato»: non lo sappiamo. Quello che
// sappiamo è che è PARTITO, e la differenza sono due o tre giorni lavorativi in
// cui il fornitore non lo vedrebbe e ci richiamerebbe pensando a un errore.

/**
 * Perché l'avviso non è partito, in tre parole.
 *
 * ⚠️⚠️ «non avvisato» da solo non vuol dire niente: il motivo stava solo nel
 * titolo, che sul telefono non si può nemmeno leggere — non c'è il passaggio del
 * mouse. E i motivi sono cose diversissime fra loro: «non c'è nessun ordine
 * collegato» si risolve in dieci secondi, «sono passate 24 ore» vuol dire
 * telefonare. Un'etichetta che non distingue fra le due fa perdere tempo su
 * tutte e due.
 */
export function perchePersoAvviso(esito: string): string {
  const e = (esito || '').toLowerCase()
  if (!e) return ''
  if (e.includes('non è collegata a un ordine') || e.includes('non e collegata a un ordine')) {
    return 'nessun ordine collegato'
  }
  if (e.includes('né telefono né email') || e.includes('ne telefono ne email')) {
    return 'il fornitore non ha recapiti'
  }
  if (e.includes('131047') || e.includes('24 ore')) return 'fuori dalle 24 ore di WhatsApp'
  if (e.includes('casella di posta')) return 'nessuna casella di posta'
  // ⚠️ Se non lo riconosciamo si mostra l'inizio del messaggio vero, non un
  // generico «errore»: un motivo sconosciuto va comunque letto da qualcuno.
  return esito.slice(0, 60)
}

export function messaggioPagato(d: {
  chi: string
  importo: number
  ordine: string
  quando: Date
}): string {
  const soldi = d.importo
    ? d.importo.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
    : ''
  const righe = [
    `Buongiorno${d.chi ? ' ' + d.chi : ''},`,
    '',
    `abbiamo disposto il pagamento${soldi ? ' di ' + soldi : ''}${
      d.ordine ? ' per l’ordine ' + d.ordine : ''
    } in data ${d.quando.toLocaleDateString('it-IT')}.`,
    '',
    'Dovrebbe vederlo sul conto entro qualche giorno lavorativo. Se non arriva,',
    'ci scriva pure e controlliamo.',
    '',
    'Grazie,',
    'Deluxy',
  ]
  return righe.join('\n')
}
