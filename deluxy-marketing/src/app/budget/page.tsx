import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTA_SITO, formattaEuro, MESI_IT, SITI } from "@/lib/dominio";

export const dynamic = "force-dynamic";

type Ripartizione = Record<string, { quota: number | null; giorno: number | null }>;

// Budget ADV mensile per sito con la ripartizione per canale/campagna
// (foglio "Budget adv" del Monitoraggio).
export default async function PaginaBudget() {
  const righe = await prisma.budgetMensile.findMany({
    orderBy: [{ sito: "asc" }, { anno: "desc" }, { mese: "asc" }],
  });

  return (
    <div className="layout">
      <Sidebar attiva="budget" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Budget ADV</h1>
            <p className="page-sub">
              Il budget pubblicitario mese per mese, con la ripartizione per canale e campagna
              (quota % e spesa al giorno). Fonte: foglio “Budget adv” del Monitoraggio.
            </p>
          </div>
        </div>

        {SITI.map((sito) => {
          const mesi = righe.filter((r) => r.sito === sito);
          if (mesi.length === 0) return null;
          return (
            <section className="scheda" key={sito}>
              <div className="scheda-titolo">{ETICHETTA_SITO[sito]}</div>
              {mesi.map((r) => {
                const rip: Ripartizione = r.ripartizione ? JSON.parse(r.ripartizione) : {};
                const vociGoogle = Object.entries(rip).filter(([v]) => !/meta|awareness|interesse|acquisto|retargeting/i.test(v));
                const vociMeta = Object.entries(rip).filter(([v]) => /meta|awareness|interesse|acquisto|retargeting/i.test(v));
                return (
                  <div key={r.id} style={{ borderTop: "1px solid var(--hairline)", padding: "14px 0" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "baseline", marginBottom: 8 }}>
                      <span className="cella-nome" style={{ fontSize: 15 }}>
                        {MESI_IT[r.mese - 1]} {r.anno}
                      </span>
                      <span className="cella-muta">
                        Vendite previste {formattaEuro(r.venditaPrevista)} · ROS {r.ros ?? "—"} ·{" "}
                        <b style={{ color: "var(--gold-strong)" }}>{formattaEuro(r.budgetMese)}/mese</b> ({formattaEuro(r.budgetGiorno)}/giorno)
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[...vociGoogle, ...vociMeta].map(([voce, val]) => (
                        <span className="badge" key={voce} style={{ color: /meta|awareness|interesse|acquisto|retargeting/i.test(voce) ? "var(--blue)" : "var(--gold-strong)" }}>
                          <span className="dot" />
                          <span style={{ color: "var(--text)" }}>
                            {voce}
                            {val.quota != null ? ` ${(val.quota * 100).toFixed(0)}%` : ""}
                            {val.giorno != null ? ` · ${formattaEuro(val.giorno)}/g` : ""}
                          </span>
                        </span>
                      ))}
                      {Object.keys(rip).length === 0 && <span className="cella-muta">Nessuna ripartizione</span>}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
        {righe.length === 0 && (
          <div className="vuoto">Nessun budget importato: npm run import:monitoraggio.</div>
        )}
      </main>
    </div>
  );
}
