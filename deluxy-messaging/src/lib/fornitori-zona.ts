// I fornitori del registro che stanno NELLA PROVINCIA DI CONSEGNA.
//
// A cosa serve: un ordine si può far preparare da un fornitore vicino a chi
// riceve, invece di spedire. Finora la domanda «chi c'è a Firenze che sa fare
// una millefoglie?» si faceva con Ricerca fornitori, che cerca su Google —
// utile per chi non conosciamo, ma i partner con cui lavoriamo già sono scritti
// nel registro Anagrafiche e non venivano mai proposti.
//
// ⚠️ Qui non si tiene NESSUNA copia: si chiede al registro ogni volta (regola
// di deluxy-anagrafiche). Un partner disattivato là sparisce subito anche di
// qui, e non si scrive a un'insegna che non lavora più con noi.

import { partnerAttivi, type EsitoPartner, type Partner } from './anagrafiche'
import { siglaProvincia } from './province'

/** Che mestiere serve per questo ordine. */
export type Mestiere = 'pasticceria' | 'fioraio'

/**
 * Le categorie del registro che valgono per ogni mestiere.
 *
 * ⚠️ Sono DUE e TRE parole diverse per la stessa cosa, contate nel registro:
 * i fiorai stanno sotto «FIORISTA» (11) *e* «FIORI» (5), le pasticcerie sotto
 * «PASTICCERIA» (9) e «CIOCCOLATERIA» (3). Guardando una sola parola si
 * perderebbe un terzo dei fornitori senza che la lista sembri incompleta.
 */
const CATEGORIE: Record<Mestiere, string[]> = {
  pasticceria: ['PASTICCERIA', 'CIOCCOLATERIA', 'PASTICCERIE', 'CAKE'],
  fioraio: ['FIORISTA', 'FIORI', 'FIORAIO', 'FIORISTI'],
}

/**
 * Il mestiere che serve, dedotto dal NEGOZIO dell'ordine.
 *
 * Cake Design vende torte, Flowers vende fiori: è il segnale più affidabile che
 * abbiamo, e non richiede di leggere il nome del prodotto. ⚠️ Se il negozio non
 * dice niente (Deluxy, che vende di tutto) si torna `null` e si mostrano
 * **entrambi** i mestieri: meglio una lista più lunga che una lista sbagliata.
 */
export function mestierePerNegozio(negozio: string): Mestiere | null {
  const n = (negozio || '').toUpperCase()
  if (n.includes('CAKE') || n.includes('PASTICC')) return 'pasticceria'
  if (n.includes('FLOWER') || n.includes('FIOR')) return 'fioraio'
  return null
}

/**
 * Le parole che, in un nome di prodotto, dicono senza ambiguità che mestiere
 * serve. ⚠️ Volutamente POCHE e specifiche: qui una parola di troppo non fa
 * rumore, fa **sparire** dall'elenco il fornitore giusto.
 */
const PAROLE: Record<Mestiere, string[]> = {
  pasticceria: [
    'torta', 'torte', 'cake', 'dolce', 'dolci', 'pasticc', 'cioccolat', 'praline',
    'macaron', 'cupcake', 'crostata', 'millefoglie', 'tiramis', 'panettone', 'colomba',
    'biscott', 'monoporzion', 'cheesecake', 'pastiera',
  ],
  fioraio: [
    'fior', 'bouquet', 'mazzo', 'rose', 'rosa', 'orchid', 'tulipan', 'girasol',
    'peon', 'peonie', 'composizione floreale', 'pianta', 'piante', 'centrotavola',
    'ortensi', 'gigli', 'lilium', 'anthurium',
  ],
}

/**
 * Che mestiere serve, dedotto dal NOME DEL PRODOTTO.
 *
 * ⚠️⚠️ Serve quando il negozio non lo dice: «Deluxy» vende di tutto, e su quegli
 * ordini l'elenco mostrava **pasticcerie e fiorai insieme** — cioè per metà
 * gente che quell'ordine non lo può fare. Chi telefona se ne accorge alla terza
 * chiamata sbagliata.
 *
 * ⚠️ Se il testo cita **tutte e due** le cose (una torta CON un bouquet, che da
 * noi capita) si torna `null`: si mostrano tutti. Sceglierne uno vorrebbe dire
 * nascondere metà dei fornitori di un ordine che ne vuole due.
 *
 * ⚠️ E se non riconosce niente, `null`: meglio una lista più lunga che una lista
 * sbagliata. È la stessa regola dei punteggi senza dati — una variabile che non
 * si sa non vale zero, si esclude.
 */
export function mestierePerProdotto(testo: string): Mestiere | null {
  const t = (testo || '').toLowerCase()
  if (!t.trim()) return null
  const dolci = PAROLE.pasticceria.some((p) => t.includes(p))
  const fiori = PAROLE.fioraio.some((p) => t.includes(p))
  if (dolci && fiori) return null
  if (dolci) return 'pasticceria'
  if (fiori) return 'fioraio'
  return null
}

/**
 * Le parole che, nel NOME DI UN FORNITORE, dicono che mestiere fa.
 *
 * ⚠️ Sono diverse da quelle del prodotto, e non è una svista: un prodotto si
 * chiama «bouquet di rose», un fornitore si chiama «SO'FLEUR», «Malus Flowers
 * Crete», «JAN MORODER FLEURES», «Blumen Kocher». Le parole italiane da sole
 * riconoscerebbero metà dei nostri, che lavorano in mezza Europa.
 *
 * ⚠️ «rose» NON c'è: «ROSE CAKE DI ZORZ ALESSANDRO» è una pasticceria, e una
 * parola di troppo qui non fa rumore — nasconde il fornitore giusto.
 */
const PAROLE_NOME: Record<Mestiere, string[]> = {
  pasticceria: [
    'pasticc', 'cake', 'dolc', 'cioccolat', 'gelat', 'torte', 'torta', 'pastry',
    'patisser', 'konditor', 'bakery', 'panific', 'forno', 'praline', 'macaron',
  ],
  fioraio: [
    'fior', 'fleur', 'flower', 'blumen', 'floreal', 'floral', 'petali', 'orchid',
    'bouquet', 'garden', 'piante', 'peonia', 'giardin', 'vivaio',
  ],
}

/**
 * Che mestiere fa un fornitore NOSTRO, cioè uno che risulta dai nostri ordini.
 *
 * ⚠️⚠️ Serve perché di questi fornitori il registro non sa niente: quasi tutti
 * sono entrati pagandoli, senza città e senza categoria (misurato il
 * 29/08/2026: **0 su 47** ha un id del registro). Senza mestiere, su un ordine
 * di cioccolatini comparivano quattro fiorai — segnalato dall'utente.
 *
 * Due segnali, in quest'ordine:
 *  1. il suo NOME, che parla di lui;
 *  2. il NEGOZIO degli ordini che ha preparato (Cake → pasticceria,
 *     Flowers → fioraio), quando il nome non dice niente.
 *
 * ⚠️ Il nome viene PRIMA del negozio, e non è pignoleria: «Bianchi Fiorista
 * Como» ha preparato un ordine del negozio Cake. Il negozio dice che ordine
 * era, il nome dice che mestiere fa — e la domanda qui è la seconda.
 *
 * ⚠️ Se i due segnali dicono cose diverse *dentro lo stesso segnale* (un nome
 * che cita fiori e torte, due negozi opposti) si torna `null`: non si sa. E
 * chi non si sa **non si scarta** — si mostra, come i punteggi senza dati.
 */
export function mestierePerFornitore(nome: string, negozi: string[] = []): Mestiere | null {
  const n = (nome || '').toLowerCase()
  if (n.trim()) {
    const dolci = PAROLE_NOME.pasticceria.some((p) => n.includes(p))
    const fiori = PAROLE_NOME.fioraio.some((p) => n.includes(p))
    if (dolci && !fiori) return 'pasticceria'
    if (fiori && !dolci) return 'fioraio'
    // Tutti e due, o nessuno dei due: decide il negozio (sotto).
  }
  const daiNegozi = new Set(negozi.map((x) => mestierePerNegozio(x)).filter(Boolean) as Mestiere[])
  return daiNegozi.size === 1 ? [...daiNegozi][0] : null
}

/**
 * Gli stati che NON si propongono mai.
 *
 * ⚠️ Tutti gli altri sì, prospect compresi — ed è la correzione di un errore
 * vero: su un ordine a Borgomanero l'app diceva «nessun fornitore in provincia
 * di NO» mentre in Anagrafiche c'era una pasticceria ad Arona (NOVARA),
 * censita come *prospect*. Chi cerca qualcuno da chiamare per l'ordine di
 * domani non cerca un partner con contratto: cerca un forno aperto lì vicino,
 * ed è quello che mostra da sempre l'app Ricerca fornitori.
 *
 * Restano fuori solo i due stati che vogliono dire «non chiamarli»:
 * chi ha detto di no e chi non lavora più con noi. Proporli sarebbe far
 * ripartire una telefonata già chiusa.
 */
const STATI_DA_NON_PROPORRE = ['non_interessato', 'dismesso']

/** Come si chiama uno stato, a schermo (le etichette del registro). */
const ETICHETTA_STATO: Record<string, string> = {
  attivo: 'Partner',
  prospect: 'Prospect',
  in_contatto: 'In contatto',
  in_attesa: 'In attesa',
  in_trattativa: 'In trattativa',
  da_ricontattare: 'Da ricontattare',
}

export function etichettaStato(stato: string): string {
  return ETICHETTA_STATO[(stato || '').toLowerCase()] ?? stato ?? ''
}

export type FornitoreZona = Partner & {
  /** Il numero da usare: il suo, oppure quello di un referente. */
  telefonoUtile: string
  /** L'indirizzo email da usare: la sua, oppure quella di un referente. */
  emailUtile: string
  /** Da chi arriva il recapito, quando non è dell'insegna ma di una persona. */
  recapitoDa: string
}

/**
 * Il recapito con cui si può davvero scrivere.
 *
 * ⚠️ MISURATO nel registro: dei partner attivi molti **non hanno un telefono
 * proprio**, ma hanno un referente che ce l'ha. Guardando solo i campi
 * dell'insegna, la metà dei fornitori risulterebbe irraggiungibile pur avendo
 * un numero scritto due righe sotto.
 */
function recapiti(p: Partner): { telefono: string; email: string; da: string } {
  if (p.telefono || p.email) return { telefono: p.telefono, email: p.email, da: '' }
  const conNumero = p.contatti.find((c) => c.telefono || c.email)
  if (!conNumero) return { telefono: '', email: '', da: '' }
  return {
    telefono: conNumero.telefono,
    email: conNumero.email,
    da: conNumero.nome || conNumero.ruolo || 'referente',
  }
}


/**
 * Tutto il registro, con una memoria di pochi minuti.
 *
 * ⚠️⚠️ SI LEGGONO TUTTE LE PAGINE, ed è la correzione di un errore che avevo
 * appena fatto: una sola pagina da 200 righe su **1.040** faceva dire «nessun
 * fornitore in provincia di NO» mentre ad Arona c'era una pasticceria censita —
 * stava a pagina 3. È lo stesso difetto contro cui mette in guardia il commento
 * qui sopra sulle province: **una lista tagliata non sembra sbagliata, sembra
 * corta**, e nessuno va a controllare.
 *
 * Le pagine dopo la prima si chiedono INSIEME: in fila sarebbero cinque andate
 * e ritorni prima di poter mostrare qualcosa.
 *
 * ⚠️ La memoria dura pochi minuti e sta nel processo: serve a non rifare sei
 * chiamate ogni volta che si apre un ordine, non a tenere una copia del
 * registro (la regola di Anagrafiche resta «non duplicare, rileggere»). Un
 * partner disattivato là sparisce di qui al massimo dopo 5
 * minuti.
 */
const MINUTI_MEMORIA = 5
let memoria: { quando: number; esito: EsitoPartner } | null = null

async function tuttoIlRegistro(): Promise<EsitoPartner> {
  if (memoria && Date.now() - memoria.quando < MINUTI_MEMORIA * 60_000) return memoria.esito

  const prima = await partnerAttivi({ perPagina: 200, stato: 'tutti' })
  if (prima.stato !== 'ok') return prima

  const perPagina = 200
  const pagine = Math.ceil((prima.totale || prima.partner.length) / perPagina)
  let partner = prima.partner
  if (pagine > 1) {
    const altre = await Promise.all(
      Array.from({ length: pagine - 1 }, (_, i) =>
        partnerAttivi({ perPagina, pagina: i + 2, stato: 'tutti' })
      )
    )
    for (const a of altre) if (a.stato === 'ok') partner = partner.concat(a.partner)
  }

  const esito: EsitoPartner = {
    stato: 'ok',
    totale: prima.totale,
    partner,
    categorie: [...new Set(partner.map((p) => p.categoria).filter(Boolean))].sort(),
    citta: [...new Set(partner.map((p) => p.citta).filter(Boolean))].sort(),
  }
  memoria = { quando: Date.now(), esito }
  return esito
}

export type EsitoZona =
  | { stato: 'ok'; fornitori: FornitoreZona[]; provincia: string }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

/**
 * I fornitori attivi in quella provincia, per quel mestiere.
 *
 * `mestiere` null = tutti i mestieri utili (pasticceria + fiori).
 */
export async function fornitoriInZona(
  provincia: string,
  mestiere: Mestiere | null
): Promise<EsitoZona> {
  const sigla = siglaProvincia(provincia)
  if (!sigla) return { stato: 'ok', fornitori: [], provincia: '' }

  // ⚠️ SI CHIEDONO TUTTI GLI STATI, non i soli partner attivi: la provincia
  // dove non abbiamo un partner è proprio quella in cui serve il prospect già
  // censito. Il filtro «chi non si chiama» lo facciamo qui sotto.
  //
  // ⚠️ Il filtro per provincia NON si delega al registro, che pure lo accetta:
  // là dentro la stessa provincia è scritta in due modi («MI» e «MILANO»), e un
  // confronto esatto lato registro perderebbe metà delle righe senza dirlo.
  const esito = await tuttoIlRegistro()
  if (esito.stato !== 'ok') return esito

  const categorie = mestiere
    ? CATEGORIE[mestiere]
    : [...CATEGORIE.pasticceria, ...CATEGORIE.fioraio]

  const fornitori = esito.partner
    .filter((p) => !STATI_DA_NON_PROPORRE.includes((p.stato || '').toLowerCase()))
    .filter((p) => siglaProvincia(p.provincia || p.citta) === sigla)
    .filter((p) => {
      const c = (p.categoria || '').toUpperCase()
      return categorie.some((k) => c.includes(k))
    })
    .map((p) => {
      const r = recapiti(p)
      return { ...p, telefonoUtile: r.telefono, emailUtile: r.email, recapitoDa: r.da }
    })
    // L'ordine dice cosa provare prima: chi si può contattare davvero, e fra
    // questi i partner con cui lavoriamo già — un prospect è un buon numero da
    // fare, ma solo dopo aver visto se c'è di meglio.
    .sort((a, b) => {
      const raggiungibile = (x: FornitoreZona) => Number(!!(x.telefonoUtile || x.emailUtile))
      const eAttivo = (x: FornitoreZona) => Number((x.stato || '').toLowerCase() === 'attivo')
      return raggiungibile(b) - raggiungibile(a) || eAttivo(b) - eAttivo(a)
    })

  return { stato: 'ok', fornitori, provincia: sigla }
}
