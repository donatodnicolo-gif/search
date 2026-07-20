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
