import type { Prisma } from "@prisma/client";

// Ricerca a parole su titolo, descrizione, utente e contesto. Ogni parola
// deve comparire in almeno un campo (AND fra parole, OR fra campi).
export function whereRicerca(q: string): Prisma.TaskWhereInput[] {
  const parole = q.split(/\s+/).map((p) => p.trim()).filter(Boolean);
  return parole.map((parola) => ({
    OR: [
      { titolo: { contains: parola, mode: "insensitive" } },
      { descrizione: { contains: parola, mode: "insensitive" } },
      { utenteEmail: { contains: parola, mode: "insensitive" } },
      { utenteNome: { contains: parola, mode: "insensitive" } },
      { contestoEtichetta: { contains: parola, mode: "insensitive" } },
      { tag: { has: parola } },
    ],
  }));
}
