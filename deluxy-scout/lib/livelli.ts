// I livelli commerciali di un negozio (decisione utente 23/07/2026).
// Una sola scala, valida in tutta l'app, DERIVATA dai dati che già abbiamo —
// non un campo in più da tenere aggiornato a mano.
//
//   PROSPECT  potenzialmente interessante: qualcuno l'ha scelto (⭐ / bottone +)
//             ma non l'abbiamo ancora contattato.
//   LEAD      il contatto è avviato: visita fatta, chiamata registrata,
//             richiesta web presa in carico, trattativa aperta.
//   CLIENTE   ha chiuso una trattativa: ha comprato.
//   DORMIENTE ha lavorato con noi ma il rapporto si è fermato (nel registro
//             Anagrafiche è "dismesso"). Non è un perso: ci conosce già, ed è
//             la lista più redditizia da riattivare.
//   PERSO     chiuso senza esito, o non target.
//
// Sopra ai livelli restano le TRATTATIVE: sono le conversazioni in corso su un
// lead, con valore e scadenza. Il livello dice "a che punto è il rapporto",
// la trattativa "cosa ci stiamo giocando".

import type { Place } from '@/types';

export type Livello = 'prospect' | 'lead' | 'cliente' | 'dormiente' | 'perso';

/** L'ordine in cui mostrarli: il funnel, poi chi è uscito. */
export const LIVELLI: Livello[] = ['prospect', 'lead', 'cliente', 'dormiente', 'perso'];

// Etichette nel linguaggio del team (24/07/2026): "Selezionato" = scelto con la
// stella ma mai contattato; "Prospect" = sentito o visitato (contatto avviato).
export const LABEL_LIVELLO: Record<Livello, string> = {
  prospect: 'Selezionato',
  lead: 'Prospect',
  cliente: 'Cliente',
  dormiente: 'Dormiente',
  perso: 'Perso',
};

export const AIUTO_LIVELLO: Record<Livello, string> = {
  prospect: 'Potenzialmente interessante: da contattare.',
  lead: 'Contatto avviato: è iniziato il rapporto.',
  cliente: 'Ha chiuso una trattativa: ha comprato.',
  dormiente: 'Ha lavorato con noi, poi si è fermato: da riattivare.',
  perso: 'Chiuso senza esito o non in target.',
};

// Stati del registro Anagrafiche che significano "il contatto è già avviato".
const REGISTRO_CONTATTATO = new Set(['in_contatto', 'in_attesa', 'in_trattativa', 'da_ricontattare']);

/**
 * Il livello di un negozio. `contattato` serve quando chi chiama sa già che
 * esiste una visita/chiamata/trattativa per quel negozio (in genere lo si
 * calcola una volta sola per tutta la lista, non per riga).
 */
export function livelloDi(p: Place, contattato = false): Livello {
  // "dismesso" nel registro = rapporto interrotto, non trattativa persa: viene
  // prima di tutto, perché chi ci ha già lavorato non va confuso con un perso.
  if (p.anagrafiche_stato === 'dismesso') return 'dormiente';
  if (p.stato === 'cliente' || p.anagrafiche_stato === 'attivo') return 'cliente';
  if (p.stato === 'perso' || p.anagrafiche_stato === 'non_interessato') return 'perso';
  if (
    contattato ||
    p.stato === 'visitato' ||
    p.hubspot_deal_aperta ||
    (p.anagrafiche_stato && REGISTRO_CONTATTATO.has(p.anagrafiche_stato))
  ) {
    return 'lead';
  }
  return 'prospect';
}

/** Colore del badge: coerente col resto dell'app (verde chiuso, blu in corso). */
export function coloreLivello(l: Livello): string {
  switch (l) {
    case 'cliente':
      return '#2F7D46';
    case 'lead':
      return '#1F6FEB';
    case 'dormiente':
      return '#B7791F';
    case 'perso':
      return '#B3261E';
    default:
      return '#8A8A8E';
  }
}
