import { createHash, timingSafeEqual } from "crypto";

// Confronto di segreti a tempo costante.
//
// PERCHÉ NON `===`: il confronto di stringhe di JavaScript si ferma al primo
// carattere diverso, quindi il tempo di risposta racconta quanto prefisso era
// giusto. Su una rete pubblica il segnale è sepolto dal rumore — qui, con una
// query al database prima del confronto, è sepolto due volte — ma è la
// classica cosa che si scrive una volta e non si tocca più, e il costo è zero.
//
// Si confrontano i DIGEST, non i valori: hanno sempre la stessa lunghezza, così
// `timingSafeEqual` non lancia su lunghezze diverse (e la lunghezza del segreto
// non trapela dal fatto che il confronto fallisca subito).
//
// ⚠️ Sta in un file suo, e non in `env.ts` o in `apiauth.ts`, perché usa il
// `crypto` di Node: importarlo da un modulo che finisce nel middleware (che gira
// su Edge) romperebbe la build.
export function segretoCombacia(presentato: string | null | undefined, atteso: string | null | undefined): boolean {
  if (!presentato || !atteso) return false;
  const a = createHash("sha256").update(presentato).digest();
  const b = createHash("sha256").update(atteso).digest();
  return timingSafeEqual(a, b);
}
