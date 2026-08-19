// I fornitori del registro che stanno NELLA PROVINCIA DI CONSEGNA.
//
// A cosa serve: un ordine si può far preparare da un fornitore vicino a chi
// riceve, invece di spedire. Finora la domanda «chi c'è a Firenze che sa fare
// una millefoglie?» si faceva con Ricerca fornitori, che cerca su Google —
// utile per chi non conosciamo, ma i partner con cui lavoriamo già sono scritti
// nel registro Anagrafiche e non venivano mai proposti.
//
// ⚠️ Qui non si tiene NESSUNA copia: si chiede al registro ogni volta (regola
// di deluxy-anagrafiche). Un partner disattivato là sparisce subito anche di
// qui, e non si scrive a un'insegna che non lavora più con noi.

import { partnerAttivi, type Partner } from './anagrafiche'
import { siglaProvincia } from './province'

/** Che mestiere serve per questo ordine. */
export type Mestiere = 'pasticceria' | 'fioraio'

/**
 * Le categorie del registro che valgono per ogni mestiere.
 *
 * ⚠️ Sono DUE e TRE parole diverse per la stessa cosa, contate nel registro:
 * i fiorai stanno sotto «FIORISTA» (11) *e* «FIORI» (5), le pasticcerie sotto
 * «PASTICCERIA» (9) e «CIOCCOLATERIA» (3). Guardando una sola parola si
 * perderebbe un terzo dei fornitori senza che la lista sembri incompleta.
 */
const CATEGORIE: Record<Mestiere, string[]> = {
  pasticceria: ['PASTICCERIA', 'CIOCCOLATERIA', 'PASTICCERIE', 'CAKE'],
  fioraio: ['FIORISTA', 'FIORI', 'FIORAIO', 'FIORISTI'],
}

/**
 * Il mestiere che serve, dedotto dal NEGOZIO dell'ordine.
 *
 * Cake Design vende torte, Flowers vende fiori: è il segnale più affidabile che
 * abbiamo, e non richiede di leggere il nome del prodotto. ⚠️ Se il negozio non
 * dice niente (Deluxy, che vende di tutto) si torna `null` e si mostrano
 * **entrambi** i mestieri: meglio una lista più lunga che una lista sbagliata.
 */
export function mestierePerNegozio(negozio: string): Mestiere | null {
  const n = (negozio || '').toUpperCase()
  if (n.includes('CAKE') || n.includes('PASTICC')) return 'pasticceria'
  if (n.includes('FLOWER') || n.includes('FIOR')) return 'fioraio'
  return null
}

export type FornitoreZona = Partner & {
  /** Il numero da usare: il suo, oppure quello di un referente. */
  telefonoUtile: string
  /** L'indirizzo email da usare: la sua, oppure quella di un referente. */
  emailUtile: string
  /** Da chi arriva il recapito, quando non è dell'insegna ma di una persona. */
  recapitoDa: string
}

/**
 * Il recapito con cui si può davvero scrivere.
 *
 * ⚠️ MISURATO nel registro: dei partner attivi molti **non hanno un telefono
 * proprio**, ma hanno un referente che ce l'ha. Guardando solo i campi
 * dell'insegna, la metà dei fornitori risulterebbe irraggiungibile pur avendo
 * un numero scritto due righe sotto.
 */
function recapiti(p: Partner): { telefono: string; email: string; da: string } {
  if (p.telefono || p.email) return { telefono: p.telefono, email: p.email, da: '' }
  const conNumero = p.contatti.find((c) => c.telefono || c.email)
  if (!conNumero) return { telefono: '', email: '', da: '' }
  return {
    telefono: conNumero.telefono,
    email: conNumero.email,
    da: conNumero.nome || conNumero.ruolo || 'referente',
  }
}

export type EsitoZona =
  | { stato: 'ok'; fornitori: FornitoreZona[]; provincia: string }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

/**
 * I fornitori attivi in quella provincia, per quel mestiere.
 *
 * `mestiere` null = tutti i mestieri utili (pasticceria + fiori).
 */
export async function fornitoriInZona(
  provincia: string,
  mestiere: Mestiere | null
): Promise<EsitoZona> {
  const sigla = siglaProvincia(provincia)
  if (!sigla) return { stato: 'ok', fornitori: [], provincia: '' }

  // Il registro filtra per città, non per provincia: si prende l'elenco attivo
  // (una cinquantina di righe) e si filtra qui. Con numeri diversi servirebbe
  // un filtro lato registro — è scritto qui perché è il punto in cui
  // accorgersene.
  const esito = await partnerAttivi({ perPagina: 200 })
  if (esito.stato !== 'ok') return esito

  const categorie = mestiere
    ? CATEGORIE[mestiere]
    : [...CATEGORIE.pasticceria, ...CATEGORIE.fioraio]

  const fornitori = esito.partner
    .filter((p) => siglaProvincia(p.provincia || p.citta) === sigla)
    .filter((p) => {
      const c = (p.categoria || '').toUpperCase()
      return categorie.some((k) => c.includes(k))
    })
    .map((p) => {
      const r = recapiti(p)
      return { ...p, telefonoUtile: r.telefono, emailUtile: r.email, recapitoDa: r.da }
    })
    // Prima chi si può contattare: un fornitore senza recapiti non è un
    // candidato, è una riga da leggere e saltare.
    .sort((a, b) => Number(!!(b.telefonoUtile || b.emailUtile)) - Number(!!(a.telefonoUtile || a.emailUtile)))

  return { stato: 'ok', fornitori, provincia: sigla }
}
