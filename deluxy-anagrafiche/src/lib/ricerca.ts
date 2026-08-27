import type { Prisma } from "@prisma/client";

// Ricerca "a parole": la query viene spezzata in parole e ogni parola deve
// comparire (match parziale, ignorando maiuscole) in almeno uno dei campi
// dell'anagrafica o dei suoi contatti. Così "g32 palermo" trova
// "G32 Piante e Fiori Palermo" e "rossi milano" trova il sig. Rossi di Milano.
// Usata sia dalla UI sia dalle API /api/v1.
export function whereRicerca(q: string): Prisma.PartnerWhereInput[] {
  const parole = q.trim().split(/\s+/).filter(Boolean);
  return parole.map((parola) => {
    const like = { contains: parola, mode: "insensitive" as const };
    return {
      OR: [
        { nome: like },
        { ragioneSociale: like },
        { categoria: like },
        { citta: like },
        { provincia: like },
        { regione: like },
        { indirizzo: like },
        { email: like },
        { telefono: like },
        { pIva: like },
        { codiceFiscale: like },
        { account: like },
        { note: like },
        { tipoProspect: like },
        { contatti: { some: { OR: [{ nome: like }, { ruolo: like }, { email: like }, { telefono: like }] } } },
      ],
    };
  });
}

// ⚠️ Forme giuridiche: dicono che cos'è l'azienda, non QUALE azienda è.
// «Battistella fioreria srl» non trovava «Fioreria Battistella» perché «srl»
// non compare in nessun campo, e la ricerca a parole le vuole tutte: rispondeva
// «nessuna» e chi chiamava creava un quasi-doppione (§7 dell'handoff, 25/08).
// Servono normalizzate: nel nome stanno scritte in ogni modo («S.r.l.», «SRLS»).
const FORME_GIURIDICHE = new Set([
  "srl", "srls", "sarl", "sas", "sasu", "snc", "spa", "sapa", "sc", "scarl", "scrl",
  "ss", "soc", "societa", "coop", "cooperativa", "sagl", "sa", "sl", "slu", "sprl",
  "ltd", "limited", "llc", "inc", "corp", "plc", "gmbh", "ug", "ag", "kg", "ohg",
  "bv", "nv", "oy", "ab", "as", "aps", "eurl", "eirl", "sarlu",
]);

const normParola = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export const eFormaGiuridica = (parola: string) => FORME_GIURIDICHE.has(normParola(parola));

// Le parole del nome che identificano davvero l'azienda. Tiene la grafia
// originale (accenti compresi): serve al `contains` del database, che confronta
// col testo scritto — «Goshà» normalizzata in «gosha» non troverebbe più nulla.
export function paroleSignificative(q: string): string[] {
  return q.trim().split(/\s+/).filter((p) => p && normParola(p) && !eFormaGiuridica(p));
}

// ⚠️ Ricerca di RIPIEGO per l'aggancio, ristretta a NOME e RAGIONE SOCIALE.
// Non guarda i contatti di proposito: è dai contatti che l'aggancio sbagliato
// del 25/08 è nato («Contatti senza azienda (HubSpot)», 288 contatti dentro).
// Qui si sta cercando un'AZIENDA per nome, non una persona.
export function whereRicercaNome(parole: string[]): Prisma.PartnerWhereInput[] {
  return parole.map((parola) => {
    const like = { contains: parola, mode: "insensitive" as const };
    return { OR: [{ nome: like }, { ragioneSociale: like }] };
  });
}
