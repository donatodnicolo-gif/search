import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { verificaCatena } from "@/lib/audit";
import { quando } from "@/components/Etichette";

// Il libro mastro. Ogni evento è agganciato all'hash del precedente: se
// qualcuno modifica o toglie una riga direttamente sul database, il controllo
// qui sopra lo dice e indica da dove.

export const dynamic = "force-dynamic";

const PER_PAGINA = 100;

export default async function Registro({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; q?: string; periodo?: string; pagina?: string }>;
}) {
  if (!(await operatoreCorrente())) redirect("/login");
  const sp = await searchParams;
  const tipo = (sp.tipo ?? "").trim();
  const q = (sp.q ?? "").trim();
  const pagina = Math.max(1, Number(sp.pagina ?? 1) || 1);

  // Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): un parametro solo.
  // Il periodo si applica alla data di SCRITTURA dell'evento (`creatoIl`):
  // il registro è in sola aggiunta, quella data non cambia mai.
  const PERIODI = ["mese", "scorso", "trimestre", "anno"] as const;
  const periodo = PERIODI.includes(sp.periodo as (typeof PERIODI)[number]) ? sp.periodo! : "";
  const oggi = new Date();
  const inizioMese = (n: number) => new Date(oggi.getFullYear(), oggi.getMonth() - n, 1);
  const intervallo =
    periodo === "mese" ? { gte: inizioMese(0) }
    : periodo === "scorso" ? { gte: inizioMese(1), lt: inizioMese(0) }
    : periodo === "trimestre" ? { gte: inizioMese(2) } // ultimi 3 mesi incluso il corrente
    : periodo === "anno" ? { gte: new Date(oggi.getFullYear(), 0, 1) }
    : null;

  const dove = {
    ...(tipo ? { tipo: { startsWith: tipo } } : {}),
    // La ricerca (Libro v1.9 §8-bis): come si riconosce un evento — chi l'ha
    // fatto (attore) o cosa dice (dettagli). Il tipo ha già il suo filtro.
    ...(q
      ? {
          OR: [
            { attore: { contains: q, mode: "insensitive" as const } },
            { dettagli: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(intervallo ? { creatoIl: intervallo } : {}),
  };
  const [totale, eventi, catena, tipi] = await Promise.all([
    prisma.evento.count({ where: dove }),
    prisma.evento.findMany({
      where: dove,
      orderBy: { seq: "desc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    verificaCatena(),
    prisma.evento.groupBy({ by: ["tipo"], _count: true, orderBy: { tipo: "asc" } }),
  ]);
  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Registro</h1>
          <p className="page-sub">{totale} eventi registrati, in sola aggiunta</p>
        </div>
      </div>

      <div className={`catena ${catena.integra ? "integra" : "rotta"}`}>
        {catena.integra ? (
          <span>
            Catena integra: {catena.totale} eventi verificati uno per uno. Nessuna riga è stata modificata dopo la
            scrittura.
          </span>
        ) : (
          <span>
            Catena interrotta all&apos;evento #{catena.primaRottura} ({catena.motivo}). Da lì in poi la storia non è più
            dimostrabile: va indagato chi ha scritto sul database fuori dall&apos;app.
          </span>
        )}
      </div>

      {/* Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): link GET fuori
          dal form — il submit del form non porta `periodo` e le azzera da solo. */}
      <div className="filtri riga-chips-scorri" style={{ marginBottom: 10 }}>
        {([
          { v: "mese", l: "Mese in corso" },
          { v: "scorso", l: "Mese scorso" },
          { v: "trimestre", l: "Trimestre" },
          { v: "anno", l: "Anno" },
        ] as const).map((p) => (
          <a
            key={p.v}
            href={`/registro?periodo=${p.v}${tipo ? `&tipo=${encodeURIComponent(tipo)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`chip-link${periodo === p.v ? " attiva" : ""}`}
          >
            {p.l}
          </a>
        ))}
        {periodo && (
          <a href={`/registro${tipo || q ? `?${new URLSearchParams({ ...(tipo ? { tipo } : {}), ...(q ? { q } : {}) })}` : ""}`} className="chip-link azzera">
            Tutte le date
          </a>
        )}
      </div>

      <form className="filtri" method="get">
        {/* La ricerca (Libro v1.9 §8-bis): attore o contenuto dei dettagli. */}
        <input type="search" name="q" defaultValue={q} placeholder="Cerca per attore o dettagli…" />
        <select name="tipo" defaultValue={tipo}>
          <option value="">Tutti i tipi</option>
          {tipi.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.tipo} ({t._count})
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Filtra
        </button>
      </form>

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Quando</th>
              <th>Evento</th>
              <th>Attore</th>
              <th>Dettagli</th>
              <th>Impronta</th>
            </tr>
          </thead>
          <tbody>
            {eventi.map((e) => (
              <tr key={e.seq}>
                <td className="cella-num">{e.seq}</td>
                <td className="cella-muta">{quando(e.creatoIl)}</td>
                <td>
                  <span className="cella-nome">{e.tipo}</span>
                  {e.richiestaId && (
                    <div className="cella-sub">
                      <a href={`/richieste/${e.richiestaId}`}>vai alla richiesta</a>
                    </div>
                  )}
                </td>
                <td className="cella-muta">
                  {e.attore}
                  {e.ip && <div className="cella-sub">{e.ip}</div>}
                </td>
                <td className="cella-muta" style={{ maxWidth: 320, overflowWrap: "anywhere" }}>
                  {e.dettagli === "{}" ? "—" : e.dettagli}
                </td>
                <td className="impronta">{e.hash.slice(0, 16)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagine > 1 && (
        <div className="paginazione">
          <span>
            pagina {pagina} di {pagine}
          </span>
          <nav>
            {pagina > 1 && (
              <a className="btn btn-secondario small" href={`/registro?tipo=${tipo}&q=${encodeURIComponent(q)}&periodo=${periodo}&pagina=${pagina - 1}`}>
                Precedente
              </a>
            )}
            {pagina < pagine && (
              <a className="btn btn-secondario small" href={`/registro?tipo=${tipo}&q=${encodeURIComponent(q)}&periodo=${periodo}&pagina=${pagina + 1}`}>
                Successiva
              </a>
            )}
          </nav>
        </div>
      )}
    </main>
  );
}
