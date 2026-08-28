import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { formattaIban } from "@/lib/iban";
import { ETICHETTE, STATI } from "@/lib/richieste";
import { BadgeStato, quando } from "@/components/Etichette";
import { RigaCliccabile } from "@/components/RigaCliccabile";

// Elenco completo con filtri. È l'archivio: qui non si decide niente, si cerca.

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;

export default async function Elenco({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; q?: string; periodo?: string; pagina?: string }>;
}) {
  if (!(await operatoreCorrente())) redirect("/login");
  const sp = await searchParams;
  const stato = sp.stato && STATI.includes(sp.stato as (typeof STATI)[number]) ? sp.stato : "";
  const q = (sp.q ?? "").trim();
  const pagina = Math.max(1, Number(sp.pagina ?? 1) || 1);

  // Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): un parametro solo.
  // Il periodo si applica alla data di CREAZIONE della richiesta (`creataIl`):
  // è la data che ogni riga ha di sicuro — quella di pagamento ce l'hanno solo
  // le richieste arrivate in fondo.
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
    ...(stato ? { stato } : {}),
    ...(q
      ? {
          OR: [
            { riferimento: { contains: q, mode: "insensitive" as const } },
            { beneficiario: { contains: q, mode: "insensitive" as const } },
            { causale: { contains: q, mode: "insensitive" as const } },
            { iban: { contains: q.replace(/\s/g, "").toUpperCase() } },
          ],
        }
      : {}),
    ...(intervallo ? { creataIl: intervallo } : {}),
  };

  const [totale, righe] = await Promise.all([
    prisma.richiesta.count({ where: dove }),
    prisma.richiesta.findMany({
      where: dove,
      orderBy: { creataIl: "desc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
  ]);
  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Richieste</h1>
          <p className="page-sub">{totale} richieste registrate</p>
        </div>
        <a className="btn btn-secondario" href="/richieste/nuova">
          Nuova richiesta
        </a>
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
            href={`/richieste?periodo=${p.v}${stato ? `&stato=${stato}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`chip-link${periodo === p.v ? " attiva" : ""}`}
          >
            {p.l}
          </a>
        ))}
        {periodo && (
          <a href={`/richieste${stato || q ? `?${new URLSearchParams({ ...(stato ? { stato } : {}), ...(q ? { q } : {}) })}` : ""}`} className="chip-link azzera">
            Tutte le date
          </a>
        )}
      </div>

      <form className="filtri" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Riferimento, beneficiario, causale, IBAN…" />
        <select name="stato" defaultValue={stato}>
          <option value="">Tutti gli stati</option>
          {STATI.map((s) => (
            <option key={s} value={s}>
              {ETICHETTE[s]}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Filtra
        </button>
      </form>

      {righe.length === 0 ? (
        <div className="vuoto">Nessuna richiesta con questi filtri.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Riferimento</th>
                <th>Beneficiario</th>
                <th className="num">Importo</th>
                <th>Origine</th>
                <th>Stato</th>
                <th>Creata</th>
                <th>Pagata</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <RigaCliccabile key={r.id} href={`/richieste/${r.id}`}>
                  <td>
                    <a href={`/richieste/${r.id}`} className="cella-nome">
                      {r.riferimento}
                    </a>
                    <div className="cella-sub">{r.causale}</div>
                  </td>
                  <td>
                    <div>{r.beneficiario}</div>
                    <div className="cella-sub iban">{formattaIban(r.iban)}</div>
                  </td>
                  <td className="cella-num importo">{euro(r.importoCent)}</td>
                  <td className="cella-muta">{r.origine}</td>
                  <td>
                    <BadgeStato stato={r.stato} pagatoCon={r.pagatoCon} />
                  </td>
                  <td className="cella-muta">{quando(r.creataIl)}</td>
                  <td className="cella-muta">{quando(r.pagataIl)}</td>
                </RigaCliccabile>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagine > 1 && (
        <div className="paginazione">
          <span>
            pagina {pagina} di {pagine}
          </span>
          <nav>
            {pagina > 1 && (
              <a className="btn btn-secondario small" href={`/richieste?stato=${stato}&q=${encodeURIComponent(q)}&periodo=${periodo}&pagina=${pagina - 1}`}>
                Precedente
              </a>
            )}
            {pagina < pagine && (
              <a className="btn btn-secondario small" href={`/richieste?stato=${stato}&q=${encodeURIComponent(q)}&periodo=${periodo}&pagina=${pagina + 1}`}>
                Successiva
              </a>
            )}
          </nav>
        </div>
      )}
    </main>
  );
}
