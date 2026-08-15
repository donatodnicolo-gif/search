import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Confronto di segreti **indipendente dal contenuto**: il `!==` di JavaScript
 * termina al primo byte diverso, e in teoria racconta il segreto un byte alla
 * volta a chi misura i tempi di risposta. Passare dagli hash pareggia le
 * lunghezze, e `timingSafeEqual` confronta sempre tutto.
 *
 * Si usa dove il segreto protegge una scrittura vera: i cron (rotazioni che
 * scrivono sul negozio, import che riscrive il venduto). Sul cookie di sessione
 * non serve — lì si confrontano due hash, e il timing rivela solo il prefisso
 * di un digest, inutile senza preimmagine.
 */
export function stessoSegreto(fornito: string, atteso: string): boolean {
  const a = createHash("sha256").update(fornito).digest();
  const b = createHash("sha256").update(atteso).digest();
  return timingSafeEqual(a, b);
}
