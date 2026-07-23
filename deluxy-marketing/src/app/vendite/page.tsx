import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTA_SITO, formattaEuro, MESI_IT, SITI } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// SALES GLOBAL 26 — vendite e budget ADV mensili per sito (import dal Monitoraggio).
export default async function PaginaVendite({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>;
}) {
  const { anno: annoParam } = await searchParams;
  const anni = await prisma.venditaMensile.groupBy({ by: ["anno"], orderBy: { anno: "desc" } });
  const anno = Number(annoParam) || anni[0]?.anno || 2026;
  const righe = await prisma.venditaMensile.findMany({
    where: { anno },
    orderBy: [{ sito: "asc" }, { mese: "asc" }],
  });

  const totAnno = (sito: string, campo: "vendite" | "totale" | "budgetAdv") =>
    righe.filter((r) => r.sito === sito).reduce((s, r) => s + ((r[campo] as number | null) ?? 0), 0);
  const totaleVendite = SITI.reduce((s, sito) => s + totAnno(sito, "vendite"), 0);
  const totaleBudget = SITI.reduce((s, sito) => s + totAnno(sito, "budgetAdv"), 0);

  return (
    <div className="layout">
      <Sidebar attiva="vendite" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Budget vendite — Sales Global {anno}</h1>
            <p className="page-sub">
              Il budget vendite mensile per sito con il budget ADV corrispondente (foglio
              “SALES GLOBAL 26 - REVISED” del Monitoraggio). Si aggiorna con{" "}
              <b>npm run import:monitoraggio</b>.
            </p>
          </div>
          <form className="filtri" method="get" style={{ marginBottom: 0 }}>
            <select name="anno" defaultValue={String(anno)}>
              {anni.map((a) => (
                <option key={a.anno} value={a.anno}>{a.anno}</option>
              ))}
            </select>
            <button className="btn small" type="submit">Vai</button>
          </form>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totaleVendite)}</div>
            <div className="kpi-etichetta">Budget vendite {anno} (tutti i siti)</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totaleBudget)}</div>
            <div className="kpi-etichetta">Budget ADV {anno}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {totaleVendite > 0 ? `${((totaleBudget / totaleVendite) * 100).toFixed(1)}%` : "—"}
            </div>
            <div className="kpi-etichetta">Incidenza ADV su vendite</div>
          </div>
        </div>

        {SITI.map((sito) => {
          const mesi = righe.filter((r) => r.sito === sito);
          if (mesi.length === 0) return null;
          return (
            <section className="scheda" key={sito} style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ padding: "20px 24px 0" }}>
                {ETICHETTA_SITO[sito]} — {formattaEuro(totAnno(sito, "vendite"))} vendite ·{" "}
                {formattaEuro(totAnno(sito, "budgetAdv"))} budget ADV
              </div>
              <div style={{ overflowX: "auto", padding: "0 0 8px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Mese</th>
                      <th className="num">Vendite</th>
                      <th className="num">% anno</th>
                      <th className="num">B2B</th>
                      <th className="num">Eventi</th>
                      <th className="num">Totale</th>
                      <th className="num">Budget ADV</th>
                      <th className="num">ADV / vendite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesi.map((r) => (
                      <tr key={r.id}>
                        <td className="cella-nome">{MESI_IT[r.mese - 1]}</td>
                        <td className="num">{formattaEuro(r.vendite)}</td>
                        <td className="num cella-muta">
                          {r.quotaAnno != null ? `${(r.quotaAnno * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="num cella-muta">{formattaEuro(r.b2b)}</td>
                        <td className="num cella-muta">{formattaEuro(r.eventi)}</td>
                        <td className="num">{r.totale ? formattaEuro(r.totale) : "—"}</td>
                        <td className="num" style={{ color: "var(--gold-strong)", fontWeight: 600 }}>
                          {formattaEuro(r.budgetAdv)}
                        </td>
                        <td className="num cella-muta">
                          {r.vendite && r.budgetAdv ? `${((r.budgetAdv / r.vendite) * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {righe.length === 0 && (
          <div className="vuoto">
            Nessun dato per il {anno}: importare il Monitoraggio con npm run import:monitoraggio.
          </div>
        )}
      </main>
    </div>
  );
}
