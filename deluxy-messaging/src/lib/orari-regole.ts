// ⭐ ORARI NEGOZI — LE REGOLE, senza server (10/09/2026, richiesta dell'utente:
// «una sezione ORARI NEGOZI dove impostiamo per i negozi Shopify l'apertura del
// negozio — quindi se la data è selezionabile —, le fasce orarie di consegna
// con orario minimo e massimo, e i giorni di chiusura»).
//
// Questo file NON importa niente dal server: lo leggono la pagina Orari negozi,
// il modulo «Nuovo ordine» (client) e la lib che crea l'ordine (server). La
// regola che decide se una data si può scegliere è UNA, e sta qui — scritta in
// due posti sarebbe diversa in due posti (vedi la trappola «regola ricopiata»).
//
// Tre cose per negozio:
//  · i GIORNI APERTI della settimana (0 = domenica … 6 = sabato, come getDay());
//  · le FASCE orarie di consegna, ognuna con orario minimo («da») e massimo («a»);
//  · i GIORNI DI CHIUSURA: una data, il motivo, e «ogni anno» per le feste fisse.
//
// ⚠️ La chiusura vince sull'apertura: un martedì di Natale è chiuso.
// ⚠️ Le date si confrontano come stringhe `AAAA-MM-GG`, mai come Date: il
// server gira in UTC e alle 23:30 italiane «oggi» sarebbe già domani.

export type Fascia = { da: string; a: string }
export type GiornoChiusura = { data: string; motivo: string; ogniAnno: boolean }
export type OrarioNegozioDati = {
  /** I giorni aperti, 0..6 (0 = domenica). */
  giorniApertura: number[]
  fasce: Fascia[]
  giorniChiusura: GiornoChiusura[]
  nota: string
}

export const NOMI_GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
export const NOMI_GIORNI_CORTI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
/** L'ordine in cui si mostrano: da lunedì a domenica. */
export const GIORNI_IN_ORDINE = [1, 2, 3, 4, 5, 6, 0]

/**
 * Il PUNTO DI PARTENZA per un negozio che non ha ancora una riga: aperto tutti
 * i giorni, le tre fasce ampie che i siti mandano davvero (misurate il
 * 02/09/2026 sugli ordini: 08-12, 12-16, 16-20), nessuna chiusura.
 *
 * ⚠️⚠️ NON è una regola: finché nessuno salva, il negozio NON ha orari e le
 * date non si bloccano (né in Nuovo ordine né in creaOrdine). Un default
 * «lun–sab» avrebbe chiuso la domenica a tutti i negozi senza che nessuno lo
 * avesse deciso — la trappola del default che si spaccia per decisione. Questo
 * oggetto serve solo a riempire la scheda la prima volta che la si apre.
 */
export const ORARIO_PREDEFINITO: OrarioNegozioDati = {
  giorniApertura: [0, 1, 2, 3, 4, 5, 6],
  fasce: [
    { da: '08:00', a: '12:00' },
    { da: '12:00', a: '16:00' },
    { da: '16:00', a: '20:00' },
  ],
  giorniChiusura: [],
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
function minuti(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Una copia del predefinito, per non farsi modificare l'originale da chi la riceve. */
export function orarioPredefinito(): OrarioNegozioDati {
  return {
    giorniApertura: [...ORARIO_PREDEFINITO.giorniApertura],
    fasce: ORARIO_PREDEFINITO.fasce.map((f) => ({ ...f })),
    giorniChiusura: [],
    nota: '',
  }
}

/**
 * Legge quello che c'è in tabella (le colonne di testo) e lo rende dati puliti.
 * Un JSON rotto non fa cadere la pagina: quella parte torna vuota, e si dice.
 */
export function leggiOrario(
  riga: { giorniApertura: string; fasce: string; giorniChiusura: string; nota: string } | null | undefined
): OrarioNegozioDati {
  if (!riga) return orarioPredefinito()
  const giorni = riga.giorniApertura
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  let fasce: Fascia[] = []
  try {
    const grezzo: unknown = JSON.parse(riga.fasce || '[]')
    if (Array.isArray(grezzo)) {
      fasce = grezzo
        .filter((f) => f && oraValida(String(f.da)) && oraValida(String(f.a)))
        .map((f) => ({ da: String(f.da), a: String(f.a) }))
    }
  } catch {
    fasce = []
  }
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
  return { giorniApertura: [...new Set(giorni)].sort(), fasce, giorniChiusura: chiusure, nota: riga.nota ?? '' }
}

/**
 * Controlla quello che arriva dal modulo prima di scriverlo. Torna gli errori
 * a parole (per l'operatore) e, se non ce ne sono, i dati puliti e ordinati.
 *
 * ⚠️ Zero giorni aperti si RIFIUTA: un negozio sempre chiuso non è una
 * configurazione, è un errore di click — e bloccherebbe ogni ordine.
 * ⚠️ Zero fasce invece si accetta: vuol dire «nessuna fascia da proporre», e il
 * modulo Nuovo ordine torna alle sue voci storiche.
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

  const fasce: Fascia[] = []
  if (o.fasce !== undefined && !Array.isArray(o.fasce)) errori.push('Le fasce orarie non sono leggibili.')
  for (const [i, f] of (Array.isArray(o.fasce) ? o.fasce : []).entries()) {
    const da = String((f as Fascia)?.da ?? '').trim()
    const a = String((f as Fascia)?.a ?? '').trim()
    if (!oraValida(da) || !oraValida(a)) {
      errori.push(`Fascia ${i + 1}: scrivi orario minimo e massimo come HH:MM (es. 08:00).`)
      continue
    }
    if (minuti(a) <= minuti(da)) {
      errori.push(`Fascia ${i + 1}: l'orario massimo (${a}) deve venire dopo il minimo (${da}).`)
      continue
    }
    fasce.push({ da, a })
  }
  fasce.sort((x, y) => minuti(x.da) - minuti(y.da) || minuti(x.a) - minuti(y.a))
  for (let i = 1; i < fasce.length; i++) {
    if (fasce[i].da === fasce[i - 1].da && fasce[i].a === fasce[i - 1].a) {
      errori.push(`La fascia ${etichettaFascia(fasce[i])} è scritta due volte.`)
    }
  }

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

  const nota = String(o.nota ?? '').trim().slice(0, 500)
  if (errori.length) return { ok: false, errori }
  return { ok: true, dati: { giorniApertura: giorni, fasce, giorniChiusura: chiusure, nota } }
}

/**
 * La fascia come la scrivono i siti negli ordini («08-12», «16-20»): sulle ore
 * piene si tolgono i minuti, così coincide con quello che c'è già negli attributi
 * `Fascia_Oraria_Consegna` e con le voci storiche di fasce-consegna.ts.
 */
export function etichettaFascia(f: Fascia): string {
  const corta = (s: string) => (s.endsWith(':00') ? s.slice(0, 2) : s)
  return `${corta(f.da)}-${corta(f.a)}`
}
export function etichetteFasce(dati: OrarioNegozioDati): string[] {
  return dati.fasce.map(etichettaFascia)
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

/** «Oggi» come `AAAA-MM-GG` nel fuso di chi chiama (sul server: UTC — vedi la trappola dei periodi). */
export function oggiIso(oggi: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${oggi.getFullYear()}-${p(oggi.getMonth() + 1)}-${p(oggi.getDate())}`
}

/**
 * LA REGOLA: questa data si può scegliere per questo negozio?
 *
 * Tre esiti, sempre a parole: passata · chiuso (data, con il motivo) · chiuso
 * (giorno della settimana). Chi la chiama mostra il motivo, non un «no».
 */
export function giornoSelezionabile(
  dati: OrarioNegozioDati,
  iso: string,
  oggi: string = oggiIso()
): { ok: boolean; motivo: string } {
  if (!dataValida(iso)) return { ok: false, motivo: 'La data non è leggibile.' }
  if (iso < oggi) return { ok: false, motivo: `${scriviDataBreve(iso)} è già passato.` }
  const chiusura = dati.giorniChiusura.find((c) => (c.ogniAnno ? c.data.slice(5) === iso.slice(5) : c.data === iso))
  if (chiusura) {
    return { ok: false, motivo: `Il negozio è chiuso ${scriviDataBreve(iso)}${chiusura.motivo ? ` (${chiusura.motivo})` : ''}.` }
  }
  const gs = giornoSettimana(iso)
  if (!dati.giorniApertura.includes(gs)) return { ok: false, motivo: `Il negozio è chiuso di ${NOMI_GIORNI[gs].toLowerCase()}.` }
  return { ok: true, motivo: '' }
}

/** I prossimi N giorni con l'esito, per l'anteprima nella pagina Orari negozi. */
export function prossimiGiorni(
  dati: OrarioNegozioDati,
  n: number,
  da: string = oggiIso()
): { data: string; ok: boolean; motivo: string }[] {
  const [a, m, g] = da.split('-').map(Number)
  const esiti: { data: string; ok: boolean; motivo: string }[] = []
  for (let i = 0; i < n; i++) {
    const iso = oggiIso(new Date(a, m - 1, g + i, 12))
    esiti.push({ data: iso, ...giornoSelezionabile(dati, iso, da) })
  }
  return esiti
}

/** Il primo giorno in cui si può consegnare, da oggi in avanti (entro un anno; null se non c'è). */
export function primoGiornoAperto(dati: OrarioNegozioDati, da: string = oggiIso()): string | null {
  return prossimiGiorni(dati, 366, da).find((e) => e.ok)?.data ?? null
}
