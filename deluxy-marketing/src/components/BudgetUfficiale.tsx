import { budgetDaBudgets, meseDiSito } from "@/lib/budgets";
import { ETICHETTA_SITO, formattaEuro, MESI_IT, SITI } from "@/lib/dominio";

// **Quanto si può spendere, secondo Budgets.**
//
// Il tetto ADV non nasce qui: nasce dal budget di vendita della maison, che sta
// in deluxy-budgets — `advConsentito = vendite del mese × % decisa in /spese`.
// Fino al 01/08/2026 questa app ne teneva una **copia propria** (`BudgetMensile`,
// importata a mano dal foglio «Budget adv» del Monitoraggio) e non parlava con
// nessuno: al momento di collegarle la copia locale si fermava ad **agosto**,
// quindi da settembre in poi qui non c'era nessun tetto, mentre Budgets sapeva
// già quanto si poteva spendere fino a dicembre.
//
// Le due cifre restano **affiancate e non fuse**, di proposito: sono due strade
// diverse per lo stesso numero — qui il ROS, là una percentuale sulle vendite —
// e dove si discostano la differenza è **una domanda da fare**, non un errore da
// nascondere sotto una media.

export async function BudgetUfficiale({
  anno,
  locali,
}: {
  anno: number;
  locali: { sito: string; mese: number; budgetMese: number | null }[];
}) {
  const esito = await budgetDaBudgets(anno);
  const localeDi = (sito: string, mese: number) =>
    locali.find((r) => r.sito === sito && r.mese === mese)?.budgetMese ?? null;

  if (!esito.ok) {
    return (
      <section className="scheda" style={{ marginBottom: 18, borderColor: "var(--orange)" }}>
        <div className="scheda-titolo">Budget ufficiale da Deluxy Budgets — non disponibile</div>
        <p className="page-sub" style={{ margin: "6px 0 0" }}>
          {esito.errore} Finché non si legge, in questa pagina resta solo il budget importato a mano dal
          Monitoraggio, che <strong>non sa niente delle proposte approvate</strong> in Budgets.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="scheda" style={{ marginBottom: 18 }}>
        <div className="scheda-titolo">Quanto si può spendere, secondo Budgets</div>
        <p className="page-sub" style={{ margin: "6px 0 0" }}>
          Il tetto pubblicitario <strong>non nasce qui</strong>: nasce dal budget di vendita della maison, che
          vive in <strong>Deluxy Budgets</strong> — dove si propone, si approva e si consolida, con un autore e
          una data. L&apos;<strong>ADV consentito</strong> è le vendite del mese per la percentuale decisa lì, e
          copre <strong>tutti e dodici i mesi</strong>. Il budget calcolato in questa pagina dal ROS resta sotto,
          affiancato: sono due strade per lo stesso numero, e dove si discostano la differenza è una domanda da
          fare — non un errore da nascondere.
        </p>
      </section>

      {SITI.map((sito) => {
        const mesi = Array.from({ length: 12 }, (_, i) => i + 1);
        const totale = mesi.reduce((s, m) => s + (meseDiSito(esito, sito, m)?.advConsentito ?? 0), 0);
        const mancanti = mesi.filter((m) => localeDi(sito, m) === null).length;
        return (
          <section className="scheda" key={sito} style={{ padding: 0, marginBottom: 18 }}>
            <div className="scheda-titolo" style={{ padding: "20px 24px 4px" }}>
              {ETICHETTA_SITO[sito]} — {formattaEuro(totale)} di ADV consentito nell&apos;anno
            </div>
            <div style={{ overflowX: "auto", paddingBottom: 8 }}>
              <table className="tabella-calendario">
                <thead>
                  <tr>
                    <th style={{ minWidth: 190 }}>Voce</th>
                    {mesi.map((m) => (<th className="num" key={m}>{MESI_IT[m - 1]}</th>))}
                    <th className="num">Anno</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="cella-muta">Vendite a budget</td>
                    {mesi.map((m) => (
                      <td className="num cella-muta" key={m}>
                        {formattaEuro(meseDiSito(esito, sito, m)?.venditeTotali ?? 0)}
                      </td>
                    ))}
                    <td className="num cella-muta">
                      {formattaEuro(mesi.reduce((s, m) => s + (meseDiSito(esito, sito, m)?.venditeTotali ?? 0), 0))}
                    </td>
                  </tr>
                  <tr>
                    <td className="cella-muta">% ADV sulle vendite</td>
                    {mesi.map((m) => {
                      const x = meseDiSito(esito, sito, m);
                      return (
                        <td className="num cella-muta" key={m}>
                          {x ? `${x.advPercent.toLocaleString("it-IT")}%` : "—"}
                        </td>
                      );
                    })}
                    <td className="num cella-muta" />
                  </tr>
                  <tr className="riga-forte">
                    <td className="cella-nome">ADV consentito</td>
                    {mesi.map((m) => (
                      <td className="num" key={m} style={{ color: "var(--gold-strong)", fontWeight: 600 }}>
                        {formattaEuro(meseDiSito(esito, sito, m)?.advConsentito ?? 0)}
                      </td>
                    ))}
                    <td className="num" style={{ color: "var(--gold-strong)", fontWeight: 600 }}>
                      {formattaEuro(totale)}
                    </td>
                  </tr>
                  {/* Il budget calcolato qui dal ROS, accanto. Dove manca non si
                      mette zero: un mese senza riga importata non è un mese a
                      budget zero, è un mese che nessuno ha ancora caricato. */}
                  <tr>
                    <td className="cella-muta">Budget da ROS (questa pagina)</td>
                    {mesi.map((m) => {
                      const l = localeDi(sito, m);
                      return (
                        <td className="num cella-muta" key={m}>
                          {l === null ? "—" : formattaEuro(l)}
                        </td>
                      );
                    })}
                    <td className="num cella-muta">
                      {formattaEuro(mesi.reduce((s, m) => s + (localeDi(sito, m) ?? 0), 0))}
                    </td>
                  </tr>
                  <tr>
                    <td className="cella-muta">Differenza</td>
                    {mesi.map((m) => {
                      const l = localeDi(sito, m);
                      const b = meseDiSito(esito, sito, m)?.advConsentito ?? 0;
                      if (l === null) return <td className="num cella-muta" key={m}>—</td>;
                      const d = l - b;
                      return (
                        <td
                          className="num"
                          key={m}
                          style={{ color: Math.abs(d) < 1 ? "var(--text-secondary)" : d > 0 ? "var(--red)" : "var(--green)" }}
                        >
                          {Math.abs(d) < 1 ? "in linea" : `${d > 0 ? "+" : ""}${formattaEuro(d)}`}
                        </td>
                      );
                    })}
                    <td className="num cella-muta" />
                  </tr>
                </tbody>
              </table>
            </div>
            {mancanti > 0 && (
              <p className="page-sub" style={{ padding: "0 24px 18px", margin: 0 }}>
                <strong>{mancanti} mesi su 12</strong> non hanno una riga importata in questa pagina: per quelli
                l&apos;unico tetto di spesa che esiste è quello di Budgets, qui sopra. Un mese senza riga{" "}
                <strong>non è un mese a budget zero</strong>: è un mese che nessuno ha ancora caricato.
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
