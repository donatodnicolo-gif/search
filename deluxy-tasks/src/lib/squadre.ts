import { prisma } from "./db";

// Visibilità di squadra. Un utente non admin vede i propri task e quelli delle
// persone che stanno in almeno una delle sue squadre. Se non appartiene a nessuna
// squadra, vede solo i propri.
//
// Restituisce l'elenco (in minuscolo) delle email visibili a `email`, sé incluso.
export async function emailiVisibili(email: string): Promise<string[]> {
  const me = email.trim().toLowerCase();
  const insieme = new Set<string>([me]);

  const mie = await prisma.membroSquadra.findMany({
    where: { utenteEmail: me },
    select: { squadraId: true },
  });
  const squadraIds = mie.map((m) => m.squadraId);
  if (squadraIds.length) {
    const compagni = await prisma.membroSquadra.findMany({
      where: { squadraId: { in: squadraIds } },
      select: { utenteEmail: true },
    });
    for (const c of compagni) insieme.add(c.utenteEmail.toLowerCase());
  }

  return [...insieme];
}
