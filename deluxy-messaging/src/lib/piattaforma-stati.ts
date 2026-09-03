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

/**
 * Come si dice a schermo lo stato della CONSEGNA (l'incarico al valet), che è
 * una cosa diversa dallo stato della vendita.
 *
 * ⚠️⚠️ Servono tutte e due: la vendita dice se un partner ha preso il lavoro,
 * la consegna dice a che punto è il giro. «Accettato dal partner» con la
 * consegna già `delivered` vuol dire che è finita; senza questa riga, dalla
 * scheda non si distingueva un ordine appena proposto da uno già consegnato.
 * Sono gli stati della piattaforma, scritti come li scrive lei.
 */
export function nomeStatoConsegna(stato: string): string {
  switch ((stato ?? '').trim()) {
    case 'created':
      return 'creata, senza valet'
    case 'assigned':
      return 'assegnata a un valet'
    case 'in_preparation':
      return 'in preparazione'
    case 'accepted':
      return 'presa dal valet'
    case 'in_delivery':
      return 'in consegna'
    case 'delivered':
      return 'consegnata'
    case 'not_delivered':
      return 'NON consegnata'
    case 'cancelled':
      return 'annullata'
    case 'not_accepted':
      return 'rifiutata dal valet'
    default:
      return stato || ''
  }
}
