import { prisma } from "./db";
import { ficStato, ficFattureCached, type FicFattura } from "./fic";

// Le fatture emesse su Fatture in Cloud che risultano intestate a un partner.
//
// L'aggancio usa i nomi cliente FIC riconciliati a quel partner
// (`RiconciliazioneAnagrafica`) più il nome del partner stesso: su FIC lo
// stesso negozio compare spesso con la ragione sociale o col nome di una
// persona, e cercare solo l'insegna non trova niente.
//
// Serve in due posti — l'elenco «Fatture su Fatture in Cloud» della scheda e
// la scelta della fattura commissioni da collegare a un mese — e la logica
// dev'essere una sola: due filtri diversi mostrerebbero due elenchi diversi
// per la stessa domanda.

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();
}

export function nomiCoincidono(clienteFic: string, nomi: string[]): boolean {
  const c = norm(clienteFic);
  return Boolean(c) && nomi.some((n) => c === n || c.includes(n) || n.includes(c));
}

export async function nomiFicDelPartner(partnerId: string, partnerNome: string): Promise<string[]> {
  const ric = await prisma.riconciliazioneAnagrafica.findMany({
    where: { partnerId, stato: "confermata" },
    select: { ficNome: true },
  });
  return [partnerNome, ...ric.map((r) => r.ficNome)].map(norm).filter(Boolean);
}

/** Fatture FIC di quel partner nell'anno. Lista vuota (mai un errore) se FIC
 *  non è collegato o non risponde: è materiale di supporto, non deve far
 *  fallire la pagina che la mostra. */
export async function fattureFicDelPartner(
  partnerId: string,
  partnerNome: string,
  anno: number
): Promise<FicFattura[]> {
  try {
    const stato = await ficStato();
    if (!stato.collegato) return [];
    const nomi = await nomiFicDelPartner(partnerId, partnerNome);
    if (nomi.length === 0) return [];
    const fatture = await ficFattureCached({ anno });
    return fatture.filter((f) => nomiCoincidono(f.cliente, nomi));
  } catch {
    return [];
  }
}
