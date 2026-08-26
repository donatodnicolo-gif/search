// CHE GIORNO È OGGI, una volta sola (27/08/2026).
//
// ⚠️ `new Date().toISOString().slice(0,10)` NON è la data di oggi: è la data a
// Greenwich. In Italia siamo avanti di un'ora (due d'estate), quindi fra la
// mezzanotte e le due di notte quella riga restituisce IERI.
//
// Il difetto non era teorico: chi a fine giornata, passata la mezzanotte, si
// preparava la lista dell'indomani, col chip «Oggi» scriveva una scadenza già
// in ritardo, e col chip «Domani» scriveva oggi. Nessun avviso: la schermata
// mostra l'etichetta del chip, non la data che scrive.
//
// La regola giusta era già in casa (`PianificaVisitaModal`, `TabellaTrattative`,
// `calendario`), copiata a mano tre volte, mentre altre tre copie erano quelle
// sbagliate. Qui sta una volta sola.

function due(n: number): string {
  return String(n).padStart(2, '0');
}

/** La data di un momento come la legge un orologio ITALIANO (YYYY-MM-DD). */
export function isoLocale(d: Date = new Date()): string {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

/** Oggi, in ora locale. */
export function isoOggi(): string {
  return isoLocale();
}

/** La data fra N giorni (N negativo = indietro), in ora locale. */
export function isoTraGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoLocale(d);
}
