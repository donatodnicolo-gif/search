// **L'orario di consegna si deduce dall'ora minima.**
//
// Regola dell'utente (11/09/2026): «Orario Consegna `custom.orario_consegna`:
// deduci da ora minima di consegna».
//
// Le fasce del sito sono 8-12, 12-16, 16-20, e si chiamano «In Mattinata»,
// «Pomeriggio», «Sera». Se un prodotto non si può consegnare prima delle 12,
// la mattina non è una scelta possibile: è questa la deduzione.
//
// ⚠️ Misurato sulle schede attive che hanno tutti e due i campi (324): a 7, 8,
// 9 e 10 il valore dominante è **tutte e tre le fasce** (220 casi); a 19 sono
// nove su nove **solo «Sera»**. L'unica scheda con ora 12 dice «Sera» dove
// questa regola propone «Pomeriggio + Sera»: una sola scheda non è una regola,
// e comunque qui si **propone** — il campo resta di chi compila.

export const FASCE_CONSEGNA = ["In Mattinata", "Pomeriggio", "Sera"] as const;

/**
 * Le fasce compatibili con l'ora minima. Torna `null` se l'ora non si legge:
 * meglio un campo vuoto che una proposta inventata.
 */
export function fasceDaOraMinima(oraMinima: unknown): string[] | null {
  const n = Number(String(oraMinima ?? "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 23) return null;
  if (n < 12) return ["In Mattinata", "Pomeriggio", "Sera"];
  if (n < 16) return ["Pomeriggio", "Sera"];
  return ["Sera"];
}

/** Come si scrive nel campo: la lista JSON, che è la forma in cui Shopify la tiene. */
export function orarioConsegnaDaOraMinima(oraMinima: unknown): string | null {
  const fasce = fasceDaOraMinima(oraMinima);
  return fasce ? JSON.stringify(fasce) : null;
}
