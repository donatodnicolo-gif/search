import { Sidebar } from "@/components/Sidebar";
import { VenditeAttese } from "@/components/VenditeAttese";
import { salvaBudgetVendite } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { ETICHETTA_SITO, formattaEuro, MESI_IT, SITI } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// SALES GLOBAL 26 — vendite e budget ADV mensili per sito (import dal Monitoraggio).
export default async function PaginaVendite({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; salvato?: string }>;
}) {
  const { anno: annoParam, salvato } = await searchParams;
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
  const adesso = new Date();
  const meseCorrente = adesso.getMonth() + 1;
  // Tutti e dodici i mesi, anche quelli che l'import non ha portato: un mese
  // che manca è un mese che non si può scrivere, e questa è la pagina dove si
  // scrive il piano.
  const MESI_TUTTI = Array.from({ length: 12 }, (_, i) => i + 1);
  const rigaDi = (sito: string, mese: number) => righe.find((r) => r.sito === sito && r.mese === mese);
  const cella = (v: number | null | undefined) => (v == null ? "" : String(Math.round(v)));

  return (
    <div className="layout">
      <Sidebar attiva="vendite" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Budget vendite — Sales Global {anno}</h1>
            <p className="page-sub">
              Quanto ci si aspetta di vendere ogni mese, per sito, e quanto si è deciso di
              spendere in pubblicità per farlo (foglio “SALES GLOBAL 26 - REVISED” del
              Monitoraggio). <b>Si scrive qui</b>: l&apos;import serve a caricarlo tutto in una
              volta, non a cambiarne un pezzo.
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

        {salvato && (
          <div className="conferma">
            <span className="segno">✓</span>{" "}
            {salvato === "niente"
              ? "Non c'era niente da salvare: nessuna casella è cambiata."
              : `Budget salvato: ${salvato} ${salvato === "1" ? "valore aggiornato" : "valori aggiornati"}.`}
          </div>
        )}

        <form action={salvaBudgetVendite}>
          <input type="hidden" name="anno" value={anno} />

          {SITI.map((sito) => (
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
                      <th className="num" title="Quanto ci si aspetta di vendere">Vendite attese €</th>
                      <th className="num" title="Quanto si è deciso di spendere in pubblicità">Budget ADV €</th>
                      <th className="num">ADV / vendite</th>
                      <th className="num">% anno</th>
                      <th className="num">B2B</th>
                      <th className="num">Eventi</th>
                      <th className="num">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MESI_TUTTI.map((mese) => {
                      const r = rigaDi(sito, mese);
                      const incidenza =
                        r?.vendite && r?.budgetAdv ? (r.budgetAdv / r.vendite) * 100 : null;
                      return (
                        <tr
                          key={mese}
                          style={mese === meseCorrente ? { background: "rgba(184,150,62,.07)" } : undefined}
                        >
                          <td className="cella-nome">
                            {MESI_IT[mese - 1]}
                            {mese === meseCorrente && (
                              <div className="cella-sub">mese in corso</div>
                            )}
                          </td>
                          <td className="num">
                            <input
                              name={`riga:${sito}:${mese}:vendite`}
                              defaultValue={cella(r?.vendite)}
                              inputMode="numeric"
                              placeholder="—"
                              style={{ width: 110, textAlign: "right", font: "inherit", padding: "5px 8px", borderRadius: 7, border: "1px solid var(--hairline-strong)" }}
                            />
                          </td>
                          <td className="num">
                            <input
                              name={`riga:${sito}:${mese}:budgetAdv`}
                              defaultValue={cella(r?.budgetAdv)}
                              inputMode="numeric"
                              placeholder="—"
                              style={{ width: 110, textAlign: "right", font: "inherit", padding: "5px 8px", borderRadius: 7, border: "1px solid var(--hairline-strong)", color: "var(--gold-strong)", fontWeight: 600 }}
                            />
                          </td>
                          <td className="num cella-muta">
                            {incidenza != null ? `${incidenza.toFixed(1)}%` : "—"}
                          </td>
                          <td className="num cella-muta">
                            {r?.quotaAnno != null ? `${(r.quotaAnno * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="num cella-muta">{formattaEuro(r?.b2b ?? null)}</td>
                          <td className="num cella-muta">{formattaEuro(r?.eventi ?? null)}</td>
                          <td className="num cella-muta">{r?.totale ? formattaEuro(r.totale) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <div className="azioni-modulo" style={{ marginBottom: 18 }}>
            <button className="btn" type="submit">Salva il budget {anno}</button>
            <span className="cella-sub" style={{ alignSelf: "center" }}>
              Una casella svuotata cancella il numero invece di salvare zero: «zero vendite
              attese» è una previsione, «non lo so» è un&apos;altra cosa.
            </span>
          </div>
        </form>

        <div className="cella-sub" style={{ marginBottom: 18, whiteSpace: "normal" }}>
          <b>Attenzione:</b> lanciare <code>npm run import:monitoraggio</code> riscrive queste
          righe con quelle dell&apos;Excel. Se cambi un mese qui e poi reimporti il foglio senza
          averlo aggiornato, la modifica sparisce. Le colonne grigie (B2B, eventi, totale, % anno)
          arrivano solo dall&apos;import e non si scrivono a mano.
        </div>

        <VenditeAttese anno={anno} mese={meseCorrente} />

        {righe.length === 0 && (
          <div className="vuoto">
            Nessun dato per il {anno}: importare il Monitoraggio con npm run import:monitoraggio.
          </div>
        )}
      </main>
    </div>
  );
}
