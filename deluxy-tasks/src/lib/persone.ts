import { prisma } from "./db";
import { emailiVisibili } from "./squadre";

// Le persone a cui si può assegnare un'attività dalla UI. Non esiste un
// elenco «utenti di Tasks»: l'identità è l'email, e le persone arrivano da due
// fonti — gli utenti del Deluxy Hub (chi può entrare qui) e chi ha già delle
// attività (es. le caselle di AI Mail o i responsabili di Finance, che non sono
// per forza utenti del Hub). Le uniamo per email; il nome del Hub vince.
//
// Solo runtime Node ($queryRaw): da non importare nel middleware.

export type Persona = { email: string; nome: string | null };

type RigaHub = { email: string; nome: string };

async function utentiHub(): Promise<RigaHub[]> {
  try {
    return await prisma.$queryRaw<RigaHub[]>`
      SELECT email, nome FROM hub."Utente" WHERE attivo = true ORDER BY nome
    `;
  } catch {
    // Schema hub non raggiungibile: si va avanti con le sole persone delle task.
    return [];
  }
}

/**
 * Elenco delle persone assegnabili, ordinate per nome. Un admin vede tutte;
 * un non-admin solo sé stesso e la propria squadra (stesse regole di visibilità
 * dell'elenco, vedi lib/squadre.ts).
 */
export async function elencaPersone(opzioni: {
  admin: boolean;
  emailSessione: string | null;
}): Promise<Persona[]> {
  const [hub, daTask] = await Promise.all([
    utentiHub(),
    prisma.task.findMany({
      where: { attiva: true },
      distinct: ["utenteEmail"],
      select: { utenteEmail: true, utenteNome: true },
      orderBy: { utenteEmail: "asc" },
    }),
  ]);

  const mappa = new Map<string, Persona>();
  for (const t of daTask) {
    const email = t.utenteEmail.toLowerCase();
    if (!mappa.has(email)) mappa.set(email, { email, nome: t.utenteNome });
  }
  for (const u of hub) {
    const email = u.email.toLowerCase();
    mappa.set(email, { email, nome: u.nome || mappa.get(email)?.nome || null });
  }
  if (opzioni.emailSessione) {
    const me = opzioni.emailSessione.toLowerCase();
    if (!mappa.has(me)) mappa.set(me, { email: me, nome: null });
  }

  let persone = [...mappa.values()];
  if (!opzioni.admin && opzioni.emailSessione) {
    const visibili = new Set(await emailiVisibili(opzioni.emailSessione));
    persone = persone.filter((p) => visibili.has(p.email));
  }

  return persone.sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "it"));
}

/** Nome leggibile di una persona (Hub o task esistenti), se lo conosciamo. */
export async function nomePersona(email: string): Promise<string | null> {
  const pulita = email.trim().toLowerCase();
  const [hub, task] = await Promise.all([
    utentiHub(),
    prisma.task.findFirst({
      where: { utenteEmail: pulita, utenteNome: { not: null } },
      select: { utenteNome: true },
      orderBy: { aggiornataIl: "desc" },
    }),
  ]);
  return hub.find((u) => u.email.toLowerCase() === pulita)?.nome || task?.utenteNome || null;
}
