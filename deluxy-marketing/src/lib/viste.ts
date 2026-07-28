import { prisma } from "./db";

// Le viste salvate: un modo di guardare una pagina (filtri + ordinamento +
// periodo) messo da parte con un nome.
//
// Sono CONDIVISE, non per utente: se "Google Ads sotto break-even, 30 giorni"
// è la vista giusta per guardare le campagne, lo è per chiunque apra la
// pagina. Chi ne vuole una sua se ne salva un'altra con un nome diverso.

export const PAGINE_VISTA = ["campagne", "termini", "keywords", "brand", "trend"] as const;
export type PaginaVista = (typeof PAGINE_VISTA)[number];

export const ETICHETTA_PAGINA_VISTA: Record<string, string> = {
  campagne: "Campagne",
  termini: "Parole cercate",
  keywords: "Keywords",
  brand: "Dashboard per brand",
  trend: "Trend vendite",
};

// Parametri che NON fanno parte di una vista: sono messaggi di ritorno da
// un'azione ("salvata", "bloccata"), non un modo di guardare la pagina.
// Salvarli vorrebbe dire riproporre per sempre un avviso di ieri.
const DA_NON_SALVARE = new Set([
  "vista",
  "salvata",
  "bloccata",
  "aggiornamento",
  "esito",
  "errore",
]);

// La query string di una vista, in forma canonica: chiavi in ordine
// alfabetico, vuoti fuori. Due viste identiche scritte in ordine diverso
// devono risultare identiche, altrimenti "questa vista è già attiva" non
// funziona mai.
export function parametriVista(p: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const chiave of Object.keys(p).sort()) {
    if (DA_NON_SALVARE.has(chiave)) continue;
    const v = p[chiave];
    const valore = Array.isArray(v) ? v[0] : v;
    if (valore == null || valore === "") continue;
    q.set(chiave, valore);
  }
  return q.toString();
}

export function visteDiPagina(pagina: string) {
  return prisma.vistaSalvata.findMany({
    where: { pagina },
    orderBy: [{ predefinita: "desc" }, { nome: "asc" }],
  });
}

// Dove mandare chi apre la pagina "nuda". Se c'è una vista predefinita e
// nessun filtro nell'indirizzo, si va lì.
//
// Due paracadute contro il rimbalzo infinito: una predefinita senza parametri
// non fa redirect (si finirebbe di nuovo sulla pagina nuda), e `?vista=libera`
// è la via d'uscita per guardare la pagina senza filtri.
export async function destinazionePredefinita(
  pagina: string,
  base: string,
  p: Record<string, string | string[] | undefined>
): Promise<string | null> {
  if (p.vista === "libera") return null;
  if (parametriVista(p) !== "") return null;
  const predefinita = await prisma.vistaSalvata.findFirst({ where: { pagina, predefinita: true } });
  if (!predefinita?.parametri) return null;
  return `${base}?${predefinita.parametri}`;
}
