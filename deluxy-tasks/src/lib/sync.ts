import type { Task } from "@prisma/client";

// Logica di sincronizzazione: stabilire se una scrittura in arrivo è davvero
// più fresca di quella registrata, e chi va richiamato (callback) quando una
// task cambia.

// Decide se applicare una scrittura in arrivo confrontando la freschezza
// dichiarata dall'origine (`asOf`) con quella già registrata. Regole:
//  - se non c'è una task esistente → si applica (creazione).
//  - se l'origine non dichiara `asOf` → si applica (non sa dire la freschezza).
//  - se la task esistente non ha `aggiornatoDaOrigine` → si applica.
//  - altrimenti si applica solo se `asOf` >= dell'ultimo registrato.
export function scritturaPiuFresca(
  esistente: Pick<Task, "aggiornatoDaOrigine"> | null,
  asOf: Date | null | undefined,
): boolean {
  if (!esistente) return true;
  if (!asOf) return true;
  if (!esistente.aggiornatoDaOrigine) return true;
  return asOf.getTime() >= esistente.aggiornatoDaOrigine.getTime();
}

// Il callback verso il progetto di origine parte solo quando la modifica NON
// arriva dal progetto stesso: se è Scout ad aggiornare la sua task, Scout lo sa
// già. Se invece cambia dalla UI del team ("ui") o da un'altra app, avvisiamo
// l'origine. Questo evita anche i loop di sincronizzazione.
export function deveNotificareOrigine(sistemaOrigine: string, attore: string): boolean {
  return attore !== sistemaOrigine;
}
