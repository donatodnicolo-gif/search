// I livelli commerciali di un negozio (decisione utente 23/07/2026, ampliata il
// 27/07/2026 con LEAD). Una sola scala, valida in tutta l'app, DERIVATA dai dati
// che già abbiamo — non un campo in più da tenere aggiornato a mano.
//
//   SELEZIONATO qualcuno l'ha scelto — ⭐ dalla Mappa o dalle Affiliazioni,
//               oppure col bottone + — ma non gli è ancora stato detto niente.
//   LEAD        il contatto è stato AVVIATO: gli abbiamo scritto una mail,
//               l'abbiamo chiamato o siamo andati a trovarlo. Non sappiamo
//               ancora con chi parlare, ma la porta è stata bussata.
//   PROSPECT    c'è una persona in rubrica (o già nota da HubSpot): da lì si
//               riparte con nome e cognome.
//   CLIENTE     ha chiuso una trattativa: ha comprato.
//   DORMIENTE   ha lavorato con noi ma il rapporto si è fermato (nel registro
//               Anagrafiche è "dismesso"). Non è un perso: ci conosce già, ed è
//               la lista più redditizia da riattivare.
//   PERSO       chiuso senza esito, o non target.
//
// Sopra ai livelli restano le TRATTATIVE: sono le conversazioni in corso, con
// valore e scadenza. Il livello dice "a che punto è il rapporto", la trattativa
// "cosa ci stiamo giocando".
//
// ⚠️ Nomi: fino al 27/07/2026 gli identificatori interni erano sfasati rispetto
// alle etichette (`prospect` si mostrava come "Selezionato", `lead` come
// "Prospect"). Con l'arrivo del livello Lead vero lo sfasamento sarebbe
// diventato illeggibile: ora identificatore ed etichetta coincidono. I livelli
// NON sono salvati nel database — si ricalcolano ogni volta — quindi la
// rinomina non ha richiesto migrazioni.

import type { Place } from '@/types';

export type Livello = 'selezionato' | 'lead' | 'prospect' | 'cliente' | 'dormiente' | 'perso';

/** L'ordine in cui mostrarli: il funnel, poi chi è uscito. */
export const LIVELLI: Livello[] = ['selezionato', 'lead', 'prospect', 'cliente', 'dormiente', 'perso'];

export const LABEL_LIVELLO: Record<Livello, string> = {
  selezionato: 'Selezionato',
  lead: 'Lead',
  prospect: 'Prospect',
  cliente: 'Cliente',
  dormiente: 'Dormiente',
  perso: 'Perso',
};

export const AIUTO_LIVELLO: Record<Livello, string> = {
  selezionato: 'Potenzialmente interessante: da contattare.',
  lead: 'Gli abbiamo scritto, telefonato o siamo passati: aspetta una risposta.',
  prospect: 'C’è una persona con cui parlare: il rapporto è iniziato.',
  cliente: 'Ha chiuso una trattativa: ha comprato.',
  dormiente: 'Ha lavorato con noi, poi si è fermato: da riattivare.',
  perso: 'Chiuso senza esito o non in target.',
};

/**
 * Il livello di un negozio.
 *
 * - `haContatto` = esiste almeno una persona in rubrica per quel negozio;
 * - `contattato` = gli è stato avviato un contatto (mail inviata dall'app,
 *   chiamata o visita registrata).
 *
 * Entrambi si calcolano **una volta per tutta la lista** (vedi
 * `fetchPlaceIdConContatto` e `fetchPlaceIdContattati`), non riga per riga.
 *
 * ⚠️ Regola cambiata il 26/07/2026 (decisione utente). Prima bastava una
 * visita, una trattativa aperta o uno stato "avviato" nel registro per salire
 * di livello: così i negozi scelti con la ⭐ finivano quasi tutti in Prospect e
 * i Selezionati restavano vuoti. Il confine di Prospect resta uno solo e
 * concreto — **una persona con cui parlare** — ma chi è già stato contattato
 * non si confonde più con chi non è mai stato toccato: quello è un Lead.
 */
export function livelloDi(p: Place, haContatto = false, contattato = false): Livello {
  // "dismesso" nel registro = rapporto interrotto, non trattativa persa: viene
  // prima di tutto, perché chi ci ha già lavorato non va confuso con un perso.
  if (p.anagrafiche_stato === 'dismesso') return 'dormiente';
  if (p.stato === 'cliente' || p.anagrafiche_stato === 'attivo') return 'cliente';
  if (p.stato === 'perso' || p.anagrafiche_stato === 'non_interessato') return 'perso';
  // Il contatto può arrivare dalla rubrica Scout o essere già noto da HubSpot.
  if (haContatto || p.hubspot_ha_contatto) return 'prospect';
  if (contattato) return 'lead';
  return 'selezionato';
}

/**
 * Il negozio è **roba nostra**, cioè va mostrato negli elenchi di lavoro?
 *
 * Il database contiene anche migliaia di record che nessuno ha mai scelto —
 * scoperta Google e import da terminale — e mostrarli tutti rendeva le liste
 * inutilizzabili (decisione utente del 23/07/2026). Il criterio era: lo ha
 * messo in lista una persona (`creato_da`) o lo ha stellato (`starred`).
 *
 * ⚠️ Quel criterio da solo buttava via anche i negozi che hanno **una persona
 * in rubrica** o a cui è **già stato scritto**: record vecchi, senza
 * `creato_da` perché importati prima che lo si registrasse, ma con un rapporto
 * vero alle spalle. Comparivano in Rubrica e sparivano da Selezionati, Lead,
 * Prospect e Per interesse — con la Rubrica che ne mostrava molti di più senza
 * che niente spiegasse perché (segnalato dall'utente il 28/07/2026).
 *
 * Una relazione vale quanto una scelta: se c'è un contatto o un contatto
 * avviato, il negozio si lavora.
 */
export function inLavorazione(p: Place, haContatto = false, contattato = false): boolean {
  if (p.nascosto) return false;
  return Boolean(p.creato_da) || Boolean(p.starred) || haContatto || contattato || Boolean(p.hubspot_ha_contatto);
}

/** Colore del badge: coerente col resto dell'app (verde chiuso, blu in corso). */
export function coloreLivello(l: Livello): string {
  switch (l) {
    case 'cliente':
      return '#2F7D46';
    case 'prospect':
      return '#1F6FEB';
    // Il contatto è partito ma non è ancora arrivato a una persona: acceso
    // quanto basta per distinguerlo da un selezionato fermo, non quanto un
    // prospect.
    case 'lead':
      return '#5B8DEF';
    case 'dormiente':
      return '#B7791F';
    case 'perso':
      return '#B3261E';
    default:
      return '#8A8A8E';
  }
}
