// Le città che l'app sa riconoscere dentro il nome di una campagna o di una
// keyword, e come si chiamano nelle due lingue.
//
// ⚠️ Sta in un modulo SUO, senza dipendenze, apposta: la lista serve anche ai
// componenti che girano nel browser (il dialogo che traduce una keyword), e
// prenderla da `nuova-campagna.ts` — che importa Prisma — vorrebbe dire
// trascinarsi il database dentro il bundle del client.
//
// ⚠️ **Chi aggiunge una città alle campagne la aggiunga anche qui.** Una città
// che non sta in questa lista viene trattata come una parola qualunque: la si
// traduce, la si riordina, e finisce in una campagna vera storpiata.
export const CITTA_NOTE = [
  "milano", "roma", "napoli", "torino", "firenze", "bologna", "venezia",
  "genova", "palermo", "verona", "bari", "catania", "como", "bergamo",
  "brescia", "padova", "trieste", "parma", "modena", "rimini", "perugia",
  "cagliari", "salerno", "pisa", "siena", "lecce", "trento", "bolzano",
  "ancona", "pescara", "taormina", "sorrento", "capri", "portofino",
  "cortina", "positano", "amalfi", "sanremo", "monza", "novara",
  // forme inglesi
  "milan", "rome", "florence", "venice", "naples", "turin", "genoa",
];

// Le forme inglesi vanno tradotte quando si riscrive una keyword: "flowers
// delivery Milan" per Napoli diventa "flowers delivery Naples", non "Napoli".
export const IT_EN: Record<string, string> = {
  milano: "milan", roma: "rome", firenze: "florence", venezia: "venice",
  napoli: "naples", torino: "turin", genova: "genoa",
};

export const EN_IT: Record<string, string> = Object.fromEntries(
  Object.entries(IT_EN).map(([it, en]) => [en, it])
);

/** La città, se la parola è una di quelle note (in qualunque delle due lingue). */
export function eCittaNota(parola: string): boolean {
  return CITTA_NOTE.includes(parola.toLowerCase());
}

/** La città nominata dentro un testo (nome di campagna o keyword), o null. */
export function cittaDaTesto(testo: string): string | null {
  for (const p of String(testo || "").toLowerCase().split(/[^\p{L}]+/u)) {
    if (p && CITTA_NOTE.includes(p)) return p;
  }
  return null;
}

/**
 * La stessa città nella lingua richiesta: `rome` verso italiano è `roma`,
 * `milano` verso inglese è `milan`. Se la forma inglese non esiste (Bergamo,
 * Como…) resta com'è — inventarla comprerebbe ricerche che nessuno fa.
 */
export function cittaInLingua(citta: string, lingua: string | null): string {
  const c = citta.toLowerCase();
  if (lingua === "eng") return IT_EN[c] ?? c;
  if (lingua === "ita" || lingua === "fra") return EN_IT[c] ?? c;
  return c;
}
