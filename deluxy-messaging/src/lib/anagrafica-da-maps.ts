import { siglaProvincia } from './province'
import type { DettaglioMaps } from './maps-fornitori'

// DA UN LUOGO DI GOOGLE MAPS A UN CONTATTO DI ANAGRAFICHE.
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «devi importare tutti i dati da maps
// che servono per creare il contatto in anagrafiche». Finora, di un fornitore
// trovato su Maps, nel registro entrava **il nome e basta** — e poi qualcuno
// riapriva Google sul telefono e ricopiava indirizzo e numero a mano, che è
// esattamente il lavoro che questa ricerca doveva togliere.
//
// ⚠️ QUESTO FILE NON PARLA CON NESSUNO: prende un oggetto e ne restituisce un
// altro. È una traduzione fra due vocabolari, e le traduzioni si provano
// (`scripts/prova-anagrafica-da-maps.mts`) senza chiamare né Google né il
// registro.
//
// ⚠️⚠️ QUELLO CHE ANAGRAFICHE NON HA DOVE METTERE. Il registro accetta nome,
// ragione sociale, categoria, città, provincia, regione, sede, tipo di luogo,
// indirizzo, email, telefono, P.IVA/CF, note, fonte e i dati di fatturazione.
// **Non ha un campo per il sito, per il CAP, né per l'id del luogo su Google**
// (i `RiferimentoEsterno` sono agganciati al sistema che scrive, e scriverci
// dentro un `place_id` spacciandolo per un nostro id renderebbe irrintracciabile
// la richiesta vera). Quei tre non si buttano: vanno nelle **note**, scritte in
// chiaro e attribuite a Google, così chi apre la scheda li vede e li usa. Se un
// giorno il registro avrà quei campi, si spostano lì da qui e basta.

/** I campi che il registro accetta, riempiti con quello che Maps sa. */
export type ContattoDaMaps = {
  nome: string
  citta?: string
  provincia?: string
  regione?: string
  indirizzo?: string
  telefono?: string
  categoria?: string
  note?: string
}

/**
 * IL MESTIERE, dai tipi di Google.
 *
 * ⚠️⚠️ Volutamente CORTA. La lista dei tipi di Google ha centinaia di voci, e
 * ogni riga in più qui è una categoria scritta nel golden record di tutti sulla
 * fiducia. Ci stanno solo quelli che in italiano vogliono dire una cosa sola.
 *
 * ⚠️ `bakery` NON c'è, ed è la voce che verrebbe più naturale mettere: in Italia
 * un `bakery` è un panificio tanto quanto una pasticceria, e Google lo attacca
 * a tutti e due. Meglio `ALTRO` — che il registro lascia riempire a chiunque
 * dopo — che «PASTICCERIA» addosso a un fornaio, che invece il merge protegge e
 * non si lascia più correggere da un'altra app
 * ([[feedback-non-dedurre-dati-critici]]).
 */
const MESTIERI: Record<string, string> = {
  florist: 'FIORISTA',
  flower_delivery: 'FIORISTA',
  pastry_shop: 'PASTICCERIA',
  dessert_shop: 'PASTICCERIA',
  chocolate_shop: 'PASTICCERIA',
  restaurant: 'RISTORANTE',
  catering_service: 'CATERING',
  jewelry_store: 'BOUTIQUE',
  clothing_store: 'BOUTIQUE',
}

/**
 * Un valore che arriva da fuori, ridotto a testo di lunghezza ragionevole.
 *
 * ⚠️⚠️ Questa scheda arriva **nel corpo di una richiesta HTTP** e finisce nel
 * golden record di tutte le app. Chi la manda è un operatore autenticato, non
 * un estraneo, ma «autenticato» non vuol dire «corretto»: basta un cambio di
 * forma nella risposta di Google (un numero dove c'era una stringa) perché qui
 * arrivi qualcosa che non è testo. `String()` non solleva mai, e il tetto
 * impedisce che una risposta anomala scriva mezzo megabyte nelle note del
 * registro.
 */
function taglia(v: unknown, max = 200): string {
  if (v == null) return ''
  return String(v).trim().slice(0, max)
}

export function categoriaDaTipi(tipi: string[]): string {
  // ⚠️ `Array.isArray` e non `?? []`: da fuori può arrivare una stringa sola, e
  // un `for…of` su una stringa gira sulle LETTERE — nessun errore, nessun
  // risultato, e nessun modo di accorgersene.
  for (const t of Array.isArray(tipi) ? tipi : []) {
    const c = MESTIERI[taglia(t, 60).toLowerCase()]
    if (c) return c
  }
  return ''
}

/**
 * Le note: quello che Maps sa e il registro non sa dove mettere.
 *
 * ⚠️ Nel registro `note` è **additivo** nel merge (si appende in coda, non
 * sovrascrive), e non riscrive una riga che c'è già: si può quindi rimandare
 * dieci volte senza sporcare niente. Per questo la riga dev'essere **sempre
 * uguale a sé stessa** — niente date né «aggiornato il», che cambierebbero il
 * testo a ogni giro e lo farebbero appendere daccapo.
 *
 * ⚠️ Il voto è di GOOGLE e lo dice: nel registro `votoD2C` è **il nostro**
 * giudizio sulle consegne, e scriverci dentro le stelline di Maps vorrebbe dire
 * leggere «4,6 su 5» credendo di aver valutato noi un fornitore mai usato.
 */
export function noteDaMaps(l: DettaglioMaps): string {
  const righe: string[] = []
  const sito = taglia(l.sito, 500)
  if (sito) righe.push(`Sito: ${sito}`)
  // ⚠️ Il CAP si scrive SOLO se la via c'è: da solo non è un indirizzo, e in una
  // nota è una cifra che non si sa a che cosa appartenga.
  const cap = taglia(l.cap, 20)
  if (cap && taglia(l.via, 200)) righe.push(`CAP: ${cap}`)
  const paese = taglia(l.paese, 80)
  if (paese && !/^ital/i.test(paese)) righe.push(`Paese: ${paese}`)
  // ⚠️ `Number.isFinite` e non `!= null`: da fuori il voto può arrivare come
  // stringa, e `.toFixed` su una stringa solleva — dentro un blocco che è
  // best-effort, cioè scompare in silenzio portandosi via tutto il resto.
  const voto = Number(l.voto)
  if (l.voto != null && Number.isFinite(voto)) {
    const quante = Number(l.recensioni)
    righe.push(
      `Google Maps: ${voto.toFixed(1)}/5${Number.isFinite(quante) && quante > 0 ? ` su ${quante} recensioni` : ''}`
    )
  }
  if (l.chiuso) righe.push('Google Maps lo dà come CHIUSO DEFINITIVAMENTE.')
  const mappa = taglia(l.mappa, 500)
  if (mappa) righe.push(`Scheda: ${mappa}`)
  const id = taglia(l.id, 200)
  if (id) righe.push(`Google place id: ${id}`)
  if (!righe.length) return ''
  return ['Da Google Maps:', ...righe].join('\n')
}

/**
 * Il contatto, pronto da mandare al registro.
 *
 * ⚠️⚠️ NON SI INVENTA NIENTE: un campo che Maps non dà **non c'è**, e non c'è
 * perché il merge del registro scrive solo i campi presenti. Mandare `citta: ''`
 * non è la stessa cosa che non mandarla — la seconda lascia stare quello che
 * c'è, la prima prova a cancellarlo.
 *
 * ⚠️ La PROVINCIA: Google la dà già come sigla (`MI`), ma non sempre e non
 * ovunque; quando manca si prova a ricavarla dalla città con `siglaProvincia`,
 * che risponde solo se è **certa**. Serve perché la lista «fornitori in zona»
 * filtra per provincia: senza, il fornitore appena creato non verrà proposto a
 * nessuno al prossimo ordine in quella stessa città.
 *
 * @param mestiereDalNostroOrdine il mestiere ricavato dal NEGOZIO che ha
 *   ordinato (`mestierePerNegozio`). ⚠️ Ha la precedenza sui tipi di Google
 *   perché è un **fatto**: quel fornitore un bouquet per Deluxy Flowers l'ha
 *   preparato davvero. Google dice invece che cosa quel luogo è in generale.
 */
export function contattoDaMaps(
  l: DettaglioMaps,
  mestiereDalNostroOrdine?: string
): ContattoDaMaps {
  const c: ContattoDaMaps = { nome: taglia(l.nome) }

  const citta = taglia(l.citta, 120)
  if (citta) c.citta = citta

  // ⚠️ La sigla di Google si accetta solo se è **due lettere**: in altri paesi
  // `administrative_area_level_2` breve è una parola intera («Alpes-Maritimes»),
  // e infilarla in un campo che il registro tratta come sigla sporca i filtri.
  const daGoogle = taglia(l.provincia, 60).toUpperCase()
  const provincia = /^[A-Z]{2}$/.test(daGoogle) ? daGoogle : siglaProvincia(citta)
  if (provincia) c.provincia = provincia

  const regione = taglia(l.regione, 120)
  if (regione) c.regione = regione

  // ⚠️ Via e civico dai PEZZI, non la riga formattata: quella ripete città,
  // CAP e paese, che nel registro hanno già la loro colonna — e riscritti
  // dentro l'indirizzo diventano due verità che poi divergono.
  const via = taglia(l.via, 200)
  if (via) c.indirizzo = via

  const telefono = taglia(l.telefono, 40)
  if (telefono) c.telefono = telefono

  const categoria = taglia(mestiereDalNostroOrdine, 40) || categoriaDaTipi(l.tipi ?? [])
  if (categoria) c.categoria = categoria

  const note = noteDaMaps(l)
  if (note) c.note = note

  return c
}
