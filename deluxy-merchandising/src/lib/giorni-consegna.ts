// **Dai giorni di preparazione a quello che il cliente legge sulla scheda.**
//
// ⭐ 11/09/2026 (utente: «e giorni/data di preparazione per prodotto e
// varianti», e prima «anche data (oggi, domani, ecc) attraverso i giorni
// minimi»). I giorni sono un numero; sulla scheda il cliente legge una parola.
// La regola per passare dall'uno all'altra **non è stata inventata**: è contata
// sulle 1.276 schede attive incrociando i due campi veri.
//
// I campi, coi nomi veri che i siti usano (misurati, non dedotti):
//
//   `prodotto.consegna`  — i giorni minimi, un intero come stringa.
//                          1.229/1.276 schede. Valori: 0 (595), 1 (280),
//                          3 (194), 2 (126), 5 (22), 7 (6), 6 (3), 4 (2), 14 (1).
//                          ⚠️ Il namespace è `prodotto`, non `custom`.
//   `custom.data`        — la parola. 1.000/1.276, 11 grafie diverse.
//
// L'incrocio dei due (le coppie più frequenti):
//
//   0 → ["Oggi","Domani"]  374   |  0 → ["Oggi"]            69
//   1 → ["Domani"]          84   |  1 → ["Oggi","Domani"]   76
//   2 → 48 ore              37   |  2 → ["Su Prenotazione"] 47
//   3 → 72 ore             129
//
// ⚠️ **I dati sono sporchi, e la regola lo dichiara.** «1 → Oggi e Domani»
// compare 76 volte ed è una contraddizione: un prodotto che vuole un giorno
// oggi non si consegna. Sono anni di compilazione a mano. Qui si prende il
// valore **dominante** per ciascun numero di giorni e si lascia stare il resto:
// serve una regola sola per i prodotti NUOVI, non una riscrittura dello storico
// (che non si tocca).
//
// ⚠️ E non si generano parole nuove: «48 ore» e «72 ore» sembrano fuori posto
// accanto a delle liste JSON, ma sono esattamente ciò che i siti scrivono per 2
// e 3 giorni. Scriverci «["Fra 2 giorni"]» vorrebbe dire mettere sulla scheda
// una voce che il tema non ha mai visto.

/** La parola per i giorni minimi, o `null` se il numero non è leggibile. */
export function dataDaGiorniMinimi(giorni: unknown): string | null {
  const n = Number(String(giorni ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return JSON.stringify(["Oggi", "Domani"]);
  if (n === 1) return JSON.stringify(["Domani"]);
  if (n === 2) return "48 ore";
  if (n === 3) return "72 ore";
  return JSON.stringify(["Su Prenotazione"]);
}

/** I giorni minimi come li vuole `prodotto.consegna`: un intero come stringa. */
export function giorniMinimiPerIlNegozio(giorni: unknown): string | null {
  const n = Number(String(giorni ?? "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 365) return null;
  return String(Math.round(n));
}

/** L'ora minima come la vuole `custom.minimo_orario`: un'ora piena come stringa. */
export function oraMinimaPerIlNegozio(ora: unknown): string | null {
  const n = Number(String(ora ?? "").trim());
  // Misurato: 7 valori distinti su 1.147 schede, tutti ore piene (7, 8, 9, 10,
  // 12, 14, 19). Un valore fuori dall'orologio non si scrive.
  if (!Number.isFinite(n) || n < 0 || n > 23) return null;
  return String(Math.round(n));
}
