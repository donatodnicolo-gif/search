import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/calc";
import { eur, MESI, num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Commerciale() {
  const linee = await prisma.lineaCommerciale.findMany({
    orderBy: { ordine: "asc" },
    include: { targets: { where: { year: ANNO_CORRENTE } } },
  });

  const valore = (l: (typeof linee)[number], month: number) =>
    l.targets.find((t) => t.month === month)?.valore ?? 0;
  const clienti = (l: (typeof linee)[number], month: number) =>
    l.targets.find((t) => t.month === month)?.clienti ?? 0;
  const totValore = (l: (typeof linee)[number]) => l.targets.reduce((s, t) => s + t.valore, 0);
  const totClienti = (l: (typeof linee)[number]) => l.targets.reduce((s, t) => s + t.clienti, 0);
  const granTotale = linee.reduce((s, l) => s + totValore(l), 0);
  const granClienti = linee.reduce((s, l) => s + totClienti(l), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Team commerciale</h1>
          <p className="page-caption">
            Budget {ANNO_CORRENTE} per linea di business e nuovi clienti (fonte: target nuovi clienti dei budget pubblicati).
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn primary" href="/proposte/nuova">Invia proposta budget</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Valore anno — tutte le linee</div>
          <div className="kpi-value">{eur(granTotale)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Nuovi clienti / attivazioni</div>
          <div className="kpi-value">{num(granClienti)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Linee attive</div>
          <div className="kpi-value">{linee.length}</div>
        </div>
      </div>

      <h2 className="section-title">Valore per linea (€ / mese)</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linea</th>
                {MESI.map((m) => (
                  <th className="num" key={m}>{m}</th>
                ))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{l.nome}</td>
                  {MESI.map((_, i) => (
                    <td className="num" key={i}>{valore(l, i + 1) ? eur(valore(l, i + 1)) : <span className="muted">—</span>}</td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>{eur(totValore(l))}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale</td>
                {MESI.map((_, i) => (
                  <td className="num" key={i}>
                    {eur(linee.reduce((s, l) => s + valore(l, i + 1), 0))}
                  </td>
                ))}
                <td className="num">{eur(granTotale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Nuovi clienti per linea (numero / mese)</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linea</th>
                {MESI.map((m) => (
                  <th className="num" key={m}>{m}</th>
                ))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{l.nome}</td>
                  {MESI.map((_, i) => (
                    <td className="num" key={i}>{clienti(l, i + 1) ? num(clienti(l, i + 1)) : <span className="muted">—</span>}</td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>{num(totClienti(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
