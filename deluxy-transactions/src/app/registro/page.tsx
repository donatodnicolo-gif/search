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
  searchParams: Promise<{ tipo?: string; pagina?: string }>;
}) {
  if (!(await operatoreCorrente())) redirect("/login");
  const sp = await searchParams;
  const tipo = (sp.tipo ?? "").trim();
  const pagina = Math.max(1, Number(sp.pagina ?? 1) || 1);

  const dove = tipo ? { tipo: { startsWith: tipo } } : {};
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

      <form className="filtri" method="get">
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
              <a className="btn btn-secondario small" href={`/registro?tipo=${tipo}&pagina=${pagina - 1}`}>
                Precedente
              </a>
            )}
            {pagina < pagine && (
              <a className="btn btn-secondario small" href={`/registro?tipo=${tipo}&pagina=${pagina + 1}`}>
                Successiva
              </a>
            )}
          </nav>
        </div>
      )}
    </main>
  );
}
