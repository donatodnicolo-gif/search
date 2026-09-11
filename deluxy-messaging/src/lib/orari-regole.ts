// ⭐ ORARI NEGOZI — LE REGOLE, senza server (10/09/2026, richiesta dell'utente:
// «una sezione ORARI NEGOZI dove impostiamo per i negozi Shopify l'apertura del
// negozio — quindi se la data è selezionabile —, le fasce orarie di consegna
// con orario minimo e massimo, e i giorni di chiusura»; e poi: «prepara le
// version to work di Shopify in modo tale che tutte le tabelle recepiscano le
// date da te»).
//
// Questo file NON importa niente dal server: lo leggono la pagina Orari negozi,
// il modulo «Nuovo ordine» (client), la lib che crea l'ordine (server) e l'API
// PUBBLICA che i siti Shopify chiamano per sapere quali date e quali fasce
// proporre. La regola è UNA e sta qui — scritta in due posti sarebbe diversa
// in due posti (vedi la trappola «regola ricopiata»). Fino al 10/09/2026 i tre
// temi Shopify avevano ognuno la sua copia cablata in JavaScript
// (REGOLE_BRAND.md in sviluppi-siti-deluxy): da oggi la CASA è questa.
//
// Per negozio:
//  · i GIORNI APERTI della settimana (0 = domenica … 6 = sabato, come getDay());
//  · le REGOLE DELLE FASCE: la finestra della giornata (dalle 08 alle 22), la
//    durata delle fasce per OGGI, DOMANI e OLTRE, quante fasce saltare dopo
//    quella in corso, l'ora limite dopo la quale per oggi non si ordina più;
//  · i GIORNI DI CHIUSURA: una data, il motivo, e «ogni anno» per le feste fisse.
//
// ⚠️ La chiusura vince sull'apertura: un martedì di Natale è chiuso.
// ⚠️ Le date si confrontano come stringhe `AAAA-MM-GG`, mai come Date: il
// server gira in UTC e alle 23:30 italiane «oggi» sarebbe già domani. L'ora
// «adesso» è SEMPRE quella italiana (`adessoRoma`), anche per un cliente che
// ordina da Londra.

export type Fascia = { da: string; a: string }
export type GiornoChiusura = { data: string; motivo: string; ogniAnno: boolean }
/**
 * ⭐ UN GIORNO CON FASCE SUE (utente, 11/09/2026: «consenti di specificare per
 * specifici giorni fasce orarie specifiche»): quel giorno le fasce NON si
 * calcolano dalle regole, sono queste — la vigilia di Natale solo la mattina,
 * San Valentino a fasce strette, una domenica aperta per eccezione. Il giorno
 * conta come APERTO anche se il giorno della settimana è chiuso. `ogniAnno`
 * come per le chiusure (feste fisse). `testo` è solo il campo del modulo
 * («08-12, 14-18»): non si salva.
 */
export type GiornoSpeciale = { data: string; ogniAnno: boolean; fasce: Fascia[]; testo?: string }

/**
 * LE REGOLE DELLE FASCE di un negozio.
 *
 * Il modello è uno solo e copre sia le «fasce granulari» di deluxy.it (2 ore
 * oggi, 1 ora dopo) sia le tre fasce ampie di Flowers e Cake (durata 4 ore,
 * finestra 08-20): cambiano i numeri, non il codice.
 */
export type RegoleConsegna = {
  /** La finestra della giornata in cui si consegna, es. 08:00 → 22:00. */
  finestraDa: string
  finestraA: string
  oggi: {
    /** Si consegna in giornata? */
    attivo: boolean
    /** Durata delle fasce di oggi, in ore (deluxy.it: 2). */
    durataOre: number
    /**
     * Quante fasce saltare dopo quella IN CORSO. Con 2: alle 10:30 la fascia in
     * corso è 10-12, si saltano 12-14 e la prima proponibile è 14-16 («a partire
     * dal secondo paio d'ore successivo a quello in corso», regola dell'utente).
     */
    saltaFasce: number
    /**
     * L'ORARIO DI DROP-OFF (parola dell'utente, 10/09/2026): da quest'ora gli
     * ordini arrivano solo dal giorno dopo. deluxy.it e business 20:00,
     * Flowers 16:00, Cake 14:00 — i valori che i siti avevano già.
     */
    limiteOra: string
    /**
     * Di NOTTE (prima dell'apertura) la prima fascia proponibile parte da qui:
     * l'anticipo si conta da quando qualcuno lavora, non da quando il cliente
     * clicca (architetto UX, punto B). deluxy.it 10:00, Flowers 08:00, Cake 12:00.
     */
    notteDalle: string
    /**
     * L'ULTIMA fascia della giornata resta ordinabile fino al limite anche se il
     * salto la escluderebbe (deluxy.it oggi: 20-22 ordinabile fino alle 20:00).
     */
    ultimaFasciaFinoAlLimite: boolean
  }
  domani: {
    durataOre: number
    /**
     * Se si ordina dopo `saltaDopoOra`, quante prime fasce di domani saltare
     * (Flowers: dalle 22 si ordina per domani «dalle 12», cioè salta 08-12 → 1).
     */
    dopoLimiteSaltaFasce: number
    /**
     * L'ora di oggi da cui scatta il salto qui sopra. Non coincide per forza
     * col drop-off: Flowers chiude oggi alle 16 ma domani perde la mattina solo
     * ordinando dalle 22. Vuoto = il drop-off.
     */
    saltaDopoOra: string
    /**
     * Ordinando dopo `saltaDopoOra`, quanto dura la PRIMA fascia di domani
     * (deluxy.it: 2 ore dall'orario minimo del carrello — 08-10 — poi le altre
     * tornano di `durataOre`: 10-11, 11-12…). 0 = come le altre.
     * Decisione dell'utente, 10/09/2026 notte.
     */
    primaFasciaOre: number
  }
  oltre: {
    durataOre: number
  }
  /** Quanti giorni mostrare nel calendario dei siti. */
  giorniMostrati: number
}

export type OrarioNegozioDati = {
  /** I giorni aperti, 0..6 (0 = domenica). */
  giorniApertura: number[]
  regole: RegoleConsegna
  giorniChiusura: GiornoChiusura[]
  /** Giorni con fasce proprie: vincono sulle regole e sul giorno della settimana. Facoltativo per chi ci passa dati vecchi. */
  giorniSpeciali?: GiornoSpeciale[]
  nota: string
}

export const NOMI_GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
export const NOMI_GIORNI_CORTI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
/** L'ordine in cui si mostrano: da lunedì a domenica. */
export const GIORNI_IN_ORDINE = [1, 2, 3, 4, 5, 6, 0]

/**
 * LE REGOLE DI DELUXY.IT (dettate dall'utente il 10/09/2026, valide anche per
 * business.deluxy.it): oggi in fasce di 2 ore dalla seconda dopo quella in
 * corso, dalle 20:00 si ordina per domani (2 ore), dopodomani e oltre a fasce
 * di un'ora dall'orario di disponibilità minima dei prodotti. Finestra 08-22.
 */
export const REGOLE_DELUXY: RegoleConsegna = {
  finestraDa: '08:00',
  finestraA: '22:00',
  // Dalle 18:00 alle 19:59 la sola 20-22 (eccezione esplicita, confermata
  // dall'architetto UX il 10/09: l'anticipo scende a 2 ore sulla FINE della
  // fascia; costo operativo: evadere in ~2 ore un ordine delle 19:59).
  oggi: { attivo: true, durataOre: 2, saltaFasce: 2, limiteOra: '20:00', ultimaFasciaFinoAlLimite: true, notteDalle: '10:00' },
  // DOMANI a fasce di UN'ORA dall'orario minimo del carrello (08-09, 09-10…).
  // Ordinando dopo le 20 la PRIMA fascia di domani dura due ore e parte
  // dall'orario minimo del carrello (08-10 senza vincoli; dalle 9 → 09-11), le
  // ore restanti tornano orarie (10-11, 11-12… / 11-12, 12-13…). Nessuna fascia
  // fissa da saltare (decisione dell'utente, 10/09/2026 notte — scartate la
  // 10-12 fissa dell'architetto UX e la griglia a 2 ore per tutto il giorno).
  domani: { durataOre: 1, dopoLimiteSaltaFasce: 0, saltaDopoOra: '20:00', primaFasciaOre: 2 },
  oltre: { durataOre: 1 },
  giorniMostrati: 60,
}

/**
 * DELUXYFLOWERS.COM (REGOLE_BRAND.md): tre fasce ampie 08-12 · 12-16 · 16-20,
 * drop-off 16:00 (8–11:59 → dalle 12; 12–15:59 → solo 16-20), di notte tutte
 * (dalle 08), dalle 22:00 si ordina per domani dalle 12 (salta 08-12).
 */
export const REGOLE_FASCE_AMPIE: RegoleConsegna = {
  finestraDa: '08:00',
  finestraA: '20:00',
  oggi: { attivo: true, durataOre: 4, saltaFasce: 1, limiteOra: '16:00', ultimaFasciaFinoAlLimite: false, notteDalle: '08:00' },
  domani: { durataOre: 4, dopoLimiteSaltaFasce: 1, saltaDopoOra: '22:00', primaFasciaOre: 0 },
  oltre: { durataOre: 4 },
  giorniMostrati: 60,
}
export const REGOLE_FLOWERS = REGOLE_FASCE_AMPIE

/**
 * CAKEDESIGN.ME (REGOLE_BRAND.md): tre fasce ampie, drop-off 14:00 (8–13:59 →
 * solo 16-20), di notte dalle 12 (salta 08-12), dalle 20:00 si ordina per
 * domani dalle 12.
 */
export const REGOLE_CAKE: RegoleConsegna = {
  finestraDa: '08:00',
  finestraA: '20:00',
  oggi: { attivo: true, durataOre: 4, saltaFasce: 1, limiteOra: '14:00', ultimaFasciaFinoAlLimite: false, notteDalle: '12:00' },
  domani: { durataOre: 4, dopoLimiteSaltaFasce: 1, saltaDopoOra: '20:00', primaFasciaOre: 0 },
  oltre: { durataOre: 4 },
  giorniMostrati: 60,
}

/** I preset di partenza per dominio Shopify: quello che ogni sito faceva già il 10/09/2026. */
export const REGOLE_PER_DOMINIO: Record<string, { nome: string; regole: RegoleConsegna }> = {
  'deluxygifts.myshopify.com': { nome: 'deluxy.it', regole: REGOLE_DELUXY },
  '90bfeb-f5.myshopify.com': { nome: 'business.deluxy.it', regole: REGOLE_DELUXY },
  'fb72b1-2.myshopify.com': { nome: 'deluxyflowers.com', regole: REGOLE_FLOWERS },
  'cakedesign-5921.myshopify.com': { nome: 'cakedesign.me', regole: REGOLE_CAKE },
}

/**
 * Il PUNTO DI PARTENZA per un negozio che non ha ancora una riga: aperto tutti
 * i giorni, regole delle fasce ampie, nessuna chiusura.
 *
 * ⚠️⚠️ NON è una regola: finché nessuno salva, il negozio NON ha orari e le
 * date non si bloccano (né in Nuovo ordine né in creaOrdine, né sui siti). Un
 * default «lun–sab» avrebbe chiuso la domenica a tutti i negozi senza che
 * nessuno lo avesse deciso — la trappola del default che si spaccia per
 * decisione. Questo oggetto serve solo a riempire la scheda la prima volta.
 */
export const ORARIO_PREDEFINITO: OrarioNegozioDati = {
  giorniApertura: [0, 1, 2, 3, 4, 5, 6],
  regole: REGOLE_FASCE_AMPIE,
  giorniChiusura: [],
  giorniSpeciali: [],
  nota: '',
}

const ORA = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function oraValida(s: string): boolean {
  return ORA.test(s)
}
export function dataValida(s: string): boolean {
  return DATA.test(s)
}
export function minuti(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function hhmm(min: number): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`
}

function copiaRegole(r: RegoleConsegna): RegoleConsegna {
  return { ...r, oggi: { ...r.oggi }, domani: { ...r.domani }, oltre: { ...r.oltre } }
}

/** Una copia del predefinito, per non farsi modificare l'originale da chi la riceve. */
export function orarioPredefinito(): OrarioNegozioDati {
  return {
    giorniApertura: [...ORARIO_PREDEFINITO.giorniApertura],
    regole: copiaRegole(ORARIO_PREDEFINITO.regole),
    giorniChiusura: [],
    nota: '',
  }
}

/**
 * Legge le regole scritte in tabella (JSON) completandole col predefinito: una
 * riga scritta prima che esistesse un campo nuovo non fa cadere niente.
 */
export function leggiRegole(json: string | null | undefined, base: RegoleConsegna = REGOLE_FASCE_AMPIE): RegoleConsegna {
  const r = copiaRegole(base)
  let g: Partial<RegoleConsegna> = {}
  try {
    const grezzo: unknown = JSON.parse(json || '{}')
    if (grezzo && typeof grezzo === 'object') g = grezzo as Partial<RegoleConsegna>
  } catch {
    g = {}
  }
  if (typeof g.finestraDa === 'string' && oraValida(g.finestraDa)) r.finestraDa = g.finestraDa
  if (typeof g.finestraA === 'string' && oraValida(g.finestraA)) r.finestraA = g.finestraA
  if (g.oggi && typeof g.oggi === 'object') {
    if (typeof g.oggi.attivo === 'boolean') r.oggi.attivo = g.oggi.attivo
    if (Number.isFinite(g.oggi.durataOre)) r.oggi.durataOre = Number(g.oggi.durataOre)
    if (Number.isFinite(g.oggi.saltaFasce)) r.oggi.saltaFasce = Number(g.oggi.saltaFasce)
    if (typeof g.oggi.limiteOra === 'string' && oraValida(g.oggi.limiteOra)) r.oggi.limiteOra = g.oggi.limiteOra
    if (typeof g.oggi.ultimaFasciaFinoAlLimite === 'boolean') r.oggi.ultimaFasciaFinoAlLimite = g.oggi.ultimaFasciaFinoAlLimite
    if (typeof g.oggi.notteDalle === 'string' && oraValida(g.oggi.notteDalle)) r.oggi.notteDalle = g.oggi.notteDalle
  }
  if (g.domani && typeof g.domani === 'object') {
    if (Number.isFinite(g.domani.durataOre)) r.domani.durataOre = Number(g.domani.durataOre)
    if (Number.isFinite(g.domani.dopoLimiteSaltaFasce)) r.domani.dopoLimiteSaltaFasce = Number(g.domani.dopoLimiteSaltaFasce)
    if (typeof g.domani.saltaDopoOra === 'string' && oraValida(g.domani.saltaDopoOra)) r.domani.saltaDopoOra = g.domani.saltaDopoOra
    if (Number.isFinite(g.domani.primaFasciaOre)) r.domani.primaFasciaOre = Number(g.domani.primaFasciaOre)
  }
  if (g.oltre && typeof g.oltre === 'object' && Number.isFinite(g.oltre.durataOre)) r.oltre.durataOre = Number(g.oltre.durataOre)
  if (Number.isFinite(g.giorniMostrati)) r.giorniMostrati = Number(g.giorniMostrati)
  return r
}

/**
 * Legge quello che c'è in tabella (le colonne di testo) e lo rende dati puliti.
 * Un JSON rotto non fa cadere la pagina: quella parte torna vuota, e si dice.
 */
export function leggiOrario(
  riga: { giorniApertura: string; regole?: string | null; giorniChiusura: string; fasce?: string | null; nota: string } | null | undefined
): OrarioNegozioDati {
  if (!riga) return orarioPredefinito()
  const giorni = riga.giorniApertura
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  let chiusure: GiornoChiusura[] = []
  try {
    const grezzo: unknown = JSON.parse(riga.giorniChiusura || '[]')
    if (Array.isArray(grezzo)) {
      chiusure = grezzo
        .filter((g) => g && dataValida(String(g.data)))
        .map((g) => ({ data: String(g.data), motivo: String(g.motivo ?? ''), ogniAnno: Boolean(g.ogniAnno) }))
    }
  } catch {
    chiusure = []
  }
  // ⭐ I giorni speciali stanno nella colonna `fasce` (rimasta libera dal 10/09
  // sera): [{ data, ogniAnno, fasce: [{da,a}] }]. Un JSON rotto = nessun giorno speciale.
  let speciali: GiornoSpeciale[] = []
  try {
    const grezzo: unknown = JSON.parse(riga.fasce || '[]')
    if (Array.isArray(grezzo)) {
      speciali = grezzo
        .filter((g) => g && dataValida(String(g.data)) && Array.isArray(g.fasce))
        .map((g) => ({
          data: String(g.data),
          ogniAnno: Boolean(g.ogniAnno),
          fasce: (g.fasce as unknown[])
            .map((f) => ({ da: String((f as Fascia)?.da ?? ''), a: String((f as Fascia)?.a ?? '') }))
            .filter((f) => oraValida(f.da) && oraValida(f.a) && minuti(f.da) < minuti(f.a)),
        }))
        .filter((g) => g.fasce.length)
    }
  } catch {
    speciali = []
  }
  return { giorniApertura: [...new Set(giorni)].sort(), regole: leggiRegole(riga.regole), giorniChiusura: chiusure, giorniSpeciali: speciali, nota: riga.nota ?? '' }
}

/**
 * Le fasce scritte a mano nel modulo («08-12, 14-18», «9-11 · 15:30-17»): una
 * fascia per pezzo, separate da virgola, punto o a capo; le ore piene si possono
 * scrivere senza minuti. Quello che non si capisce si scarta (chi scrive vede
 * subito le pillole di quello che è stato capito).
 */
export function leggiFasceTesto(testo: string): Fascia[] {
  const fasce: Fascia[] = []
  for (const pezzo of String(testo ?? '').split(/[,;·\n]+/)) {
    const m = pezzo.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?$/)
    if (!m) continue
    const da = `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`
    const a = `${m[3].padStart(2, '0')}:${m[4] ?? '00'}`
    if (oraValida(da) && oraValida(a) && minuti(da) < minuti(a)) fasce.push({ da, a })
  }
  fasce.sort((x, y) => minuti(x.da) - minuti(y.da))
  return fasce
}

/** Le fasce nel verso opposto, per riempire il campo: «08-12, 14-18». */
export function scriviFasceTesto(fasce: Fascia[]): string {
  return fasce.map(etichettaFascia).join(', ')
}

/** Il giorno speciale che vale per QUESTA data, se c'è. */
export function giornoSpeciale(dati: OrarioNegozioDati, iso: string): GiornoSpeciale | null {
  return (dati.giorniSpeciali ?? []).find((g) => (g.ogniAnno ? g.data.slice(5) === iso.slice(5) : g.data === iso)) ?? null
}

/** Controlla le regole delle fasce e torna gli errori a parole. */
export function validaRegole(input: unknown): { ok: true; regole: RegoleConsegna } | { ok: false; errori: string[] } {
  const errori: string[] = []
  const g = (input ?? {}) as Partial<RegoleConsegna>
  const ora = (v: unknown, nome: string) => {
    const s = String(v ?? '').trim()
    if (!oraValida(s)) errori.push(`${nome}: scrivi l'orario come HH:MM (es. 08:00).`)
    return s
  }
  const intero = (v: unknown, nome: string, min: number, max: number) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < min || n > max) errori.push(`${nome}: un numero intero fra ${min} e ${max}.`)
    return n
  }
  const finestraDa = ora(g.finestraDa, 'Finestra, dalle')
  const finestraA = ora(g.finestraA, 'Finestra, alle')
  if (oraValida(finestraDa) && oraValida(finestraA) && minuti(finestraA) <= minuti(finestraDa)) errori.push('La finestra deve finire dopo che comincia.')
  const o = (g.oggi ?? {}) as Partial<RegoleConsegna['oggi']>
  const d = (g.domani ?? {}) as Partial<RegoleConsegna['domani']>
  const l = (g.oltre ?? {}) as Partial<RegoleConsegna['oltre']>
  const regole: RegoleConsegna = {
    finestraDa,
    finestraA,
    oggi: {
      attivo: Boolean(o.attivo),
      durataOre: intero(o.durataOre, 'Oggi, durata delle fasce', 1, 12),
      saltaFasce: intero(o.saltaFasce, 'Oggi, fasce da saltare', 0, 6),
      limiteOra: ora(o.limiteOra, 'Orario di drop-off'),
      ultimaFasciaFinoAlLimite: Boolean(o.ultimaFasciaFinoAlLimite),
      notteDalle: ora(o.notteDalle, 'Di notte, prima fascia dalle'),
    },
    domani: {
      durataOre: intero(d.durataOre, 'Domani, durata delle fasce', 1, 12),
      dopoLimiteSaltaFasce: intero(d.dopoLimiteSaltaFasce, 'Domani, fasce da saltare dopo la soglia', 0, 6),
      saltaDopoOra: ora(d.saltaDopoOra || o.limiteOra, 'Domani, soglia del salto'),
      primaFasciaOre: intero(d.primaFasciaOre ?? 0, 'Domani, durata della prima fascia dopo la soglia', 0, 12),
    },
    oltre: { durataOre: intero(l.durataOre, 'Oltre, durata delle fasce', 1, 12) },
    giorniMostrati: intero(g.giorniMostrati ?? 60, 'Giorni mostrati', 7, 365),
  }
  if (oraValida(finestraDa) && oraValida(finestraA)) {
    const ampiezza = minuti(finestraA) - minuti(finestraDa)
    for (const [nome, ore] of [['Oggi', regole.oggi.durataOre], ['Domani', regole.domani.durataOre], ['Oltre', regole.oltre.durataOre]] as const) {
      if (Number.isInteger(ore) && ore * 60 > ampiezza) errori.push(`${nome}: una fascia di ${ore} ore non sta in una finestra di ${hhmm(ampiezza)}.`)
    }
  }
  if (errori.length) return { ok: false, errori }
  return { ok: true, regole }
}

/**
 * Controlla quello che arriva dal modulo prima di scriverlo. Torna gli errori
 * a parole (per l'operatore) e, se non ce ne sono, i dati puliti e ordinati.
 *
 * ⚠️ Zero giorni aperti si RIFIUTA: un negozio sempre chiuso non è una
 * configurazione, è un errore di click — e bloccherebbe ogni ordine.
 */
export function validaOrario(
  input: unknown
): { ok: true; dati: OrarioNegozioDati } | { ok: false; errori: string[] } {
  const errori: string[] = []
  const o = (input ?? {}) as Partial<Record<keyof OrarioNegozioDati, unknown>>
  const giorni = Array.isArray(o.giorniApertura)
    ? [...new Set(o.giorniApertura.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : []
  if (!giorni.length) errori.push('Scegli almeno un giorno di apertura: un negozio sempre chiuso non può ricevere ordini.')

  const r = validaRegole(o.regole)
  if (!r.ok) errori.push(...r.errori)

  const chiusure: GiornoChiusura[] = []
  if (o.giorniChiusura !== undefined && !Array.isArray(o.giorniChiusura)) errori.push('I giorni di chiusura non sono leggibili.')
  for (const [i, g] of (Array.isArray(o.giorniChiusura) ? o.giorniChiusura : []).entries()) {
    const data = String((g as GiornoChiusura)?.data ?? '').trim()
    if (!dataValida(data)) {
      errori.push(`Chiusura ${i + 1}: manca la data.`)
      continue
    }
    chiusure.push({
      data,
      motivo: String((g as GiornoChiusura)?.motivo ?? '').trim().slice(0, 120),
      ogniAnno: Boolean((g as GiornoChiusura)?.ogniAnno),
    })
  }
  chiusure.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0))
  const viste = new Set<string>()
  for (const c of chiusure) {
    const chiave = c.ogniAnno ? c.data.slice(5) : c.data
    if (viste.has(chiave)) errori.push(`Il giorno di chiusura ${scriviDataBreve(c.data)} è scritto due volte.`)
    viste.add(chiave)
  }

  // ⭐ I giorni speciali: data buona, almeno una fascia leggibile, niente doppioni,
  // e MAI lo stesso giorno anche fra le chiusure (chiuso o aperto con fasce sue:
  // una delle due, altrimenti nessuno sa quale vale).
  const speciali: GiornoSpeciale[] = []
  if (o.giorniSpeciali !== undefined && !Array.isArray(o.giorniSpeciali)) errori.push('I giorni con fasce speciali non sono leggibili.')
  for (const [i, g] of (Array.isArray(o.giorniSpeciali) ? o.giorniSpeciali : []).entries()) {
    const gs = g as Partial<GiornoSpeciale>
    const data = String(gs?.data ?? '').trim()
    if (!dataValida(data)) {
      errori.push(`Giorno speciale ${i + 1}: manca la data.`)
      continue
    }
    // Le fasce arrivano come lista {da,a} oppure, dal modulo, come testo.
    const daLista = Array.isArray(gs.fasce)
      ? gs.fasce
          .map((f) => ({ da: String((f as Fascia)?.da ?? '').trim(), a: String((f as Fascia)?.a ?? '').trim() }))
          .filter((f) => oraValida(f.da) && oraValida(f.a) && minuti(f.da) < minuti(f.a))
      : []
    const fasce = daLista.length ? daLista.sort((x, y) => minuti(x.da) - minuti(y.da)) : leggiFasceTesto(String(gs.testo ?? ''))
    if (!fasce.length) {
      errori.push(`Giorno speciale ${scriviDataBreve(data)}: scrivi almeno una fascia, come «08-12, 14-18».`)
      continue
    }
    for (let k = 1; k < fasce.length; k++) {
      if (minuti(fasce[k].da) < minuti(fasce[k - 1].a)) errori.push(`Giorno speciale ${scriviDataBreve(data)}: le fasce ${etichettaFascia(fasce[k - 1])} e ${etichettaFascia(fasce[k])} si sovrappongono.`)
    }
    speciali.push({ data, ogniAnno: Boolean(gs.ogniAnno), fasce })
  }
  speciali.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0))
  const visteSpeciali = new Set<string>()
  for (const s of speciali) {
    const chiave = s.ogniAnno ? s.data.slice(5) : s.data
    if (visteSpeciali.has(chiave)) errori.push(`Il giorno speciale ${scriviDataBreve(s.data)} è scritto due volte.`)
    visteSpeciali.add(chiave)
    const chiuso = chiusure.find((c) => (c.ogniAnno || s.ogniAnno ? c.data.slice(5) === s.data.slice(5) : c.data === s.data))
    if (chiuso) errori.push(`${scriviDataBreve(s.data)} è sia chiuso sia con fasce speciali: togli uno dei due.`)
  }

  const nota = String(o.nota ?? '').trim().slice(0, 500)
  if (errori.length || !r.ok) return { ok: false, errori }
  return { ok: true, dati: { giorniApertura: giorni, regole: r.regole, giorniChiusura: chiusure, giorniSpeciali: speciali, nota } }
}

/**
 * La fascia come la scrivono i siti negli ordini («08-12», «16-20», «14-15»):
 * sulle ore piene si tolgono i minuti, così coincide con quello che c'è già
 * negli attributi `Fascia_Oraria_Consegna` e con le voci storiche.
 */
export function etichettaFascia(f: Fascia): string {
  const corta = (s: string) => (s.endsWith(':00') ? s.slice(0, 2) : s)
  return `${corta(f.da)}-${corta(f.a)}`
}

/** «gio 25/12/2026» da «2026-12-25»; il giorno della settimana si calcola a mezzogiorno per non scivolare col fuso. */
export function scriviDataBreve(iso: string, conGiorno = true): string {
  if (!dataValida(iso)) return iso
  const [a, m, g] = iso.split('-')
  const d = new Date(Number(a), Number(m) - 1, Number(g), 12)
  return `${conGiorno ? NOMI_GIORNI_CORTI[d.getDay()] + ' ' : ''}${g}/${m}/${a}`
}

/** Il giorno della settimana (0..6) di una data `AAAA-MM-GG`, senza fuso. */
export function giornoSettimana(iso: string): number {
  const [a, m, g] = iso.split('-').map(Number)
  return new Date(a, m - 1, g, 12).getDay()
}

/** `AAAA-MM-GG` da anno/mese/giorno locali di una Date (usare solo con Date costruite a mezzogiorno). */
export function oggiIso(oggi: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${oggi.getFullYear()}-${p(oggi.getMonth() + 1)}-${p(oggi.getDate())}`
}

/** La data `iso` spostata di `n` giorni (anche negativi). */
export function piuGiorniIso(iso: string, n: number): string {
  const [a, m, g] = iso.split('-').map(Number)
  return oggiIso(new Date(a, m - 1, g + n, 12))
}

/** «Adesso» come lo vede chi ordina: data e minuti dell'ORA ITALIANA, qualunque sia il fuso del server o del cliente. */
export type Adesso = { data: string; minuti: number }
export function adessoRoma(istante: Date = new Date()): Adesso {
  const parti = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(istante)
  const v = (t: string) => parti.find((p) => p.type === t)?.value ?? '00'
  const ora = Number(v('hour')) % 24 // «24» a mezzanotte su alcuni motori
  return { data: `${v('year')}-${v('month')}-${v('day')}`, minuti: ora * 60 + Number(v('minute')) }
}

/**
 * LA REGOLA SUL GIORNO: questa data si può scegliere per questo negozio?
 *
 * Tre esiti, sempre a parole: passata · chiuso (data, con il motivo) · chiuso
 * (giorno della settimana). Chi la chiama mostra il motivo, non un «no».
 */
export function giornoSelezionabile(
  dati: OrarioNegozioDati,
  iso: string,
  oggi: string = adessoRoma().data
): { ok: boolean; motivo: string } {
  if (!dataValida(iso)) return { ok: false, motivo: 'La data non è leggibile.' }
  if (iso < oggi) return { ok: false, motivo: `${scriviDataBreve(iso)} è già passato.` }
  const chiusura = dati.giorniChiusura.find((c) => (c.ogniAnno ? c.data.slice(5) === iso.slice(5) : c.data === iso))
  if (chiusura) {
    return { ok: false, motivo: `Il negozio è chiuso ${scriviDataBreve(iso)}${chiusura.motivo ? ` (${chiusura.motivo})` : ''}.` }
  }
  // ⭐ Un giorno con fasce sue è aperto per definizione, anche se cade in un
  // giorno della settimana chiuso (la domenica aperta per eccezione).
  if (giornoSpeciale(dati, iso)) return { ok: true, motivo: '' }
  const gs = giornoSettimana(iso)
  if (!dati.giorniApertura.includes(gs)) return { ok: false, motivo: `Il negozio è chiuso di ${NOMI_GIORNI[gs].toLowerCase()}.` }
  return { ok: true, motivo: '' }
}

/**
 * IL CALENDARIO DEL PARTNER che prepara un prodotto unico (10/09/2026 sera): lo
 * costruisce la piattaforma consegne dagli orari settimanali, dalle fasce del
 * giorno e dalle eccezioni del partner (`GET /api/v1/app/prodotti-unici/calendario`),
 * indice 0 = oggi. `aperto: false` con `origine: 'chiuso-per-oggi'` = l'ora di
 * chiusura è già passata («se Clivati oggi chiude alle 15 e sono le 16,
 * acquistabili da domani»). Stessa forma che la piattaforma manda a Merchandising.
 */
export type GiornoPartner = { data: string; aperto: boolean; dalle: string | null; alle?: string | null; origine?: string }
export type CalendarioProdotto = { codice: string; nome?: string; partner?: string | null; senzaOrari?: boolean; calendario: GiornoPartner[] }

/** I vincoli che arrivano dal CARRELLO: li conosce il sito, non noi. */
export type VincoliCarrello = {
  /** L'orario di disponibilità minima di TUTTI i prodotti (il massimo dei `custom.minimo_orario`), in ore: 10 = dalle 10:00. */
  oraMinima?: number
  /** Il preavviso in giorni (il massimo dei `prodotto.consegna`): 0 = anche oggi. */
  leadGiorni?: number
  /**
   * I calendari dei partner dei prodotti unici nel carrello: un giorno in cui uno
   * di loro è chiuso si spegne (col nome del partner nel motivo), e l'ora di
   * apertura di quel giorno alza l'orario minimo delle fasce.
   */
  prodotti?: CalendarioProdotto[]
}

export type EsitoGiorno = { data: string; ok: boolean; motivo: string; fasce: Fascia[]; etichette: string[]; quando: 'oggi' | 'domani' | 'oltre'; speciale?: boolean }

/**
 * Le fasce di una giornata, tutte, a passi di `durataOre` finché stanno dentro
 * `finestraA`. Partono da `finestraDa`, o da `daMinuti` se è più tardi: così la
 * griglia si AGGANCIA all'orario minimo del carrello (dalle 9 → 09-11, 11-13…)
 * invece di tagliare una griglia fissa (che darebbe 10-12 e perderebbe un'ora).
 */
export function fasceIntere(regole: RegoleConsegna, durataOre: number, daMinuti = 0): Fascia[] {
  const da = Math.max(minuti(regole.finestraDa), daMinuti)
  const a = minuti(regole.finestraA)
  const passo = durataOre * 60
  const fasce: Fascia[] = []
  for (let t = da; t + passo <= a; t += passo) fasce.push({ da: hhmm(t), a: hhmm(t + passo) })
  return fasce
}

/**
 * LA REGOLA SULLE FASCE: per QUESTA data, in QUESTO momento, con QUESTO
 * carrello, quali fasce si possono scegliere — e se nessuna, perché.
 *
 * · OGGI: fasce di `oggi.durataOre`, dalla `saltaFasce`-esima dopo quella in
 *   corso; niente dopo `limiteOra`; l'ultima fascia resta fino al limite se
 *   `ultimaFasciaFinoAlLimite`. Prima della finestra le fasce «in corso» si
 *   contano lo stesso all'indietro (alle 07:00 la fascia in corso è 06-08:
 *   con salto 2 la prima è 10-12; alle 03:00 la prima è 08-10).
 * · DOMANI: fasce di `domani.durataOre` dall'orario minimo del carrello in su
 *   (deluxy.it: orarie, 08-09 09-10…; dalle 9 → 09-10 10-11…). Se si ordina dopo
 *   `saltaDopoOra`: con `primaFasciaOre` la PRIMA fascia dura tanto (deluxy.it:
 *   2 ore dall'orario minimo, 08-10, poi 10-11 11-12…), altrimenti si saltano le
 *   prime `dopoLimiteSaltaFasce` (Flowers e Cake: 1, «dalle 12»).
 * · OLTRE: fasce di `oltre.durataOre`, tutte, dall'orario minimo del carrello.
 * · Sempre: via le fasce che cominciano prima di `oraMinima` del carrello, e
 *   niente prima di oggi + `leadGiorni`.
 */
export function fasceDelGiorno(dati: OrarioNegozioDati, iso: string, adesso: Adesso = adessoRoma(), vincoli: VincoliCarrello = {}): EsitoGiorno {
  const r = dati.regole
  const quando: EsitoGiorno['quando'] = iso === adesso.data ? 'oggi' : iso === piuGiorniIso(adesso.data, 1) ? 'domani' : 'oltre'
  const vuoto = (motivo: string): EsitoGiorno => ({ data: iso, ok: false, motivo, fasce: [], etichette: [], quando })
  const giorno = giornoSelezionabile(dati, iso, adesso.data)
  if (!giorno.ok) return vuoto(giorno.motivo)
  const lead = Math.max(0, Math.floor(vincoli.leadGiorni ?? 0))
  if (lead > 0 && iso < piuGiorniIso(adesso.data, lead)) {
    return vuoto(`I prodotti nel carrello si consegnano da ${scriviDataBreve(piuGiorniIso(adesso.data, lead))}: servono ${lead} ${lead === 1 ? 'giorno' : 'giorni'} di preavviso.`)
  }
  let oraMinima = Number.isFinite(vincoli.oraMinima) ? Math.max(0, Number(vincoli.oraMinima)) * 60 : 0
  // ⭐ Il partner che prepara un prodotto unico: chiuso quel giorno (o già chiuso
  // per oggi) → il giorno si spegne e si dice chi; aperto → la sua ora di
  // apertura (arrotondata all'ora piena, come fa Merchandising) alza l'orario
  // minimo delle fasce di quel giorno.
  for (const pr of vincoli.prodotti ?? []) {
    const g = (pr.calendario ?? []).find((x) => x.data === iso)
    if (!g) continue
    const chi = pr.partner ? `«${pr.partner}»` : 'Il partner'
    const cosa = pr.nome ? ` («${pr.nome}»)` : pr.codice ? ` (${pr.codice})` : ''
    const giaChiuso = quando === 'oggi' && !!g.alle && oraValida(g.alle) && adesso.minuti >= minuti(g.alle)
    if (!g.aperto || giaChiuso) {
      return vuoto(
        g.origine === 'chiuso-per-oggi' || giaChiuso
          ? `${chi}, che prepara questo prodotto${cosa}, ha già chiuso per oggi: si ordina da domani.`
          : `${chi}, che prepara questo prodotto${cosa}, è chiuso ${scriviDataBreve(iso)}.`
      )
    }
    if (g.dalle && oraValida(g.dalle)) oraMinima = Math.max(oraMinima, Math.ceil(minuti(g.dalle) / 60) * 60)
  }
  // Il drop-off: da quest'ora gli ordini arrivano solo dal giorno dopo.
  const dopoLimite = adesso.minuti >= minuti(r.oggi.limiteOra)
  // La soglia da cui domani perde le prime fasce (Flowers: 22:00, non il drop-off delle 16).
  const dopoSoglia = adesso.minuti >= minuti(r.domani.saltaDopoOra || r.oggi.limiteOra)

  let fasce: Fascia[]
  const speciale = giornoSpeciale(dati, iso)
  if (speciale) {
    // ⭐ GIORNO CON FASCE SUE: valgono queste, non le regole. Per oggi restano
    // il drop-off (dopo quell'ora si ordina solo per domani) e il buon senso di
    // non proporre una fascia già cominciata; l'orario minimo del carrello e il
    // partner si applicano come a ogni altro giorno, qui sotto.
    if (quando === 'oggi' && dopoLimite) return vuoto(`Per oggi non si ordina più dopo le ${r.oggi.limiteOra.replace(/^0/, '')} (orario di drop-off): si consegna da domani.`)
    fasce = quando === 'oggi' ? speciale.fasce.filter((f) => minuti(f.da) > adesso.minuti) : [...speciale.fasce]
  } else if (quando === 'oggi') {
    if (!r.oggi.attivo) return vuoto('Questo negozio non consegna in giornata.')
    if (dopoLimite) return vuoto(`Per oggi non si ordina più dopo le ${r.oggi.limiteOra.replace(/^0/, '')} (orario di drop-off): si consegna da domani.`)
    const tutte = fasceIntere(r, r.oggi.durataOre)
    const passo = r.oggi.durataOre * 60
    if (adesso.minuti < minuti(r.finestraDa)) {
      // ⚠️ Di NOTTE (prima dell'apertura) l'anticipo si misura da quando qualcuno
      // lavora, non da quando il cliente clicca: alle 03:00 e alle 07:00 il
      // negozio vede l'ordine alle 08:00 all'apertura, e la prima fascia deve
      // essere la stessa — `notteDalle` (architetto UX, 10/09/2026, punto B).
      fasce = tutte.filter((f) => minuti(f.da) >= minuti(r.oggi.notteDalle))
    } else {
      const inCorso = Math.floor((adesso.minuti - minuti(r.finestraDa)) / passo)
      const prima = inCorso + r.oggi.saltaFasce
      fasce = tutte.filter((_, i) => i >= prima)
      if (!fasce.length && r.oggi.ultimaFasciaFinoAlLimite && tutte.length) fasce = [tutte[tutte.length - 1]]
    }
  } else if (quando === 'domani') {
    // La griglia parte dall'orario minimo del carrello (utente, 10/09 sera):
    // prodotto disponibile dalle 9 → dalle 9, non da una griglia fissa.
    const da = Math.max(minuti(r.finestraDa), oraMinima)
    const primaOre = r.domani.primaFasciaOre * 60
    if (dopoSoglia && primaOre > 0 && da + primaOre <= minuti(r.finestraA)) {
      // Dopo la soglia (deluxy.it: le 20) la PRIMA fascia di domani è lunga
      // (2 ore: 08-10), le restanti tornano della durata normale (10-11, 11-12…).
      fasce = [{ da: hhmm(da), a: hhmm(da + primaOre) }, ...fasceIntere(r, r.domani.durataOre, da + primaOre)]
    } else {
      const tutte = fasceIntere(r, r.domani.durataOre, da)
      fasce = dopoSoglia ? tutte.slice(r.domani.dopoLimiteSaltaFasce) : tutte
    }
  } else {
    fasce = fasceIntere(r, r.oltre.durataOre, oraMinima)
  }
  if (oraMinima) fasce = fasce.filter((f) => minuti(f.da) >= oraMinima)
  if (!fasce.length) {
    return vuoto(
      quando === 'oggi'
        ? 'Per oggi non resta nessuna fascia: si consegna da domani.'
        : oraMinima
          ? `Nessuna fascia dopo le ${hhmm(oraMinima).replace(/^0/, '')} in questa giornata.`
          : 'Nessuna fascia in questa giornata.'
    )
  }
  return { data: iso, ok: true, motivo: '', fasce, etichette: fasce.map(etichettaFascia), quando, ...(speciale ? { speciale: true } : {}) }
}

/**
 * IL CALENDARIO per i siti e per l'anteprima: i prossimi N giorni, ognuno con
 * l'esito e le sue fasce. È quello che il tema Shopify riceve e da cui
 * costruisce data (giorni spenti) e tendina delle fasce.
 */
export function calendarioConsegna(dati: OrarioNegozioDati, adesso: Adesso = adessoRoma(), vincoli: VincoliCarrello = {}, giorni: number = dati.regole.giorniMostrati): EsitoGiorno[] {
  const n = Math.max(1, Math.min(366, Math.floor(giorni)))
  const esiti: EsitoGiorno[] = []
  for (let i = 0; i < n; i++) esiti.push(fasceDelGiorno(dati, piuGiorniIso(adesso.data, i), adesso, vincoli))
  return esiti
}

/** I prossimi N giorni con il solo esito sul GIORNO (senza fasce), per l'anteprima in pagina. */
export function prossimiGiorni(dati: OrarioNegozioDati, n: number, da: string = adessoRoma().data): { data: string; ok: boolean; motivo: string }[] {
  const esiti: { data: string; ok: boolean; motivo: string }[] = []
  for (let i = 0; i < n; i++) {
    const iso = piuGiorniIso(da, i)
    esiti.push({ data: iso, ...giornoSelezionabile(dati, iso, da) })
  }
  return esiti
}

/** Il primo giorno in cui si può consegnare, da oggi in avanti (entro un anno; null se non c'è). */
export function primoGiornoAperto(dati: OrarioNegozioDati, da: string = adessoRoma().data): string | null {
  return prossimiGiorni(dati, 366, da).find((e) => e.ok)?.data ?? null
}
