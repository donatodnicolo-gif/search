/** Data breve per la lista: oggi = ora, quest'anno = giorno/mese, altrimenti anno. */
export function dataBreve(d: Date): string {
  const ora = new Date()
  const stessoGiorno = d.toDateString() === ora.toDateString()
  if (stessoGiorno) {
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  }
  if (d.getFullYear() === ora.getFullYear()) {
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  }
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function dataLunga(d: Date): string {
  return d.toLocaleString('it-IT', {
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
