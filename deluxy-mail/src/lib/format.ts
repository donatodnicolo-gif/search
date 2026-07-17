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

/** Token semantico del design system per una priorità. */
export function coloreDiPriorita(priorita: string | null): string {
  if (priorita === 'alta') return 'orange'
  if (priorita === 'bassa') return 'neutral'
  return 'blue'
}
