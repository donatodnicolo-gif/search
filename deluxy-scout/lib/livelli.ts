// I livelli commerciali di un negozio. Una sola scala, valida in tutta l'app,
// DERIVATA dai dati che già abbiamo — non un campo in più da aggiornare a mano.
//
// ⚠️ SCALA RIDEFINITA DALL'UTENTE il 28/07/2026. Il confine fra Lead e Prospect
// era «c'è una persona in rubrica»; ora è **la trattativa**. Un nome in rubrica
// non è un interesse: è un recapito. Prospect è chi si è mosso.
//
//   SELEZIONATO qualcuno l'ha scelto — ⭐ dalla Mappa o dalle Affiliazioni,
//               oppure col bottone + — ma non gli è ancora stato detto niente.
//   LEAD        **c'è un contatto**: una persona in rubrica, oppure gli
//               abbiamo scritto/telefonato, oppure è arrivato lui (richiesta
//               dal sito, segnalazione) e lo si è dichiarato tale.
//   PROSPECT    **ha mostrato interesse**: ha risposto, e c'è una trattativa
//               aperta. È il lead che si è mosso.
//   CLIENTE     la trattativa è andata bene: ha comprato.
//   DORMIENTE   cliente che **ha smesso di fatturare**. Non è un perso: ci
//               conosce già, ha comprato, ed è la lista più redditizia da
//               riattivare. La regola vera è di FINANCE (`statoAnalisi =
//               dismesso`, GET /api/clienti/stato di deluxy-partner): finché
//               quel dato non arriva qui si usa lo stato del registro, che
//               significa «rapporto interrotto» e non «non fattura da N mesi».
//
// ⚠️ **PERSO NON È PIÙ UN LIVELLO** (decisione utente del 29/07/2026): è un
// segno addosso al negozio, `ePerso()` qui sotto. Il negozio resta nella lista
// del suo livello — un lead perso resta fra i Lead — col badge «Perso».
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

export type Livello = 'selezionato' | 'lead' | 'prospect' | 'cliente' | 'dormiente';

/** L'ordine in cui mostrarli: il funnel, poi chi si è fermato. */
export const LIVELLI: Livello[] = ['selezionato', 'lead', 'prospect', 'cliente', 'dormiente'];

export const LABEL_LIVELLO: Record<Livello, string> = {
  selezionato: 'Selezionato',
  lead: 'Lead',
  prospect: 'Prospect',
  cliente: 'Cliente',
  dormiente: 'Dormiente',
};

export const AIUTO_LIVELLO: Record<Livello, string> = {
  selezionato: 'Potenzialmente interessante: da contattare.',
  lead: 'C’è un contatto: una persona, o un messaggio partito. Non ha ancora risposto.',
  prospect: 'Ha mostrato interesse e la trattativa è aperta: si sta giocando qualcosa.',
  cliente: 'Ha chiuso una trattativa: ha comprato.',
  dormiente: 'Cliente che ha smesso di fatturare: da riattivare.',
};

/**
 * PERSO NON È UN LIVELLO: è un **segno addosso al negozio** (decisione utente
 * del 29/07/2026, «dovrei averlo comunque in lead ma perso»).
 *
 * Prima «perso» vinceva su tutto il resto e il negozio spariva dalla sua lista
 * per ricomparire in «Dormienti e persi»: un lead con una persona in rubbrica,
 * chiuso con esito «non target», usciva dai Lead — cioè dal posto dove uno lo
 * cerca. Ora il livello resta quello del funnel (Lead resta Lead) e il fatto
 * che sia chiuso si legge come badge sulla riga.
 *
 * Da dove viene: l'esito «non target» di una visita (che porta
 * `places.stato = 'perso'`, vedi `statoDaEsito`) oppure il registro Anagrafiche
 * che dice «non interessato».
 */
export function ePerso(p: Place): boolean {
  return p.stato === 'perso' || p.anagrafiche_stato === 'non_interessato';
}

export const LABEL_PERSO = 'Perso';
export const COLORE_PERSO = '#B3261E';

/**
 * Cliente **a rischio**: compra ancora, ma i segnali peggiorano.
 *
 * Come «perso», non è un livello ma un segno: resta un Cliente, e lo si vede
 * dal badge. Nasce dalla ricerca sui CRM di mercato (29/07/2026): fra «attivo»
 * e «dismesso» non c'era niente, quindi un cliente spariva dal radar solo
 * quando aveva già smesso — cioè quando è tardi per fare qualcosa.
 */
export function aRischio(p: Place): boolean {
  return p.anagrafiche_stato === 'a_rischio' || p.stato_affiliazione === 'a_rischio';
}

export const LABEL_A_RISCHIO = 'A rischio';
export const COLORE_A_RISCHIO = '#B7791F';

/**
 * Il livello di un negozio.
 *
 * - `haContatto` = esiste almeno una persona in rubrica per quel negozio;
 * - `contattato` = gli è stato avviato un contatto (mail inviata dall'app,
 *   chiamata o visita registrata);
 * - `inTrattativa` = ha una trattativa **aperta** (non vinta né persa).
 *
 * Si calcolano **una volta per tutta la lista** (`fetchPlaceIdConContatto`,
 * `fetchPlaceIdContattati`, `fetchPlaceIdInTrattativa`), non riga per riga:
 * sono migliaia di negozi.
 *
 * L'ordine dei controlli è quello del funnel al contrario — chi è più avanti
 * vince. Un cliente che ha anche una trattativa aperta resta un cliente.
 */
export function livelloDi(
  p: Place,
  haContatto = false,
  contattato = false,
  inTrattativa = false,
  nonFattura = false,
): Livello {
  // ⚠️ SCALA RIDEFINITA DALL'UTENTE il 28/07/2026. Prima il confine fra Lead e
  // Prospect era «c'è una persona in rubrica»; ora è **la trattativa**. Un
  // nome in rubrica non è un interesse: è solo un recapito.

  // DORMIENTE — cliente che ha smesso di fatturare. Viene prima di tutto: chi
  // ha comprato e si è fermato non va confuso con chi non ha mai comprato, ed è
  // la lista più redditizia che ci sia.
  //
  // `nonFattura` è il dato vero, da FINANCE (lib/finance.ts → `statoAnalisi`
  // calcolato sui movimenti). Lo stato del registro resta come ripiego: dice
  // «rapporto interrotto», che è una cosa diversa da «non fattura da N mesi» ma
  // è il segnale più vicino quando Finance non è collegato.
  //
  // ⚠️ **Dormiente = solo chi il registro dichiara `dismesso`** (più, quando
  // FINANCE sarà collegato, chi ha smesso di fatturare davvero). Decisione
  // utente del 29/07/2026: in «Dormienti» ci vanno solo quelli, e i **persi non
  // ci vanno più** — restano nella loro lista del funnel col badge «Perso»
  // (vedi `ePerso`). Un rapporto chiuso senza esito non è un cliente che si è
  // fermato: mescolarli faceva sparire i lead persi dai Lead.
  if (nonFattura || p.anagrafiche_stato === 'dismesso') return 'dormiente';

  // CLIENTE — la trattativa è andata bene.
  if (p.stato === 'cliente' || p.anagrafiche_stato === 'attivo') return 'cliente';

  // PROSPECT — ha mostrato interesse: ha risposto, e c'è una trattativa
  // aperta. È il lead che si è mosso, non quello di cui abbiamo l'indirizzo.
  if (inTrattativa || p.hubspot_deal_aperta || p.stato_affiliazione === 'in_trattativa') return 'prospect';

  // ⚠️ **`prospect` NON è più un Prospect di Scout** (29/07/2026). Nel registro
  // Anagrafiche `prospect` è lo stato di DEFAULT — un'azienda appena creata che
  // nessuno ha ancora toccato — mentre qui Prospect è il gradino più alto prima
  // del cliente: ha risposto e c'è una trattativa in gioco. La riga
  // `if (stato_affiliazione === 'prospect') return 'prospect'` era rimasta da
  // prima che la scala venisse ridefinita, e con la sincronizzazione accesa
  // avrebbe fatto entrare OGNI partner nuovo del registro dritto fra i Prospect,
  // senza che nessuno gli avesse mai parlato. Stessa parola, significato
  // opposto: è la trappola classica di due cataloghi che si somigliano.

  // LEAD — c'è un contatto. Una persona in rubrica, un contatto avviato da noi,
  // o il fatto che sia arrivato lui (dichiarato a mano).
  if (haContatto || p.hubspot_ha_contatto || contattato) return 'lead';
  // Gli stati di LAVORAZIONE del registro dicono tutti la stessa cosa per la
  // scala di Scout: il contatto c'è stato. Il dettaglio (quando, come, con chi)
  // vive qui in `contatti_avviati`, `chiamate` e `visits`, ed è più preciso.
  if (
    p.stato_affiliazione === 'lead' ||
    p.stato_affiliazione === 'in_contatto' ||
    p.stato_affiliazione === 'in_attesa' ||
    p.stato_affiliazione === 'da_ricontattare'
  ) {
    return 'lead';
  }

  // SELEZIONATO — scelto, e basta.
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
    default:
      return '#8A8A8E';
  }
}
