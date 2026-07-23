// INVITI RICEVUTI (iCalendar in arrivo).
//
// Outlook, Google e gli altri mandano gli appuntamenti come parte
// `text/calendar` (METHOD:REQUEST) allegata alla mail. Qui si legge quella
// parte — in modo DETERMINISTICO, senza AI: una data non si indovina — e si
// prepara la risposta RSVP (METHOD:REPLY) che l'organizzatore si aspetta.

export type InvitoRicevuto = {
  /** REQUEST (invito), CANCEL (annullato), REPLY (risposta altrui). */
  metodo: string
  uid: string
  titolo: string
  /** Istanti veri (UTC). */
  inizio: Date
  fine: Date | null
  giornataIntera: boolean
  luogo: string
  descrizione: string
  organizzatoreNome: string
  organizzatoreEmail: string
  /** Il testo iCal originale: serve a costruire la risposta. */
  sorgente: string
}

/** Toglie il "folding" (le righe iCal spezzate a 75 caratteri). */
function srotola(ics: string): string[] {
  const righe = ics.replace(/\r\n/g, '\n').split('\n')
  const fuori: string[] = []
  for (const r of righe) {
    if ((r.startsWith(' ') || r.startsWith('\t')) && fuori.length > 0) {
      fuori[fuori.length - 1] += r.slice(1)
    } else {
      fuori.push(r)
    }
  }
  return fuori
}

/** Il valore di un campo, con i caratteri protetti riportati com'erano. */
function valore(riga: string): string {
  const i = riga.indexOf(':')
  return i === -1
    ? ''
    : riga
        .slice(i + 1)
        .replace(/\\n/gi, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\')
}

/** I parametri di una riga (es. TZID, CN, VALUE). */
function parametri(riga: string): Record<string, string> {
  const i = riga.indexOf(':')
  const testa = i === -1 ? riga : riga.slice(0, i)
  const out: Record<string, string> = {}
  for (const p of testa.split(';').slice(1)) {
    const [k, ...v] = p.split('=')
    if (k) out[k.toUpperCase()] = v.join('=').replace(/^"|"$/g, '')
  }
  return out
}

/**
 * Data iCal → istante. Tre forme: `…Z` (UTC), `YYYYMMDD` (giornata intera),
 * `YYYYMMDDTHHMMSS` con TZID (ora locale di quel fuso).
 *
 * ⚠️ Per il fuso si usa il formatter di sistema, non conti a mano: l'ora legale
 * cambia da mese a mese e sbagliarla sposterebbe gli appuntamenti di un'ora.
 */
function dataDaIcs(riga: string): { quando: Date | null; giornataIntera: boolean } {
  const v = valore(riga).trim()
  const par = parametri(riga)
  if (/^\d{8}$/.test(v)) {
    return { quando: new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00Z`), giornataIntera: true }
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return { quando: null, giornataIntera: false }
  const [, Y, M, G, h, min, s, zulu] = m
  const comeUtc = Date.UTC(+Y, +M - 1, +G, +h, +min, +s)
  if (zulu) return { quando: new Date(comeUtc), giornataIntera: false }

  const fuso = par.TZID || 'Europe/Rome'
  try {
    const inFuso = new Date(comeUtc).toLocaleString('en-US', { timeZone: fuso })
    const scarto = comeUtc - new Date(`${inFuso} UTC`).getTime()
    return { quando: new Date(comeUtc + scarto), giornataIntera: false }
  } catch {
    // Fuso sconosciuto: si tratta come ora italiana (il caso normale qui).
    const inRoma = new Date(comeUtc).toLocaleString('en-US', { timeZone: 'Europe/Rome' })
    const scarto = comeUtc - new Date(`${inRoma} UTC`).getTime()
    return { quando: new Date(comeUtc + scarto), giornataIntera: false }
  }
}

const emailDa = (riga: string) => valore(riga).replace(/^mailto:/i, '').trim().toLowerCase()

/** Legge un testo iCalendar e ne ricava l'invito. null se non è un invito. */
export function leggiIcs(ics: string): InvitoRicevuto | null {
  if (!/BEGIN:VEVENT/i.test(ics)) return null
  const righe = srotola(ics)

  let metodo = 'REQUEST'
  let uid = ''
  let titolo = ''
  let luogo = ''
  let descrizione = ''
  let organizzatoreEmail = ''
  let organizzatoreNome = ''
  let inizio: Date | null = null
  let fine: Date | null = null
  let giornataIntera = false

  let dentroEvento = false
  for (const r of righe) {
    const nome = r.split(/[;:]/)[0].toUpperCase()
    if (nome === 'BEGIN' && /VEVENT/i.test(r)) dentroEvento = true
    else if (nome === 'END' && /VEVENT/i.test(r)) dentroEvento = false
    else if (nome === 'METHOD') metodo = valore(r).trim().toUpperCase()
    else if (dentroEvento) {
      if (nome === 'UID') uid = valore(r).trim()
      else if (nome === 'SUMMARY') titolo = valore(r).trim()
      else if (nome === 'LOCATION') luogo = valore(r).trim()
      else if (nome === 'DESCRIPTION') descrizione = valore(r).trim()
      else if (nome === 'ORGANIZER') {
        organizzatoreEmail = emailDa(r)
        organizzatoreNome = parametri(r).CN || ''
      } else if (nome === 'DTSTART') {
        const d = dataDaIcs(r)
        inizio = d.quando
        giornataIntera = d.giornataIntera
      } else if (nome === 'DTEND') {
        fine = dataDaIcs(r).quando
      }
    }
  }

  if (!inizio) return null
  return {
    metodo,
    uid,
    titolo: titolo || '(senza titolo)',
    inizio,
    fine,
    giornataIntera,
    luogo,
    descrizione: descrizione.slice(0, 2000),
    organizzatoreNome,
    organizzatoreEmail,
    sorgente: ics,
  }
}

/**
 * La RISPOSTA all'invito (METHOD:REPLY): è quello che fa aggiornare lo stato
 * del partecipante nel calendario di chi ha invitato. Si rimanda lo stesso UID
 * con il proprio PARTSTAT.
 */
export function rispostaIcs(
  invito: InvitoRicevuto,
  chiRisponde: { nome: string; email: string },
  stato: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE'
): string {
  const dataOra = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const testo = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

  const righe = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Deluxy//AI Mail//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${invito.uid}`,
    `DTSTAMP:${dataOra(new Date())}`,
    `DTSTART:${dataOra(invito.inizio)}`,
    ...(invito.fine ? [`DTEND:${dataOra(invito.fine)}`] : []),
    `SUMMARY:${testo(invito.titolo)}`,
    `ORGANIZER:mailto:${invito.organizzatoreEmail}`,
    `ATTENDEE;PARTSTAT=${stato};CN=${testo(chiRisponde.nome || chiRisponde.email)}:mailto:${chiRisponde.email}`,
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return righe.join('\r\n') + '\r\n'
}

export const PAROLE_RISPOSTA: Record<'ACCEPTED' | 'DECLINED' | 'TENTATIVE', string> = {
  ACCEPTED: 'Accettato',
  DECLINED: 'Rifiutato',
  TENTATIVE: 'Forse',
}
