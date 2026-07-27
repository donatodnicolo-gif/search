// Il semaforo della visita: a colpo d'occhio, in che punto è il negozio.
//
//   🔴 ROSSO  la visita non è ancora stata fatta — è tutto da fare;
//   🟡 GIALLO c'è una bozza aperta: ci si è stati ma il resoconto è a metà,
//             ed è il caso peggiore perché è già costato un giro;
//   🟢 VERDE  la visita è stata fatta e registrata.
//
// Sta qui e non nelle schermate perché il colore deve voler dire la stessa cosa
// nei Selezionati, nei Lead e nei Potenziali: tre semafori scritti tre volte
// sarebbero diventati tre significati diversi nel giro di un mese.

import type { Place } from '@/types';

export type StatoVisita = 'da_fare' | 'da_finire' | 'fatta';

export const COLORE_VISITA: Record<StatoVisita, string> = {
  da_fare: '#B3261E',
  da_finire: '#B7791F',
  fatta: '#2F7D46',
};

export const LABEL_VISITA: Record<StatoVisita, string> = {
  da_fare: 'Visita da fare',
  da_finire: 'Visita da completare',
  fatta: 'Visita fatta',
};

/**
 * In che stato è la visita di un negozio.
 *
 * - `haBozza` = c'è una bozza aperta nel pop-up (tabella `bozze_visita`);
 * - `haVisita` = esiste almeno una visita registrata (tabella `visits`).
 *
 * Il giallo vince sul verde: un negozio già visitato in passato, con una bozza
 * aperta adesso, ha comunque un resoconto da chiudere — ed è quello che serve
 * vedere. `places.da_completare` è il vecchio flag di «compila dopo» e conta
 * come bozza: chi l'aveva usato prima non deve risultare a posto.
 */
export function statoVisita(p: Place, haBozza = false, haVisita = false): StatoVisita {
  if (haBozza || p.da_completare) return 'da_finire';
  if (haVisita || p.stato === 'visitato' || p.stato === 'cliente' || p.stato === 'perso') return 'fatta';
  return 'da_fare';
}

/** "gio 30 lug", o null. Per la data che ci si è dati, non per quella fatta. */
export function giornoBreve(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Quanto manca alla data che ci si è dati: negativo = è già passata. */
export function giorniDaOggi(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Solo il giorno: con le ore, «oggi alle 9» risulterebbe già in ritardo.
  const oggi = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return Math.round((a - b) / 86400000);
}
