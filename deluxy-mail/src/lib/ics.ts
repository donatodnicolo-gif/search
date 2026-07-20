// Feed iCalendar (RFC 5545) del calendario: è il formato che Google Calendar,
// Apple Calendar e Outlook sanno leggere in abbonamento ("da URL"). Solo
// lettura: chi ha il link vede gli appuntamenti, non li può modificare.

import type { Evento } from '@prisma/client'

/** AAAAMMGGTHHMMSSZ in UTC, come vuole lo standard. */
function dataOra(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Solo la data (per gli eventi di giornata intera). */
function soloData(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/** Il testo di un campo iCal: niente a capo nudi, virgole e punti e virgola escapati. */
function testoIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Le righe iCal vanno spezzate a 75 byte con continuazione " " (folding). */
function piega(riga: string): string {
  if (riga.length <= 74) return riga
  const pezzi: string[] = []
  let resto = riga
  while (resto.length > 74) {
    pezzi.push(resto.slice(0, 74))
    resto = ' ' + resto.slice(74)
  }
  pezzi.push(resto)
  return pezzi.join('\r\n')
}

export function calendarioIcs(eventi: Evento[], nomeUtente: string): string {
  const righe: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Deluxy//AI Mail//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    piega(`X-WR-CALNAME:${testoIcs(`AI Mail — ${nomeUtente}`)}`),
    'X-WR-TIMEZONE:Europe/Rome',
  ]

  for (const e of eventi) {
    righe.push('BEGIN:VEVENT')
    righe.push(piega(`UID:${e.id}@deluxy-mail`))
    righe.push(`DTSTAMP:${dataOra(e.aggiornatoIl)}`)
    if (e.giornataIntera) {
      righe.push(`DTSTART;VALUE=DATE:${soloData(e.inizio)}`)
      // Per iCal la fine di un evento di giornata intera è ESCLUSIVA: il
      // giorno dopo l'ultimo giorno dell'evento.
      const fine = new Date((e.fine ?? e.inizio).getTime() + 24 * 60 * 60 * 1000)
      righe.push(`DTEND;VALUE=DATE:${soloData(fine)}`)
    } else {
      righe.push(`DTSTART:${dataOra(e.inizio)}`)
      // Senza fine dichiarata: un'ora, la durata di cortesia di ogni agenda.
      righe.push(`DTEND:${dataOra(e.fine ?? new Date(e.inizio.getTime() + 60 * 60 * 1000))}`)
    }
    righe.push(piega(`SUMMARY:${testoIcs(e.titolo)}`))
    if (e.luogo) righe.push(piega(`LOCATION:${testoIcs(e.luogo)}`))
    if (e.descrizione) righe.push(piega(`DESCRIPTION:${testoIcs(e.descrizione)}`))
    righe.push('END:VEVENT')
  }

  righe.push('END:VCALENDAR')
  return righe.join('\r\n') + '\r\n'
}
