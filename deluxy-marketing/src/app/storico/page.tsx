import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTA_ENTITA_REGISTRO, formattaDataOra } from "@/lib/dominio";

export const dynamic = "force-dynamic";

const COLORE_TIPO: Record<string, string> = {
  creazione: "var(--green)",
  modifica: "var(--blue)",
  stato: "var(--gold-strong)",
  feedback: "var(--purple)",
  import: "var(--blue)",
  sync: "var(--text-secondary)",
};

// Storico globale: tutte le modifiche registrate nell'app, in ordine di tempo.
// È il gemello digitale dello "00.2 Registro Modifiche" del Drive.
export default async function PaginaStorico({
  searchParams,
}: {
  searchParams: Promise<{ entita?: string; q?: string }>;
}) {
  const { entita, q } = await searchParams;
  const [eventi, entitaDisponibili] = await Promise.all([
    prisma.registroEvento.findMany({
      where: {
        ...(entita ? { entita } : {}),
        ...(q ? { OR: [{ titolo: { contains: q } }, { dettaglio: { contains: q } }] } : {}),
      },
      orderBy: { creatoIl: "desc" },
      take: 300,
    }),
    prisma.registroEvento.groupBy({ by: ["entita"], orderBy: { entita: "asc" } }),
  ]);

  return (
    <div className="layout">
      <Sidebar attiva="storico" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Storico</h1>
            <p className="page-sub">
              Tutte le modifiche effettuate nell&apos;app, chi le ha fatte e quando: analisi
              depositate, cambi di stato, feedback, import e sincronizzazioni. Il gemello del
              registro 00.2 su Drive.
            </p>
          </div>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca nello storico…" defaultValue={q ?? ""} />
          <select name="entita" defaultValue={entita ?? ""}>
            <option value="">Tutte le entità</option>
            {entitaDisponibili.map((e) => (
              <option key={e.entita} value={e.entita}>
                {ETICHETTA_ENTITA_REGISTRO[e.entita] ?? e.entita}
              </option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {eventi.length === 0 ? (
          <div className="vuoto">Nessuna modifica registrata con questi filtri.</div>
        ) : (
          <section className="scheda">
            <ul className="storia">
              {eventi.map((e) => (
                <li key={e.id}>
                  <span className="storia-data">{formattaDataOra(e.creatoIl)}</span>
                  <span className="storia-testo">
                    <Badge
                      testo={ETICHETTA_ENTITA_REGISTRO[e.entita] ?? e.entita}
                      colore={COLORE_TIPO[e.tipo] ?? "var(--text-tertiary)"}
                    />{" "}
                    <b>{e.titolo}</b>
                    {e.dettaglio && (
                      <span className="cella-sub" style={{ whiteSpace: "normal" }}>{e.dettaglio}</span>
                    )}
                  </span>
                  <span className="storia-autore">{e.autore}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
