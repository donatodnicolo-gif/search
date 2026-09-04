import { leggiImpostazione, salvaImpostazione } from './impostazioni'
import { siglaProvincia } from './province'

// IN CHE PROVINCIA STA QUESTO COMUNE — chiesto a Google una volta sola.
//
// ⚠️⚠️ NASCE DALLA SEGNALAZIONE DELL'UTENTE DEL 04/09/2026, sull'ordine #2867
// consegnato a **Genova**: «non capisco ancora perché mi escono fornitori di
// province che non sono Genova (da civico 95 in giù)». Sotto il titolo
// «Nessuno dei nostri risulta aver consegnato in provincia di GE. Questi
// lavorano con noi e **non si sa dove consegnano**» comparivano sei righe che
// dicevano benissimo dove avevano consegnato: Marnate, Galliate, Cadrezzate con
// Osmate, Porto Rotondo, Castellammare di Stabia.
//
// La contraddizione non era una svista di testo: la provincia si ricavava con
// `siglaProvincia`, che risponde **solo sui capoluoghi**. Marnate non è un
// capoluogo, quindi di quel fornitore «non si sapeva» dove consegna — e chi non
// si sa non si scarta, per la regola giusta del 29/08. Il risultato però era il
// contrario di quello che la regola voleva: l'elenco della provincia di Genova
// pieno di gente della provincia di Varese.
//
// ⚠️ Il dato mancava davvero: l'`indirizzo` di consegna — che la provincia la
// direbbe — sugli ordini con un fornitore è **vuoto su 79 su 80** (misurato il
// 04/09/2026: resta in Orders, per non tenerne due copie). L'unica cosa che
// c'è è il nome del comune.
//
// ⚠️⚠️ Quindi la provincia si CHIEDE, non si indovina: Google Geocoding
// risponde «Marnate → VA», ed è un fatto letto, non una deduzione. Le risposte
// si conservano in `Impostazione.comuniProvince`: un comune non cambia
// provincia, e la seconda volta non si paga più niente. Misurato: i comuni
// distinti da chiedere sono **74 in tutto l'archivio**.

/** La chiave in `Impostazione` dove sta il dizionario già imparato. */
const CHIAVE = 'comuniProvince'

/**
 * Quanti comuni nuovi si chiedono a Google in una sola apertura di scheda.
 *
 * ⚠️ C'è un tetto perché questo giro sta dentro la scheda di un ordine, e una
 * scheda che aspetta settanta chiamate non si apre. I comuni restanti si
 * imparano alla prossima apertura: l'elenco intanto è già più giusto di prima,
 * e nessun fornitore sparisce per un comune non ancora chiesto (chi non si sa
 * resta nella lista di chi non si sa, come prima).
 */
const TETTO_PER_GIRO = 12

/** Quante domande a Google contemporaneamente. */
const IN_PARALLELO = 4

/**
 * Valori speciali del dizionario, per non richiedere all'infinito quello che
 * Google ha già risposto:
 * · una sigla («VA») = comune italiano, provincia nota;
 * · `!` = Google lo trova ma **non è in Italia** (Cannes, Toronto);
 * · `?` = Google non sa dirlo (nomi come «Dimokratias 74 Malia, Crete»).
 */
const ESTERO = '!'
const IGNOTO = '?'

function normalizza(citta: string): string {
  return (citta ?? '').trim().toLowerCase()
}

async function leggiDizionario(): Promise<Record<string, string>> {
  const grezzo = await leggiImpostazione(CHIAVE)
  if (!grezzo) return {}
  try {
    const d = JSON.parse(grezzo) as unknown
    return d && typeof d === 'object' ? (d as Record<string, string>) : {}
  } catch {
    // ⚠️ Un dizionario illeggibile non deve fermare la scheda: si riparte da
    // vuoto e si riempie di nuovo. È una cache, non una fonte di verità.
    return {}
  }
}

/** Chiede a Google in che provincia sta un comune. Mai un'eccezione fuori. */
async function chiediAGoogle(citta: string, chiave: string): Promise<string> {
  try {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json?address=' +
      encodeURIComponent(citta) +
      `&language=it&key=${chiave}`
    const res = await fetch(url, { cache: 'no-store' })
    const d = (await res.json().catch(() => ({}))) as {
      status?: string
      results?: { address_components?: { short_name?: string; types?: string[] }[] }[]
    }
    if (d.status !== 'OK') return ''
    const parti = d.results?.[0]?.address_components ?? []
    const paese = parti.find((p) => (p.types ?? []).includes('country'))?.short_name ?? ''
    if (paese && paese.toUpperCase() !== 'IT') return ESTERO
    const prov = parti.find((p) => (p.types ?? []).includes('administrative_area_level_2'))
    // ⚠️ `siglaProvincia` normalizza anche le province soppresse (Google
    // risponde ancora «OT» per Porto Rotondo) e i nomi estesi.
    return siglaProvincia(prov?.short_name ?? '') || IGNOTO
  } catch {
    // ⚠️ Rete giù o chiave scaduta: torna vuoto e **non si scrive niente** nel
    // dizionario, così al prossimo giro si riprova. Un errore di rete non è
    // una risposta.
    return ''
  }
}

/**
 * La provincia di ognuno di questi comuni, per quel che se ne sa.
 *
 * Torna una mappa `comune minuscolo → sigla`. Un comune assente dalla mappa, o
 * con valore vuoto, vuol dire **non lo sappiamo** — e va trattato come tale:
 * non come «altrove».
 */
export async function provincePerComuni(citta: string[]): Promise<Record<string, string>> {
  const volute = [...new Set(citta.map(normalizza).filter(Boolean))]
  if (!volute.length) return {}

  const dizionario = await leggiDizionario()
  const mancanti = volute.filter((c) => !dizionario[c])
  const chiave = (await leggiImpostazione('googleMapsApiKey')).trim()

  if (mancanti.length && chiave) {
    const daChiedere = mancanti.slice(0, TETTO_PER_GIRO)
    const imparati: Record<string, string> = {}
    for (let i = 0; i < daChiedere.length; i += IN_PARALLELO) {
      const gruppo = daChiedere.slice(i, i + IN_PARALLELO)
      const esiti = await Promise.all(gruppo.map((c) => chiediAGoogle(c, chiave)))
      gruppo.forEach((c, j) => {
        if (esiti[j]) imparati[c] = esiti[j]
      })
    }
    if (Object.keys(imparati).length) {
      // ⚠️ Si rilegge PRIMA di scrivere: due schede aperte insieme imparano
      // comuni diversi, e chi salva per ultimo non deve cancellare l'altro.
      const adesso = await leggiDizionario()
      Object.assign(dizionario, imparati)
      await salvaImpostazione(CHIAVE, JSON.stringify({ ...adesso, ...imparati })).catch(() => {})
    }
  }

  const fuori: Record<string, string> = {}
  for (const c of volute) {
    const v = dizionario[c] ?? ''
    // `!` e `?` non sono province: da fuori si vedono come «non lo sappiamo».
    fuori[c] = v === ESTERO || v === IGNOTO ? '' : v
  }
  return fuori
}
