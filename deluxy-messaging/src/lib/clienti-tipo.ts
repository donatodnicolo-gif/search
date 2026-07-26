// Da che tipo di cliente arriva un ordine.
//
// I VALORI NON SI DECIDONO QUI. La tipologia è del registro Deluxy Orders: là si
// deduce dal nome dell'acquirente e un operatore può correggerla a mano
// (`TagCliente`), e da lì arriva già decisa dentro `cliente.tipo` dell'API. Qui
// ci sono solo i NOMI e i COLORI con cui mostrarla — cioè presentazione, non
// classificazione. Se in Orders nasce una tipologia nuova, un ordine che la
// porta si vede lo stesso: `nomeTipoCliente` restituisce il valore grezzo invece
// di nasconderlo.

export const TIPI_CLIENTE = [
  { chiave: 'privato', nome: 'Privato', colore: '#6e6e73' },
  { chiave: 'azienda', nome: 'Azienda', colore: '#0071e3' },
  { chiave: 'horeca', nome: 'Hotel / Ristorante', colore: '#248a3d' },
  { chiave: 'eventi', nome: 'Eventi / Wedding', colore: '#6d3fc4' },
  { chiave: 'rivenditore', nome: 'Rivenditore', colore: '#c93400' },
] as const

export type ChiaveTipoCliente = (typeof TIPI_CLIENTE)[number]['chiave']

/** Il nome leggibile; se il valore non lo conosciamo, si mostra com'è. */
export function nomeTipoCliente(chiave: string): string {
  return TIPI_CLIENTE.find((t) => t.chiave === chiave)?.nome ?? chiave
}

export function coloreTipoCliente(chiave: string): string {
  return TIPI_CLIENTE.find((t) => t.chiave === chiave)?.colore ?? '#6e6e73'
}

/**
 * Come dire all'operatore da dove viene il tipo. Una deduzione dal nome si può
 * smentire, la scelta di un collega no: mostrarlo evita che ci si fidi allo
 * stesso modo di due cose diverse.
 */
export function origineTipoCliente(da: string): string {
  if (da === 'manuale') return 'deciso a mano in Ordini'
  if (da === 'dedotta') return 'dedotto dal nome dell’acquirente'
  return ''
}
