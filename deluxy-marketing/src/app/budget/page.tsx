import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTA_SITO, formattaEuro, MESI_IT, SITI } from "@/lib/dominio";

export const dynamic = "force-dynamic";

type Ripartizione = Record<string, { quota: number | null; giorno: number | null }>;

// Budget ADV in stile calendario: mesi in colonna, voci in riga
// (foglio "Budget adv" del Monitoraggio).
export default async function PaginaBudget({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>;
}) {
  const { anno: annoParam } = await searchParams;
  const anno = Number(annoParam) || 2026;
  const righe = await prisma.budgetMensile.findMany({
    where: { anno },
    orderBy: [{ sito: "asc" }, { mese: "asc" }],
  });

  return (
    <div className="layout">
      <Sidebar attiva="budget" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Budget ADV {anno}</h1>
            <p className="page-sub">
              Il calendario del budget pubblicitario: mesi in colonna, canali e campagne in riga
              (spesa al giorno; la % è la quota della voce). Fonte: foglio “Budget adv” del
              Monitoraggio, si aggiorna con l&apos;import.
            </p>
          </div>
        </div>

        {SITI.map((sito) => {
          const mesi = righe.filter((r) => r.sito === sito);
          if (mesi.length === 0) return null;
          const ripartizioni = mesi.map((m) => (m.ripartizione ? (JSON.parse(m.ripartizione) as Ripartizione) : {}));
          // tutte le voci di ripartizione viste nell'anno, in ordine di apparizione
          const voci: string[] = [];
          for (const rip of ripartizioni) {
            for (const voce of Object.keys(rip)) if (!voci.includes(voce)) voci.push(voce);
          }
          const quotaDi = (voce: string) => {
            for (const rip of ripartizioni) if (rip[voce]?.quota != null) return rip[voce].quota;
            return null;
          };
          const totaleAnno = mesi.reduce((s, m) => s + (m.budgetMese ?? 0), 0);

          return (
            <section className="scheda" key={sito} style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ padding: "20px 24px 4px" }}>
                {ETICHETTA_SITO[sito]} — {formattaEuro(totaleAnno)} nell&apos;anno
              </div>
              <div style={{ overflowX: "auto", paddingBottom: 8 }}>
                <table className="tabella-calendario">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 190 }}>Voce</th>
                      {mesi.map((m) => (
                        <th className="num" key={m.id}>{MESI_IT[m.mese - 1]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="cella-muta">Vendite previste</td>
                      {mesi.map((m) => (
                        <td className="num cella-muta" key={m.id}>{formattaEuro(m.venditaPrevista)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="cella-muta">ROS</td>
                      {mesi.map((m) => (
                        <td className="num cella-muta" key={m.id}>{m.ros ?? "—"}</td>
                      ))}
                    </tr>
                    <tr className="riga-forte">
                      <td className="cella-nome">Budget mese</td>
                      {mesi.map((m) => (
                        <td className="num" key={m.id} style={{ color: "var(--gold-strong)", fontWeight: 600 }}>
                          {formattaEuro(m.budgetMese)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="cella-muta">Budget / giorno</td>
                      {mesi.map((m) => (
                        <td className="num cella-muta" key={m.id}>{formattaEuro(m.budgetGiorno)}</td>
                      ))}
                    </tr>
                    {voci.map((voce) => {
                      const quota = quotaDi(voce);
                      const meta = /meta|awareness|interesse|acquisto|retargeting/i.test(voce);
                      return (
                        <tr key={voce}>
                          <td>
                            <span className="sb-dot" style={{ display: "inline-block", width: 7, height: 7, marginRight: 8, background: meta ? "var(--blue)" : "var(--gold)" }} />
                            {voce}
                            {quota != null && <span className="cella-sub" style={{ display: "inline", marginLeft: 6 }}>{(quota * 100).toFixed(0)}%</span>}
                          </td>
                          {mesi.map((m, i) => {
                            const val = ripartizioni[i][voce]?.giorno;
                            return (
                              <td className="num" key={m.id}>
                                {val != null ? `${formattaEuro(val)}/g` : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {righe.length === 0 && (
          <div className="vuoto">Nessun budget importato per il {anno}: npm run import:monitoraggio.</div>
        )}
      </main>
    </div>
  );
}
