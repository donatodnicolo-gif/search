import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// ESTRATTO CONTO UNICO. Tutti i movimenti bancari in un posto solo — quelli
// che arrivano in automatico da Qonto e quelli caricati da file (Vivid e altre
// banche) — sommati. È la vista «guardo la banca» del quotidiano; l'import e la
// riconciliazione stanno in /transazioni, qui si legge.
//
// I due mondi si distinguono dal campo `fonte`: "Qonto (…)" per la sync
// automatica, un nome di file per i caricamenti. Non è una colonna a parte, è
// la stessa tabella: qui non si duplica niente, si mostra tutto.

const PER_PAGINA = 100;

function badgeStato(stato: string) {
  if (stato === "registrata") return <span className="badge green"><span className="dot" />Registrata</span>;
  if (stato === "ignorata") return <span className="badge neutral"><span className="dot" />Ignorata</span>;
  return <span className="badge blue"><span className="dot" />Da lavorare</span>;
}

function daQonto(fonte: string | null): boolean {
  return (fonte ?? "").startsWith("Qonto");
}

export default async function MovimentiPage({
  searchParams,
}: {
  searchParams: Promise<{
    fonte?: string; dir?: string; q?: string; dal?: string; al?: string; stato?: string; pag?: string;
  }>;
}) {
  const sp = await searchParams;

  // ————— filtri, tradotti in un unico `where` Prisma —————
  const where: Prisma.TransazioneBancariaWhereInput = {};

  // fonte: tutte · qonto · file (tutto ciò che non è Qonto)
  if (sp.fonte === "qonto") where.fonte = { startsWith: "Qonto" };
  else if (sp.fonte === "file") where.fonte = { not: { startsWith: "Qonto" } };

  // direzione del denaro
  if (sp.dir === "entrate") where.importo = { gt: 0 };
  else if (sp.dir === "uscite") where.importo = { lt: 0 };

  // stato di lavorazione
  if (sp.stato && ["nuova", "registrata", "ignorata"].includes(sp.stato)) where.stato = sp.stato;

  // periodo
  const dal = sp.dal ? new Date(sp.dal + "T00:00:00.000Z") : null;
  const al = sp.al ? new Date(sp.al + "T23:59:59.999Z") : null;
  if (dal && !isNaN(dal.getTime())) where.data = { ...(where.data as object), gte: dal };
  if (al && !isNaN(al.getTime())) where.data = { ...(where.data as object), lte: al };

  // ricerca morbida: ogni termine in descrizione/controparte/fonte, oppure importo
  const query = (sp.q ?? "").trim();
  const termini = query.split(/\s+/).filter(Boolean);
  if (termini.length) {
    where.AND = termini.map((term) => {
      const n = parseFloat(term.replace(",", "."));
      const perImporto =
        !isNaN(n) && term.length > 1
          ? [{ importo: { gte: n - 0.005, lte: n + 0.005 } }, { importo: { gte: -n - 0.005, lte: -n + 0.005 } }]
          : [];
      return {
        OR: [
          { descrizione: { contains: term, mode: "insensitive" as const } },
          { controparte: { contains: term, mode: "insensitive" as const } },
          { fonte: { contains: term, mode: "insensitive" as const } },
          ...perImporto,
        ],
      };
    });
  }

  const pag = Math.max(1, parseInt(sp.pag ?? "1") || 1);

  // Una passata per i KPI (conteggi e somme sul FILTRO attivo, non sull'intera
  // banca), le fonti per il riquadro, e la pagina di righe.
  const [totale, entrate, uscite, perFonte, righe] = await Promise.all([
    prisma.transazioneBancaria.count({ where }),
    prisma.transazioneBancaria.aggregate({ where: { ...where, importo: { ...(typeof where.importo === "object" ? where.importo : {}), gt: 0 } }, _count: true, _sum: { importo: true } }),
    prisma.transazioneBancaria.aggregate({ where: { ...where, importo: { ...(typeof where.importo === "object" ? where.importo : {}), lt: 0 } }, _count: true, _sum: { importo: true } }),
    prisma.transazioneBancaria.groupBy({ by: ["fonte"], where, _count: { _all: true } }),
    prisma.transazioneBancaria.findMany({
      where,
      orderBy: [{ data: "desc" }, { id: "desc" }],
      skip: (pag - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const sommaEntrate = entrate._sum.importo ?? 0;
  const sommaUscite = uscite._sum.importo ?? 0;
  const nettoFonte = perFonte.reduce(
    (acc, r) => {
      if (daQonto(r.fonte)) acc.qonto += r._count._all;
      else acc.file += r._count._all;
      return acc;
    },
    { qonto: 0, file: 0 }
  );

  // link che conserva i filtri e cambia una cosa sola
  const link = (patch: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      fonte: sp.fonte, dir: sp.dir, q: sp.q, dal: sp.dal, al: sp.al, stato: sp.stato, pag: String(pag),
    };
    for (const [k, v] of Object.entries({ ...base, ...patch })) {
      if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
    }
    return `/movimenti?${qs.toString()}`;
  };

  const importo = (v: number) => (
    <span className={`num ${v > 0 ? "pos" : "neg"}`} style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
      {v > 0 ? "+" : ""}{euro(v)}
    </span>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Movimenti bancari</h1>
          <p className="page-caption">
            L&apos;estratto conto unico: i movimenti che arrivano da Qonto e quelli caricati da file,
            tutti insieme. Per caricare un estratto o riconciliare, vai a <Link href="/transazioni">Import &amp; riconciliazione</Link>.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Movimenti {totale !== null && "(filtro attivo)"}</div>
          <div className="kpi-value">{totale.toLocaleString("it-IT")}</div>
          <div className="kpi-sub">{nettoFonte.qonto.toLocaleString("it-IT")} da Qonto · {nettoFonte.file.toLocaleString("it-IT")} da file</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Entrate</div>
          <div className="kpi-value pos">{euro(sommaEntrate)}</div>
          <div className="kpi-sub">{entrate._count.toLocaleString("it-IT")} accrediti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Uscite</div>
          <div className="kpi-value neg">{euro(sommaUscite)}</div>
          <div className="kpi-sub">{uscite._count.toLocaleString("it-IT")} addebiti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Saldo netto del periodo</div>
          <div className={`kpi-value ${sommaEntrate + sommaUscite >= 0 ? "pos" : "neg"}`}>{euro(sommaEntrate + sommaUscite)}</div>
          <div className="kpi-sub">entrate meno uscite sul filtro</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <input type="text" name="q" placeholder="Cerca descrizione, controparte, importo…" defaultValue={sp.q ?? ""} />
          <select name="fonte" defaultValue={sp.fonte ?? ""} aria-label="Fonte del movimento">
            <option value="">Tutte le fonti</option>
            <option value="qonto">Solo Qonto (automatici)</option>
            <option value="file">Solo caricati da file</option>
          </select>
          <select name="dir" defaultValue={sp.dir ?? ""} aria-label="Entrate o uscite">
            <option value="">Entrate e uscite</option>
            <option value="entrate">Solo entrate</option>
            <option value="uscite">Solo uscite</option>
          </select>
          <select name="stato" defaultValue={sp.stato ?? ""} aria-label="Stato di lavorazione">
            <option value="">Ogni stato</option>
            <option value="nuova">Da lavorare</option>
            <option value="registrata">Registrate</option>
            <option value="ignorata">Ignorate</option>
          </select>
          <input type="date" name="dal" defaultValue={sp.dal ?? ""} aria-label="Dal giorno" />
          <input type="date" name="al" defaultValue={sp.al ?? ""} aria-label="Al giorno" />
          <button className="btn secondary small" type="submit">Filtra</button>
          {(sp.q || sp.fonte || sp.dir || sp.stato || sp.dal || sp.al) && (
            <Link href="/movimenti" className="btn secondary small">Azzera</Link>
          )}
        </form>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Movimento</th>
                <th>Fonte</th>
                <th>Stato</th>
                <th className="num">Importo</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((tx) => (
                <tr key={tx.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/movimenti/${tx.id}`}>{dataIt(tx.data)}</Link>
                  </td>
                  <td style={{ maxWidth: 420 }}>
                    <Link href={`/movimenti/${tx.id}`} style={{ fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tx.descrizione}>
                      {tx.descrizione}
                    </Link>
                    {tx.controparte && <div className="muted" style={{ fontSize: 12 }}>{tx.controparte}</div>}
                    {tx.categoriaNome && <div className="muted" style={{ fontSize: 11.5 }}>· {tx.categoriaNome}</div>}
                  </td>
                  <td>
                    {daQonto(tx.fonte) ? (
                      <span className="badge blue" title={tx.fonte ?? ""}><span className="dot" />Qonto</span>
                    ) : (
                      <span className="badge neutral" title={tx.fonte ?? "file"}><span className="dot" />File</span>
                    )}
                  </td>
                  <td>{badgeStato(tx.stato)}</td>
                  <td className="num">{importo(tx.importo)}</td>
                </tr>
              ))}
              {righe.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--text-secondary)" }}>
                    Nessun movimento con questi filtri.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagine > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 12, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Pagina {pag} di {pagine} · {totale.toLocaleString("it-IT")} movimenti
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {pag > 1 && <Link className="btn secondary small" href={link({ pag: pag - 1 })}>← Precedenti</Link>}
            {pag < pagine && <Link className="btn secondary small" href={link({ pag: pag + 1 })}>Successivi →</Link>}
          </div>
        </div>
      )}
    </>
  );
}
