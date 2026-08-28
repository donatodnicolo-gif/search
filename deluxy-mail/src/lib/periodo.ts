import { FUSO } from './format'

/**
 * LE SCORCIATOIE DI PERIODO (Libro UX&UI v1.9 §8-bis): un parametro solo
 * (`periodo=mese|scorso|trimestre|anno`), non quattro date. Ogni pagina di
 * elenco lo traduce in un intervallo sulla SUA data (la data del messaggio,
 * dell'invio, dell'ultima modifica…: quale, lo dichiara la pagina).
 *
 * Semantica: mese = mese in corso; scorso = mese precedente; trimestre =
 * ultimi 3 mesi incluso il corrente; anno = anno solare corrente.
 */
export type Periodo = 'mese' | 'scorso' | 'trimestre' | 'anno'

export const PERIODI: { v: Periodo; l: string }[] = [
  { v: 'mese', l: 'Mese in corso' },
  { v: 'scorso', l: 'Mese scorso' },
  { v: 'trimestre', l: 'Trimestre' },
  { v: 'anno', l: 'Anno' },
]

/**
 * L'intervallo [gte, lt) del periodo chiesto, o null se il parametro non è
 * uno dei quattro (compreso il caso «nessun periodo»).
 *
 * ⚠️ «Oggi» si legge sul calendario di Roma, non su quello del server (che in
 * produzione vive in UTC): alle 00:30 del 1° del mese il server è ancora al
 * mese prima, e il «mese in corso» sarebbe quello sbagliato. I confini del
 * giorno restano nel fuso del server, come già fanno i filtri dal/al della
 * ricerca: sul bordo di mezzanotte si è larghi di un'ora o due, non di un mese.
 */
export function intervalloPeriodo(p?: string): { gte: Date; lt: Date } | null {
  if (p !== 'mese' && p !== 'scorso' && p !== 'trimestre' && p !== 'anno') return null
  // Anno e mese correnti secondo Roma (en-CA → ISO YYYY-MM-DD).
  const [anno, mese] = new Date()
    .toLocaleDateString('en-CA', { timeZone: FUSO })
    .split('-')
    .map(Number)
  // new Date(y, m, 1) riallinea da solo i mesi fuori scala (m = -1 → dicembre).
  const inizioMese = (scarto: number) => new Date(anno, mese - 1 + scarto, 1)
  switch (p) {
    case 'mese':
      return { gte: inizioMese(0), lt: inizioMese(1) }
    case 'scorso':
      return { gte: inizioMese(-1), lt: inizioMese(0) }
    case 'trimestre':
      return { gte: inizioMese(-2), lt: inizioMese(1) }
    case 'anno':
      return { gte: new Date(anno, 0, 1), lt: new Date(anno + 1, 0, 1) }
  }
}
