import { giudicaTermine } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaEuro, formattaNumero } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";

// Quello che la gente ha digitato per davvero. È il posto dove si vede la
// differenza fra quello che abbiamo comprato e quello che stiamo pagando: una
// corrispondenza generica porta ricerche che nessuno avrebbe scelto.
const COLORE_STATO: Record<string, string> = {
  nuovo: "var(--text-tertiary)",
  pertinente: "var(--green)",
  da_escludere: "var(--orange)",
  escluso: "var(--red)",
};

export async function TerminiRicerca({ campagnaId, brand }: { campagnaId: string; brand: string }) {
  const termini = await prisma.termineRicerca.findMany({
    where: { campagnaId },
    orderBy: { spesa: "desc" },
    take: 40,
  });

  if (termini.length === 0) {
    return (
      <section className="scheda">
        <div className="scheda-titolo">Cosa ha cercato la gente</div>
        <div className="vuoto-mini">
          Nessun termine di ricerca: li manda lo script con <b>AZIONE = &quot;diagnosi&quot;</b> (una copia per
          account, ogni settimana). Le Performance Max non li espongono.
        </div>
      </section>
    );
  }

  const be = breakEvenRoas(brand);
  const spesaTotale = termini.reduce((s, t) => s + (t.spesa ?? 0), 0);
  const senzaResa = termini.filter((t) => (t.spesa ?? 0) > 0 && !(t.conversioni ?? 0));
  const spesaSenzaResa = senzaResa.reduce((s, t) => s + (t.spesa ?? 0), 0);
  const periodo = termini[0].dal && termini[0].al
    ? `${termini[0].dal.toLocaleDateString("it-IT")} → ${termini[0].al.toLocaleDateString("it-IT")}`
    : null;

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Cosa ha cercato la gente ({termini.length} termini più costosi
        {periodo ? ` · ${periodo}` : ""})
      </div>

      {spesaSenzaResa > 0 && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>◈</span>
          <span>
            <b>{formattaEuro(spesaSenzaResa)}</b> su {formattaEuro(spesaTotale)} sono andati a{" "}
            {senzaResa.length} ricerche che non hanno portato nessuna conversione. Escluderle è la
            leva più veloce che c&apos;è: passa dalla coda approvata come ogni altra modifica.
          </span>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Ha cercato</th>
              <th>Presa dalla keyword</th>
              <th className="num">Spesa</th>
              <th className="num">Clic</th>
              <th className="num">Conv.</th>
              <th className="num">Incasso</th>
              <th className="num">Resa</th>
              <th>Giudizio</th>
            </tr>
          </thead>
          <tbody>
            {termini.map((t) => {
              const spesa = t.spesa ?? 0;
              const ricavi = t.ricavi ?? 0;
              const resa = spesa > 0 ? ricavi / spesa : null;
              const colore =
                resa == null ? "var(--text-tertiary)" :
                resa >= be * 1.5 ? "var(--green)" :
                resa >= be ? "var(--blue)" : "var(--red)";
              return (
                <tr key={t.id}>
                  <td style={{ maxWidth: 280 }}>
                    <div className="cella-nome">{t.testo}</div>
                    {t.gruppo && <div className="cella-sub">{t.gruppo}</div>}
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 200 }}>
                    {t.keyword ?? "—"}
                    {t.corrispondenza && <div className="cella-sub">{t.corrispondenza.toLowerCase()}</div>}
                  </td>
                  <td className="num">{formattaEuro(spesa)}</td>
                  <td className="num cella-muta">{formattaNumero(t.clic)}</td>
                  <td className="num cella-muta">{formattaNumero(t.conversioni)}</td>
                  <td className="num">{formattaEuro(ricavi)}</td>
                  <td className="num" style={{ color: colore, fontWeight: 600 }}>
                    {resa != null ? `${resa.toFixed(2)}×` : "—"}
                  </td>
                  <td>
                    {t.stato === "nuovo" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <form>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            className="btn small fantasma"
                            type="submit"
                            formAction={giudicaTermine.bind(null, "pertinente")}
                          >
                            Va bene
                          </button>
                          <button
                            className="btn small"
                            type="submit"
                            formAction={giudicaTermine.bind(null, "escludi")}
                            style={{ marginLeft: 6 }}
                          >
                            Escludi
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="tag-salute" style={{ color: COLORE_STATO[t.stato] ?? "var(--text-tertiary)" }}>
                        <span className="dot" />
                        {t.stato.split("_").join(" ")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
        &quot;Escludi&quot; non tocca Google: mette in coda una <b>negativa</b> sulla campagna, da approvare
        in Operazioni. La resa è colorata sul break-even di {brand} ({be.toFixed(2)}×).
      </p>
    </section>
  );
}
