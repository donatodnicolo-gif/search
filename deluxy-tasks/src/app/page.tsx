import type { Prisma, Task, TaskLivello } from "@prisma/client";
import { cookies } from "next/headers";
import { Filtri } from "@/components/Filtri";
import { RigaTask, type TaskUI } from "@/components/RigaTask";
import { leggiSessione, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { whereRicerca } from "@/lib/ricerca";
import { isAdmin } from "@/lib/ruoli";
import { STATI_CHIUSI } from "@/lib/stati";
import { emailiVisibili } from "@/lib/squadre";

export const dynamic = "force-dynamic";

type TaskConLivelli = Task & { livelli: TaskLivello[] };

function toUI(t: TaskConLivelli): TaskUI {
  return {
    id: t.id,
    sistema: t.sistema,
    utenteEmail: t.utenteEmail,
    utenteNome: t.utenteNome,
    titolo: t.titolo,
    descrizione: t.descrizione,
    stato: t.stato,
    priorita: t.priorita,
    scadenza: t.scadenza?.toISOString() ?? null,
    livelloSceltoId: t.livelloSceltoId,
    livelli: t.livelli
      .slice()
      .sort((a, b) => a.ordine - b.ordine)
      .map((l) => ({ id: l.id, priorita: l.priorita, data: l.data?.toISOString() ?? null, nota: l.nota })),
    link: t.link,
    contestoEtichetta: t.contestoEtichetta,
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; q?: string; utente?: string; sistema?: string }>;
}) {
  const sp = await searchParams;

  // Chi sta guardando: sessione firmata col ruolo del Hub. Senza segreto
  // (sviluppo) non c'è sessione → vista da admin (vede tutto).
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  const admin = sessione ? isAdmin(sessione.ruolo) : true;

  const where: Prisma.TaskWhereInput = { attiva: true };
  if (sp.q?.trim()) where.AND = whereRicerca(sp.q.trim());
  if (sp.sistema?.trim()) where.sistema = sp.sistema.trim();
  if (sp.stato) where.stato = sp.stato;
  else where.stato = { notIn: [...STATI_CHIUSI] }; // default "Da fare"

  // Visibilità: l'admin vede tutte le task (e può filtrare per persona con
  // ?utente); gli altri vedono solo le proprie e quelle della loro squadra.
  if (admin) {
    if (sp.utente?.trim()) where.utenteEmail = sp.utente.trim().toLowerCase();
  } else if (sessione) {
    where.utenteEmail = { in: await emailiVisibili(sessione.email) };
  }

  let task: TaskConLivelli[] = [];
  let sistemiPresenti: string[] = [];
  let erroreDb: string | null = null;
  try {
    [task, sistemiPresenti] = await Promise.all([
      prisma.task.findMany({
        where,
        include: { livelli: true },
        orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
        take: 500,
      }),
      prisma.task
        .groupBy({ by: ["sistema"], where: { attiva: true } })
        .then((g) => g.map((x) => x.sistema).sort()),
    ]);
  } catch {
    erroreDb =
      "Database non configurato. Imposta DATABASE_URL / DIRECT_URL (npm run db:condiviso -- <env>) e lancia npm run db:push.";
  }

  // Raggruppa per utente (email)
  const gruppi = new Map<string, { nome: string | null; task: TaskConLivelli[] }>();
  for (const t of task) {
    const g = gruppi.get(t.utenteEmail) ?? { nome: t.utenteNome, task: [] };
    if (!g.nome && t.utenteNome) g.nome = t.utenteNome;
    g.task.push(t);
    gruppi.set(t.utenteEmail, g);
  }
  const ordinati = [...gruppi.entries()].sort((a, b) =>
    (a[1].nome ?? a[0]).localeCompare(b[1].nome ?? b[0], "it"),
  );

  const sub = admin
    ? `Le cose da fare di ogni persona, da tutte le app Deluxy. ${task.length} attività.`
    : `Le tue attività e quelle della tua squadra. ${task.length} attività.`;

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Attività</h1>
        <p className="page-sub">{sub}</p>
        {sessione && (
          <div className="utente-barra">
            <span>{sessione.nome}</span>
            <span className="utente-ruolo">{admin ? "Admin · tutti" : "La mia squadra"}</span>
          </div>
        )}
      </div>

      <Filtri sistemi={sistemiPresenti} />

      {erroreDb ? (
        <div className="vuoto">{erroreDb}</div>
      ) : ordinati.length === 0 ? (
        <div className="vuoto">Nessuna attività con questi filtri.</div>
      ) : (
        ordinati.map(([email, g]) => (
          <section className="gruppo" key={email}>
            <div className="gruppo-testa">
              <span className="gruppo-nome">{g.nome ?? email}</span>
              {g.nome && <span className="gruppo-email">{email}</span>}
              <span className="gruppo-conta">{g.task.length}</span>
            </div>
            <div className="lista">
              {g.task.map((t) => (
                <RigaTask key={t.id} task={toUI(t)} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
