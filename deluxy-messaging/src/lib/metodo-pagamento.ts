// COME paghiamo un fornitore. Non sempre con un bonifico.
//
// ⚠️⚠️ Finché l'unica forma prevista era l'IBAN, tutto il resto **non si
// registrava affatto**: chi manda un link di pagamento, chi dà un indirizzo
// PayPal, chi si accorda a voce. Quelle spese restavano in una chat, e
// sull'ordine risultava che non avevamo pagato nessuno.
//
// ⚠️ Questo file NON importa `db`: lo usa la pagina Pagamenti, che è un
// componente client.

export type Metodo = 'iban' | 'link' | 'paypal' | 'carta' | 'altro'

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
    // ⚠️⚠️ CARTA DA REMOTO = la NOSTRA carta, data al fornitore per telefono o
    // digitata sul suo sito. Chiesto dall'utente il 27/08/2026, e finché non
    // c'era finiva in «Altro (scritto)»: cioè una spesa fatta con la carta
    // aziendale che, negli elenchi e nei conti, non si distingueva da un
    // accordo a voce. È l'unico metodo in cui il denaro esce **subito** — non
    // c'è un bonifico da fare dopo — e la riga serve a ricordare **che è già
    // stato pagato** e con quale carta.
    //
    // ⚠️ Qui NON si scrive il numero della carta: vedi `numeroDiCartaNelTesto`.
    chiave: 'carta',
    nome: 'Carta da remoto',
    aiuto:
      'La nostra carta data al telefono o sul suo sito. Scrivi dove e con quale carta (le ultime 4 cifre) — mai il numero intero.',
    segnaposto: 'al telefono, carta ••4321',
  },
  {
    chiave: 'altro',
    nome: 'Altro (scritto)',
    aiuto: 'Contanti alla consegna, compensazione, quello che è: scrivilo com’è.',
    segnaposto: 'contanti alla consegna, concordato al telefono',
  },
]

/**
 * ⚠️⚠️ IL NUMERO DELLA CARTA NON SI SCRIVE QUI.
 *
 * Nasce con «Carta da remoto», ma vale per **tutti** i metodi, perché il campo
 * è lo stesso campo di testo libero. Tre motivi, tutti veri in questa app:
 *
 * 1. `riferimentoPagamento` sta **in chiaro** in un Postgres condiviso con
 *    altre tredici app (nessuna cifratura: non è fra le `CHIAVI_CIFRATE`).
 * 2. Finisce **dentro l'avviso** che parte su WhatsApp/Telegram a chi deve
 *    pagare (`avviso-pagamento-da-fare.ts`): un PAN in una chat ci resta.
 * 3. Tenere un numero di carta per esteso è esattamente ciò che il PCI-DSS
 *    vieta a chi non è attrezzato per custodirlo.
 *
 * ⚠️ Si riconosce per la **forma del valore**, non per il nome del campo
 * ([[trappola-mascheratura-per-nome]]): 13-19 cifre, anche spezzate da spazi o
 * trattini, **e valide col controllo di Luhn**. Luhn serve a non bloccare i
 * numeri lunghi che carte non sono (un IBAN incollato, un codice d'ordine di
 * quindici cifre): sbagliare in quel verso fermerebbe il lavoro.
 *
 * ⚠️ Le **ultime quattro cifre** restano libere, ed è quello che si chiede di
 * scrivere: identificano la carta senza essere la carta.
 *
 * @returns la parte riconosciuta (per poterla nominare nel messaggio), o ''.
 */
export function numeroDiCartaNelTesto(testo: string): string {
  const t = testo ?? ''
  // Gruppi di cifre separati da spazi o trattini: «4111 1111 1111 1111».
  const candidati = t.match(/\d[\d \-]{11,26}\d/g) ?? []
  for (const c of candidati) {
    const cifre = c.replace(/\D/g, '')
    if (cifre.length < 13 || cifre.length > 19) continue
    if (!luhn(cifre)) continue
    return c.trim()
  }
  return ''
}

function luhn(cifre: string): boolean {
  let somma = 0
  let doppia = false
  for (let i = cifre.length - 1; i >= 0; i--) {
    let n = cifre.charCodeAt(i) - 48
    if (doppia) {
      n *= 2
      if (n > 9) n -= 9
    }
    somma += n
    doppia = !doppia
  }
  return somma % 10 === 0
}

export function nomeMetodo(m: string): string {
  return METODI.find((x) => x.chiave === m)?.nome ?? m
}

export function metodoValido(m: string): m is Metodo {
  return METODI.some((x) => x.chiave === m)
}

/**
 * ⚠️⚠️ IL NUMERO D'ORDINE SCRITTO NELLA CAUSALE, quando l'ordine non è collegato.
 *
 * È il caso vero da cui nasce questa funzione: una riga con causale
 * «Ordine #2791» e `ordineNumero` **vuoto**. Chi l'ha scritta era convinta di
 * aver collegato l'ordine — il numero era lì, davanti — ma scrivere un numero in
 * un campo di testo non collega niente: niente valore, niente margine, e
 * l'ordine non sa chi lo prepara.
 *
 * ⚠️ Almeno tre cifre: sotto quella soglia si aggancerebbe a un «x2» o a una
 * data scritta nella causale, e bloccherebbe salvataggi legittimi.
 *
 * ⚠️⚠️ MA TRE CIFRE NON BASTAVANO. La regola larga (`/#?\s?(\d{3,})/`, senza
 * confini e senza tetto) leggeva un numero d'ordine dentro qualunque anno o
 * fattura, e **bloccava il salvataggio** chiedendo di collegare un ordine che
 * non esiste. Provato:
 *
 *   «Canone agosto 2026»  → #2026 → «la causale parla dell'ordine #2026…»
 *   «Fattura 2026/114»    → #2026
 *   IBAN incollato        → #0542811101000000123456
 *
 * Cioè il canone e il rimborso spese — i due casi che il commento qui sopra
 * dice di voler lasciare liberi — non si salvavano.
 *
 * Adesso: **da 3 a 6 cifre** (i numeri d'ordine veri vanno da #1741 a #12819),
 * **staccate** (`\b`) e **non attaccate a una barra o a un altro numero**, così
 * «2026/114» e le date in cifre restano quello che sono. E un anno da solo si
 * riconosce e si scarta: 2026 è un numero d'ordine possibile, ma «agosto 2026»
 * no. Il numero preceduto dal **cancelletto** vince sempre: quello è scritto
 * apposta.
 */
export function ordineNominatoNellaCausale(causale: string): string {
  const testo = (causale ?? '').trim()
  if (!testo) return ''
  // 1. Col cancelletto non c'è dubbio: è un ordine.
  const conCanc = testo.match(/#\s?(\d{3,6})\b/)
  if (conCanc) return `#${conCanc[1]}`
  // 2. Senza cancelletto: numero staccato, 3-6 cifre, non dentro una data o una
  //    frazione (né «/» né «-» né «.» attaccati) e non preceduto da una parola
  //    che lo qualifica come altro (mese, anno, fattura…).
  const senza = testo.match(/(^|[^\w/.-])(\d{3,6})(?![\w/.-])/)
  if (!senza) return ''
  const numero = senza[2]
  // ⚠️ «agosto 2026», «anno 2026», «fattura 114»: la parola prima dice che quel
  // numero non è un ordine. Senza questo, ogni causale con un anno si bloccava.
  const prima = testo.slice(0, senza.index ?? 0).trim().toLowerCase()
  const ultima = prima.split(/[^a-zà-ù]+/).filter(Boolean).pop() ?? ''
  const NON_ORDINE = new Set([
    'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
    'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
    'anno', 'fattura', 'fatture', 'ft', 'canone', 'mese', 'del', 'nel', 'iban',
  ])
  if (NON_ORDINE.has(ultima)) return ''
  // ⚠️⚠️ UN ANNO DA SOLO NON È UN ORDINE. «Rimborso spese carburante 2026» non
  // ha davanti una parola che lo qualifichi, ma 2026 lì è un anno. Quattro cifre
  // fra 2020 e 2035, senza cancelletto e senza «ordine» davanti: si lascia stare.
  //
  // ⚠️ Sì, così si perde un ordine che si chiamasse davvero #2026 e fosse
  // scritto senza cancelletto e senza la parola «ordine». **È lo sbaglio giusto
  // da fare**: sbagliare in questo verso fa perdere un AVVISO, sbagliare
  // nell'altro **blocca il salvataggio** e manda a cercare un ordine che non
  // esiste. Il primo lo si scopre lavorando, il secondo ferma il lavoro.
  const anno = Number(numero)
  const parlaDiOrdini = /(^|[^a-z])ordin[ei]?([^a-z]|$)/i.test(prima)
  if (numero.length === 4 && anno >= 2020 && anno <= 2035 && !parlaDiOrdini) return ''
  return `#${numero}`
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
  /** La causale e l'ordine collegato: servono alla regola qui sotto. */
  causale?: string
  ordineNumero?: string
  /**
   * Il nome che è stato SCELTO dalla ricerca (o dichiarato nuovo apposta).
   * Vuoto = digitato a mano e mai confermato.
   */
  intestatarioScelto?: string
}): string {
  if (!d.intestatario.trim()) return 'Serve almeno il nome di chi va pagato.'

  // ⚠️⚠️ IL FORNITORE VA SCELTO, NON SCRITTO.
  //
  // Segnalato dall'utente guardando la sua schermata: nel campo c'era scritto
  // **«p»**. Un campo di testo obbligatorio si soddisfa con una lettera, e da lì
  // in poi tutto funziona — la richiesta si salva, il fornitore «p» finisce
  // sull'ordine, e il bonifico parte verso un nome che non è un nome.
  //
  // ⚠️ NON si vietano i nomi corti: sarebbe una regola sull'aspetto, e ci sono
  // insegne di due lettere. Si chiede da DOVE viene il nome — dalla ricerca
  // (nostri, registro, Google Maps) oppure dichiarato nuovo apposta.
  //
  // ⚠️ E la strada per chi è nuovo resta aperta: la maggior parte dei fornitori
  // la prima volta non li conosciamo, e un modulo che non lascia pagare un
  // fioraio nuovo non lo usa nessuno — si torna a fare i bonifici fuori
  // dall'app, che è il problema da cui si è partiti.
  //
  // ⚠️ Il controllo vive QUI e non nella rotta: «da dove viene il nome» è un
  // fatto della schermata, e il server non può saperlo. Chiude lo sbaglio di chi
  // compila, non è un cancello contro chi chiama l'API a mano.
  if (d.intestatarioScelto !== undefined && !d.intestatarioScelto.trim()) {
    return `«${d.intestatario.trim()}» l’hai scritto a mano: cercalo qui sopra e toccalo, oppure premi «è un fornitore nuovo».`
  }

  // ⚠️⚠️ UN PAGAMENTO CHE PARLA DI UN ORDINE DEVE AVERE QUELL'ORDINE COLLEGATO.
  //
  // Chiesto esplicitamente dall'utente il 25/08/2026 («rendi obbligatorio»), e
  // il motivo è tutta la catena che ne dipende: con l'ordine collegato,
  // l'intestatario diventa da solo il fornitore di quell'ordine, il costo va a
  // Deluxy Orders e il margine si calcola. Senza, il pagamento resta un fatto
  // isolato — e su una riga vera è già successo: causale «Ordine #2791»,
  // nessun ordine collegato, e l'ordine che non sapeva chi lo preparava.
  //
  // ⚠️ Si blocca solo quando la causale NOMINA un ordine: un pagamento che con
  // gli ordini non c'entra (un canone, un rimborso spese) resta libero. La
  // regola non è «serve sempre un ordine», è «se ne parli, collegalo».
  if (!(d.ordineNumero ?? '').trim()) {
    const nominato = ordineNominatoNellaCausale(d.causale ?? '')
    if (nominato) {
      return `La causale parla dell’ordine ${nominato} ma l’ordine non è collegato: scegli ${nominato} nel campo «Ordine». Serve a registrare chi lo prepara e a calcolare il margine.`
    }
  }
  if (d.metodo === 'iban' && !d.iban.trim()) return 'Serve l’IBAN.'
  if (d.metodo !== 'iban' && !d.riferimento.trim()) {
    return d.metodo === 'link'
      ? 'Serve il link di pagamento.'
      : d.metodo === 'paypal'
        ? 'Serve l’indirizzo PayPal.'
        : d.metodo === 'carta'
          ? 'Scrivi dove è stata data la carta e quale carta (le ultime 4 cifre).'
          : 'Scrivi come è stato concordato il pagamento.'
  }
  // ⚠️⚠️ Vale per TUTTI i metodi, non solo per la carta: il campo è di testo
  // libero e finisce in chiaro nel database e dentro l'avviso su WhatsApp.
  const carta = numeroDiCartaNelTesto(d.riferimento)
  if (carta) {
    return `«${carta}» sembra il numero di una carta: qui non va scritto (resta in chiaro nel database e nell’avviso su WhatsApp). Scrivi solo le ultime quattro cifre.`
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

/**
 * Il tetto della FOTO letta dall AI, misurato sul data URI (base64, che pesa
 * circa un terzo in piu del file). Stesso file da 1,5 MB della ricevuta.
 */
export const TETTO_FONTE = 2_100_000

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
export function nomeFileRicevuta(
  nome: string,
  causale: string,
  tipo: string,
  /** L'ordine e chi è stato pagato: servono quando il nome non distingue. */
  chi: { ordineNumero?: string; intestatario?: string } = {}
): string {
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
  // ⚠️⚠️ UN NOME CHE NON DISTINGUE NON È UN NOME. Le ricevute incollate con
  // Ctrl+V le battezzavo `incollata-2026-08-24.png`: con la data e basta, tutte
  // quelle di uno stesso giorno hanno lo STESSO nome — misurato sulle tre vere,
  // erano identiche tutte e tre. Scaricandole finiscono nella cartella dei
  // download come «(1)» e «(2)», e la prova di quale bonifico sia si perde
  // proprio nel momento in cui serve tirarla fuori.
  //
  // ⚠️ Quindi un nome generato da noi NON si tiene: si ricostruisce da ordine e
  // intestatario, che sono le due cose per cui quella ricevuta si va a cercare.
  const generato = /^incollata-\d{4}-\d{2}-\d{2}\.[a-z0-9]+$/i.test(pulito)
  if (pulito && !generato && /\.[a-z0-9]{2,4}$/i.test(pulito)) return pulito

  const pezzi = [
    'ricevuta',
    (chi.ordineNumero || '').replace('#', ''),
    (chi.intestatario || '').slice(0, 40),
  ]
    .map((p) =>
      p
        .replace(/[^\w -]/g, '')
        .trim()
        .replace(/\s+/g, '-')
    )
    .filter(Boolean)
  // Senza ordine né intestatario resta la causale: meglio di «ricevuta» secco.
  if (pezzi.length === 1) {
    const daCausale = (causale || '')
      .replace(/[^\w -]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60)
    if (daCausale) pezzi.push(daCausale)
  }
  return `${pezzi.join('-').slice(0, 90)}.${estensione}`
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
/**
 * ⚠️⚠️ QUESTA ASSENZA È NORMALE, e non va segnalata.
 *
 * Una richiesta di pagamento ha un IBAN, **non un telefono**: i recapiti del
 * fornitore stanno sull'ordine, e spesso non ci sono. Quindi «non l'ho
 * avvisato» qui non è un guasto — è la condizione normale di quasi ogni riga.
 *
 * Segnalato dall'utente guardando la sua tabella: quattro righe su quattro con
 * un bollino rosso «non avvisato». Un avviso rosso che compare sempre non
 * avverte di niente: insegna a non guardare i bollini rossi, e il giorno che ne
 * compare uno vero non lo vede nessuno.
 *
 * ⚠️ Resta invece segnalato il RIFIUTO vero: il recapito c'era, il messaggio è
 * partito e qualcuno l'ha respinto (la finestra di 24 ore di WhatsApp, una
 * casella che non accetta). Lì il fornitore crede di non essere stato pagato, e
 * tacerlo sarebbe la bugia che il bollino esisteva per impedire.
 */
export function assenzaNormale(esito: string): boolean {
  const e = (esito || '').toLowerCase()
  if (!e) return true
  return (
    e.includes('non è collegata a un ordine') ||
    e.includes('non e collegata a un ordine') ||
    e.includes('né telefono né email') ||
    e.includes('ne telefono ne email')
  )
}

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
