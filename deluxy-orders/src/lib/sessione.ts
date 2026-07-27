import { cookies } from "next/headers";

// ORDINI ARRIVATI MENTRE ERI QUI.
//
// Il problema vero: la tabella degli ordini ha 14.000 righe e ne arrivano di
// nuovi mentre la si guarda. Senza un segno, per accorgersene bisogna ricordare
// a memoria qual era il primo numero in cima — e non funziona.
//
// Il momento di riferimento è quello in cui è cominciata la sessione (cookie
// scritto dal middleware), e si può spostare a «adesso» col pulsante «Ho visto»
// quando si è finito di lavorare quelli arrivati.
//
// Si guarda `createdAt`, cioè **quando l'ordine è entrato nel registro**, non la
// data dell'ordine su Shopify: un ordine di ieri sera importato adesso è nuovo
// per chi lavora, anche se per Shopify è di ieri. È la domanda giusta —
// «che cosa non avevo ancora visto?».

export const COOKIE_SESSIONE = "orders_sessione_da";
export const COOKIE_VISTO = "orders_visto_fino";

// Il momento da cui contare le novità: l'ultimo «ho visto» se c'è, altrimenti
// l'inizio della sessione. `null` quando non c'è nessuno dei due (prima visita
// in assoluto, o cookie disabilitati): in quel caso non si segna niente, invece
// di segnare tutto come nuovo.
export async function daQuando(): Promise<Date | null> {
  const c = await cookies();
  const valore = c.get(COOKIE_VISTO)?.value ?? c.get(COOKIE_SESSIONE)?.value;
  if (!valore) return null;
  const d = new Date(valore);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Quanto tempo fa, scritto come lo direbbe una persona.
export function daQuandoLeggibile(d: Date): string {
  const minuti = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (minuti < 1) return "da adesso";
  if (minuti === 1) return "dall'ultimo minuto";
  if (minuti < 60) return `dagli ultimi ${minuti} minuti`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return ore === 1 ? "dall'ultima ora" : `dalle ultime ${ore} ore`;
  const giorni = Math.round(ore / 24);
  return giorni === 1 ? "da ieri" : `dagli ultimi ${giorni} giorni`;
}
