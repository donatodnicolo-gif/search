// GLI STATI DI UNA VENDITA NELLA PIATTAFORMA CONSEGNE — solo parole, niente rete.
//
// ⚠️⚠️ Questo file NON importa `impostazioni` (che decifra le chiavi con
// `node:crypto`) né `db`: lo usa la scheda dell'ordine, che è un componente
// client. Importare di là il client di rete faceva fallire il build con
// «Reading from "node:crypto" is not handled by plugins» — un errore che non
// nomina il vero colpevole, ed è per questo che le due cose stanno separate.

/**
 * Gli stati in cui l'ordine è **nelle mani dell'app**.
 *
 * ⚠️ `da_gestire` no: la vendita esiste di là ma non è stata proposta a nessuno,
 * e dire «In App» fermerebbe il nostro lavoro senza che stia succedendo niente.
 * ⚠️ `non_accettata` e `annullata` nemmeno: quelle **tornano a noi**, ed è il
 * momento in cui bisogna accorgersene.
 */
export const STATI_IN_APP = ['proposta', 'accettata']

export function eInApp(stato: string): boolean {
  return STATI_IN_APP.includes((stato ?? '').trim())
}

/** Come si dice a schermo lo stato della vendita. */
export function nomeStatoVendita(stato: string): string {
  switch ((stato ?? '').trim()) {
    case 'da_gestire':
      return 'in piattaforma, non ancora proposto'
    case 'proposta':
      return 'proposto a un partner'
    case 'accettata':
      return 'accettato dal partner'
    case 'non_accettata':
      return 'nessun partner l’ha preso'
    case 'annullata':
      return 'annullato in piattaforma'
    default:
      return stato || 'stato sconosciuto'
  }
}
