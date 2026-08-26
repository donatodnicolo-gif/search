// RIMETTERE INSIEME QUELLO CHE SAPPIAMO GIÀ.
//
// ⚠️⚠️ Il fatto da cui nasce questo file, misurato il 24/08/2026: **8 pagamenti
// fatti, ognuno con nome, IBAN, importo e ordine collegato — e ZERO di quegli
// ordini sa chi l'ha preparato.** Su 1.341 ordini nello specchio, `fornitoreNome`
// era vuoto 1.341 volte. Il dato non mancava: era a una tabella di distanza, e
// nessuno lo aveva mai portato dall'altra parte.
//
// Le conseguenze non erano teoriche. Senza fornitore sull'ordine: il costo non
// arriva a Orders, quindi il margine di quegli 8 ordini risultava «non
// calcolabile» pur essendo calcolabilissimo (41% su sei di loro); alla domanda
// «quanto lavoro diamo a questo fornitore» non si poteva rispondere; e davanti a
// un reclamo non si sapeva a chi telefonare.
//
// ⚠️ Questo file NON importa `db`: lo usa anche la pagina, che è un componente
// client.

import { chiaveNome } from './cerca-fornitore'
import { calcolaMargine, type EsitoMargine } from './margine'

/** Un pagamento già fatto, con l'ordine a cui è collegato. */
export type DaRiconciliare = {
  richiestaId: string
  intestatario: string
  iban: string
  importo: number
  metodo: string
  pagataIl: string | null
  /** L'ordine collegato, se c'è e se lo abbiamo nello specchio. */
  ordine: {
    id: string
    numero: string
    negozioNome: string
    clienteNome: string
    totale: number
    valuta: string
    gestione: string
    annullato: boolean
    fornitoreNome: string
    fornitoreCosto: number | null
  } | null
  /** Come lo conosce il registro Anagrafiche, se lo conosce. */
  registro: { id: string; nome: string; citta: string; telefono: string; email: string } | null
}

/**
 * Che cosa si può fare di questa riga. Uno solo, e il primo che si applica:
 * l'ordine dei controlli è l'ordine della gravità.
 */
export type Verdetto =
  | 'rimborso-al-cliente'
  | 'ordine-annullato'
  | 'senza-ordine'
  | 'ordine-non-nostro'
  | 'gia-registrato'
  | 'costo-diverso'
  | 'da-registrare'

export type Riga = DaRiconciliare & {
  verdetto: Verdetto
  /** Il margine che risulterebbe registrando questo costo su questo ordine. */
  margine: EsitoMargine | null
  /** Che cosa succede premendo il bottone, in una riga. */
  frase: string
  /** Se lo stato di lavorazione contraddice il pagamento. */
  statoDaAllineare: boolean
}

/**
 * ⚠️⚠️ IL CONTROLLO PIÙ IMPORTANTE DI QUESTO FILE.
 *
 * Non tutti i soldi che escono vanno a un fornitore: un rimborso esce allo
 * stesso modo, dalla stessa pagina, e finisce nella stessa tabella. Registrarlo
 * come «costo di fornitura» farebbe due danni insieme — direbbe che il cliente
 * si è preparato l'ordine da solo, e sottrarrebbe quella cifra dal margine, che
 * diventerebbe falso in modo silenzioso e permanente.
 *
 * ⚠️ Il confronto è sui NOMI, quindi può sbagliare: per questo un sospetto di
 * rimborso non propone niente e chiede a una persona, invece di decidere.
 */
export function sembraIlCliente(intestatario: string, clienteNome: string): boolean {
  const a = chiaveNome(intestatario)
  const b = chiaveNome(clienteNome)
  if (!a || !b) return false
  if (a === b) return true
  const pagato = a.split(' ').filter((x) => x.length >= 3)
  const cliente = b.split(' ').filter((x) => x.length >= 3)
  // ⚠️⚠️ TUTTE le parole del cliente, non una. Con «basta una parola» —
  // la regola che usa la RICERCA, dove serve — un pagamento a «Fioreria Rossi
  // srl» su un ordine di «Marta Rossi» diventava un «sospetto rimborso», e la
  // riga non si registrava più. Una riconciliazione che rifiuta anche il lavoro
  // buono non la usa nessuno, e si torna a non avere nessun fornitore sugli
  // ordini: il problema da cui si è partiti.
  //
  // ⚠️ E servono almeno DUE parole: un solo «Marta» in comune non identifica
  // nessuno. Il caso «nome e cognome invertiti» resta coperto, perché qui
  // l'ordine non conta.
  if (cliente.length < 2 || pagato.length < 2) return false
  return cliente.every((x) => pagato.includes(x))
}

// ── RICONOSCERE UN NOME NEL REGISTRO ──
//
// ⚠️⚠️ Cercare e AFFERMARE non sono la stessa cosa, e usare la stessa regola per
// tutte e due dice il falso. In una casella di ricerca «basta una parola» è
// giusto: propone, e sceglie una persona. Qui invece la schermata scrive «Nel
// registro: X» come un fatto — e con quella regola, misurato il 24/08 sui
// pagamenti veri, usciva questo:
//
//   Battistella fioreria srl  →  BEYOND 142 SRL     (combaciava «SRL»)
//   Goshà flowers             →  ANTOFLOWERS …      (combaciava «flowers»)
//
// Chi legge crederebbe che quel fornitore lo conosciamo già, e aprirebbe la
// scheda sbagliata. Peggio: crederebbe di NON dover creare l'anagrafica.

/**
 * Le parole che non identificano nessuno: forme societarie e mestieri.
 * ⚠️ Sono proprio quelle che quasi tutti i nomi di questo elenco hanno in
 * comune, quindi sono quelle che producono le corrispondenze false.
 */
const PAROLE_COMUNI = new Set([
  'srl', 'srls', 'sas', 'snc', 'spa', 'sapa', 'ditta', 'societa', 'soc',
  'individuale', 'impresa', 'group', 'italia', 'italy',
  'fiori', 'fiore', 'fioreria', 'fiorista', 'fioraio', 'floreale', 'floral',
  'flower', 'flowers', 'fleur', 'fleurs', 'fleures', 'blumen',
  'pasticceria', 'pasticceri', 'cake', 'cakes', 'bakery', 'shop', 'store',
  'boutique', 'atelier', 'casa', 'della', 'delle', 'dello', 'dei', 'degli',
])

/** Le parole di un nome che valgono davvero a identificarlo. */
export function paroleDistintive(nome: string): string[] {
  return chiaveNome(nome)
    .split(' ')
    .filter((p) => p.length >= 3 && !PAROLE_COMUNI.has(p))
}

/**
 * È la stessa insegna, sì o no. ⚠️ Severa apposta: qui un «forse» viene letto
 * come un «sì», e un falso «lo conosciamo già» costa più di un «non lo trovo».
 */
export function stessaIdentita(intestatario: string, nomeRegistro: string): boolean {
  const a = chiaveNome(intestatario)
  const b = chiaveNome(nomeRegistro)
  if (!a || !b) return false
  if (a === b) return true
  const mie = paroleDistintive(intestatario)
  // ⚠️ Un nome fatto SOLO di parole comuni («SO'FLEUR», «Fiori srl») non si può
  // riconoscere a parole: resta un confronto per intero, che è severo ma vero.
  // Abbinarlo su «fleur» vorrebbe dire agganciare ogni fioraio del registro.
  if (!mie.length) return b.includes(a) || a.includes(b)
  const sue = new Set(paroleDistintive(nomeRegistro))
  if (!sue.size) return false
  const combacianti = mie.filter((p) => sue.has(p)).length
  if (mie.length >= 2) return combacianti >= 2
  // ⚠️ Con UNA parola distintiva sola («Goshà flowers» → «gosha») non basta
  // trovarla dall'altra parte: «Rossi» aggancerebbe «Rossi Giovanni Fioreria» e
  // ogni altro Rossi del registro. Deve essere l'unica cosa che identifica anche
  // l'altro nome — cioè i due nomi devono ridursi alla stessa parola.
  //
  // ⚠️ Così qualche abbinamento vero si perde («Gosha» contro «Gosha di Giulia
  // Bianchi»). È lo sbaglio giusto da fare: «non trovato» manda a controllare,
  // un nome sbagliato scritto come fatto no.
  return combacianti === 1 && sue.size === 1
}

/**
 * Gli stati di lavorazione che un pagamento già fatto rende impossibili.
 *
 * ⚠️ Un ordine PAGATO che risulta ancora «da iniziare» non è un dettaglio
 * estetico: è la bacheca che dice a un collega di mettersi al lavoro su una cosa
 * già chiusa, e a fine giornata è il conteggio degli arretrati a essere sbagliato.
 */
export const STATI_IMPOSSIBILI_SE_PAGATO = ['da_gestire', 'ricerca_fornitore', 'comunicazione']

/**
 * Gli stati da cui un ordine ESCE DA SOLO quando il fornitore risulta pagato,
 * per finire in «attesa consegna».
 *
 * Chiesto dall'utente il 26/08/2026: «se è pagato in automatico metti in attesa
 * di consegna». Prima si spostavano solo quelli in `in_pagamento`, e bastava che
 * qualcuno avesse scritto al cliente — l'app scrive `comunicazione` da sé quando
 * si preme WhatsApp, Email o Chiama — perché il pagamento non spostasse più
 * niente: l'ordine #2799, pagato il 25/08, era ancora «Comunicazione con
 * cliente» il giorno dopo.
 *
 * ⚠️ `attesa_consegna` non c'è perché è la destinazione. `gestito` non c'è
 * perché è la FINE: riaprirlo vorrebbe dire rimettere in bacheca un ordine che
 * qualcuno aveva chiuso, e disfare con un automatismo la decisione di una
 * persona è il verso sbagliato.
 *
 * ⚠️⚠️ `in_app` non c'è, e non è una dimenticanza: quello stato non dice a che
 * punto siamo, dice CHI se ne sta occupando — la piattaforma consegne, che l'ha
 * proposto a un partner. Scriverci sopra «attesa consegna» toglierebbe dalla
 * bacheca l'unico segnale che dice «non cercare un fornitore a mano», e la
 * sincronizzazione lo rimetterebbe `in_app` al giro dopo: un'altalena che non
 * aggiunge niente.
 */
export const STATI_DA_SPOSTARE_SE_PAGATO = [...STATI_IMPOSSIBILI_SE_PAGATO, 'in_pagamento']

export function decidi(d: DaRiconciliare): Riga {
  const o = d.ordine
  const margine =
    o && !o.annullato && o.totale && d.importo ? calcolaMargine(o.totale, d.importo, null) : null

  const base = { ...d, margine, statoDaAllineare: false }

  if (!d.ordine) {
    return {
      ...base,
      verdetto: 'senza-ordine',
      frase:
        'Questo pagamento non è collegato a nessun ordine: collegalo dalla pagina Pagamenti e torna qui.',
    }
  }
  // ⚠️ Prima di tutto: è un rimborso? Vedi sopra — è l'errore che non si può
  // più correggere una volta fatto, perché nessuno lo vede.
  if (sembraIlCliente(d.intestatario, d.ordine.clienteNome)) {
    return {
      ...base,
      verdetto: 'rimborso-al-cliente',
      margine: null,
      frase: `«${d.intestatario}» è il nome del cliente di ${d.ordine.numero}: sembra un rimborso, non un fornitore. Non lo registro: sarebbe un costo di fornitura falso, e il margine diventerebbe sbagliato in silenzio.`,
    }
  }
  if (d.ordine.annullato) {
    return {
      ...base,
      verdetto: 'ordine-annullato',
      margine: null,
      frase: `${d.ordine.numero} è annullato: su un ordine annullato non si registra né fornitore né costo.`,
    }
  }
  // ⚠️ Gli stessi quattro stati che sposta l'automatismo: con i tre di
  // `STATI_IMPOSSIBILI_SE_PAGATO` il bottone non compariva nemmeno sugli ordini
  // fermi in `in_pagamento`, che sono il caso più frequente.
  const statoDaAllineare = STATI_DA_SPOSTARE_SE_PAGATO.includes(d.ordine.gestione)

  // ⚠️⚠️ `stessaIdentita` E NON `nomeCorrisponde`. Quella è la regola di una
  // CASELLA DI RICERCA — «basta una parola» — e qui non si cerca: si AFFERMA che
  // il pagamento fatto a quel nome riguarda il fornitore già scritto
  // sull'ordine, e da quell'affermazione parte una scrittura (`fornitoreCosto`)
  // che finisce dentro il margine e viaggia fino a Deluxy Orders.
  //
  // Misurato sui 21 fornitori veri di questa tabella: con la regola larga, **28
  // coppie su 420 (6,7%) di fornitori DIVERSI risultavano «lo stesso»** —
  // «S.A.S. ELENA FLEURS» con «RIGUTTO ELENA» (combaciava «elena»), «LA PEONIA
  // FIORI PIANTE» con «donna di fiori di Longo Michela» («fiori»), «Passiflora
  // flower market» con «Goshà flowers». E non serve che qualcuno guardi: questa
  // funzione parte **da sola** quando si preme «Pagata».
  //
  // ⚠️ La regola severa era già in questo file, con scritto sopra il motivo, ed
  // era usata per il registro Anagrafiche. Semplicemente non era stata applicata
  // qui. ([[trappola-cercare-non-e-affermare]])
  const stessoNome = !!d.ordine.fornitoreNome && stessaIdentita(d.intestatario, d.ordine.fornitoreNome)
  if (stessoNome) {
    // Già a posto sul nome: resta da guardare il costo.
    if (d.ordine.fornitoreCosto === null) {
      return {
        ...base,
        statoDaAllineare,
        verdetto: 'da-registrare',
        frase: `${d.ordine.numero} sa già che lo prepara ${d.ordine.fornitoreNome}, ma non quanto gli abbiamo dato: aggiungo ${euroBreve(d.importo)}.`,
      }
    }
    if (scostamento(d.ordine.fornitoreCosto, d.importo)) {
      return {
        ...base,
        statoDaAllineare,
        verdetto: 'costo-diverso',
        frase: `Su ${d.ordine.numero} risulta un costo di ${euroBreve(d.ordine.fornitoreCosto)}, ma il pagamento è di ${euroBreve(d.importo)}. Non decido io quale dei due è giusto.`,
      }
    }
    return {
      ...base,
      statoDaAllineare,
      verdetto: 'gia-registrato',
      frase: `${d.ordine.numero} è già a posto: ${d.ordine.fornitoreNome}, ${euroBreve(d.importo)}.`,
    }
  }
  // ⚠️ Un fornitore DIVERSO già registrato non si sovrascrive: vorrebbe dire
  // cancellare quello che qualcuno ha scritto guardando la chat, sulla base di
  // un nome scritto su un bonifico. Si chiede.
  if (d.ordine.fornitoreNome) {
    return {
      ...base,
      statoDaAllineare,
      verdetto: 'costo-diverso',
      frase: `Su ${d.ordine.numero} risulta che lo prepara ${d.ordine.fornitoreNome}, ma il pagamento è a ${d.intestatario}. Non lo sovrascrivo.`,
    }
  }
  return {
    ...base,
    statoDaAllineare,
    verdetto: 'da-registrare',
    frase: `Registro ${d.intestatario} come chi prepara ${d.ordine.numero}, con un costo di ${euroBreve(d.importo)}${
      margine && margine.verdetto !== 'senza-verdetto' ? ` — margine ${margine.marginePct.toFixed(0)}%` : ''
    }.`,
  }
}

/**
 * Due importi sono «diversi» solo se lo sono davvero.
 * ⚠️ Il confronto fra due float non si fa con `!==`: 80 e 80.00000000001 sono lo
 * stesso accordo, e segnalarli come discordanti insegna a ignorare l'avviso.
 */
export function scostamento(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.01
}

function euroBreve(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

/** Le righe su cui il bottone «registra» ha senso. */
export function daFare(righe: Riga[]): Riga[] {
  return righe.filter((r) => r.verdetto === 'da-registrare')
}

/** Quanto margine stiamo lasciando non calcolato. */
export function valoreSospeso(righe: Riga[]): { ordini: number; margine: number } {
  const f = daFare(righe)
  return {
    ordini: f.length,
    margine: f.reduce((s, r) => s + (r.margine ? r.margine.margineEuro : 0), 0),
  }
}
