// Tutte le date si mostrano nel fuso di Roma. Senza questo, il server (Vercel
// gira in UTC) formatterebbe gli orari con 1-2 ore di scarto.
export const FUSO = 'Europe/Rome'

/** Il giorno "YYYY-MM-DD" di una data nel fuso di Roma, per confronti corretti
 *  anche a cavallo della mezzanotte. */
function giornoRoma(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: FUSO }) // en-CA → ISO YYYY-MM-DD
}

/** Data breve per la lista: oggi = ora, quest'anno = giorno/mese, altrimenti anno. */
export function dataBreve(d: Date): string {
  const ora = new Date()
  const gd = giornoRoma(d)
  if (gd === giornoRoma(ora)) {
    return d.toLocaleTimeString('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
  }
  if (gd.slice(0, 4) === giornoRoma(ora).slice(0, 4)) {
    return d.toLocaleDateString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short' })
  }
  return d.toLocaleDateString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short', year: 'numeric' })
}

export function dataLunga(d: Date): string {
  return d.toLocaleString('it-IT', {
    timeZone: FUSO,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function dataIso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : ''
}

/**
 * La scala di priorità di AI Mail, definita una volta sola: la usano i
 * pulsanti, i badge e il prompt dell'AI. Cambiarla qui la cambia ovunque.
 */
export const PRIORITA = [
  { codice: 'P0', etichetta: 'P0', quando: 'urgente', colore: 'red' },
  { codice: 'P1', etichetta: 'P1', quando: 'entro 24 ore', colore: 'orange' },
  { codice: 'P2', etichetta: 'P2', quando: 'entro la settimana', colore: 'blue' },
  { codice: 'P3', etichetta: 'P3', quando: 'appena si è liberi', colore: 'neutral' },
] as const

export type CodicePriorita = (typeof PRIORITA)[number]['codice']

export const CODICI_PRIORITA = PRIORITA.map((p) => p.codice)

export function priorita(codice: string | null) {
  return PRIORITA.find((p) => p.codice === codice) ?? null
}

/** Token semantico del design system per una priorità. */
export function coloreDiPriorita(codice: string | null): string {
  return priorita(codice)?.colore ?? 'neutral'
}
