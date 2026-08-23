import { prisma } from "@/lib/db";
import { budgetDaBudgets, meseDiSito } from "@/lib/budgets";
import { ETICHETTA_CANALE, formattaEuro, MESI_IT } from "@/lib/dominio";

// **Quanto abbiamo acceso adesso, contro quanto possiamo spendere questo mese.**
//
// ⚠️ PERCHÉ LE DUE CIFRE VANNO NELLA STESSA SCHERMATA. Il tetto lo decide
// Budgets (vendite del mese × la percentuale decisa in /spese) e vive là; i
// budget giornalieri delle campagne vivono su Google e su Meta. Finché stanno
// in due app diverse nessuno le confronta mai, e la domanda che conta —
// «quello che ho acceso sta dentro quello che posso spendere?» — non se la fa
// nessuno finché non arriva la fattura.
//
// ⚠️ IL BUDGET GIORNALIERO NON È LA SPESA. È un tetto: Google può spendere fino
// al doppio in un giorno e compensare nel resto del mese, e una campagna con
// poco traffico spende meno del suo budget. «Budget × giorni» è quindi il
// MASSIMO teorico, non una previsione — e va detto, o si legge come una
// certezza.
//
// ⚠️ SU META IL BUDGET PUÒ STARE SUGLI AD SET. Le campagne senza budget di
// campagna arrivano qui con `null`: sommarle come zero direbbe che quel brand
// spende meno di quanto spende. Si contano a parte e si dichiarano.

const GIORNI_MESE = 30.4;

export async function BudgetCampagneBrand({ brand }: { brand: string }) {
  const oggi = new Date();
  const anno = oggi.getFullYear();
  const mese = oggi.getMonth() + 1;

  const [campagne, budgets] = await Promise.all([
    prisma.campagna.findMany({
      where: { brand, stato: { notIn: ["defunta", "conclusa"] } },
      select: {
        id: true,
        nome: true,
        canale: true,
        statoPiattaforma: true,
        stato: true,
        budgetGiornaliero: true,
      },
      orderBy: [{ canale: "asc" }, { budgetGiornaliero: "desc" }],
    }),
    budgetDaBudgets(anno),
  ]);

  // ⚠️ Accesa = accesa SU GOOGLE/META, non nell'app: è quella che spende. Una
  // campagna che l'app crede attiva ma sulla piattaforma è ferma non brucia un
  // euro, e contarla gonfierebbe il totale.
  const accese = campagne.filter((c) => c.statoPiattaforma === "ENABLED");
  const conBudget = accese.filter((c) => c.budgetGiornaliero != null);
  const senzaBudget = accese.filter((c) => c.budgetGiornaliero == null);

  const perCanale = new Map<string, { giorno: number; quante: number; ignote: number }>();
  for (const c of accese) {
    const k = c.canale ?? "";
    const v = perCanale.get(k) ?? { giorno: 0, quante: 0, ignote: 0 };
    if (c.budgetGiornaliero != null) {
      v.giorno += c.budgetGiornaliero;
      v.quante++;
    } else {
      v.ignote++;
    }
    perCanale.set(k, v);
  }

  const alGiorno = conBudget.reduce((s, c) => s + (c.budgetGiornaliero ?? 0), 0);
  const alMese = alGiorno * GIORNI_MESE;

  const delMese = budgets.ok ? meseDiSito(budgets, brand, mese) : null;
  // ⚠️ `advConsentito`, che in Budgets nasce dal budget vendite APPROVATO —
  // non `advPubblicato`, che è il riferimento del vecchio monitoraggio («ADV
  // HP mensile»). Sono due cose diverse con due nomi che si somigliano, e
  // sceglierne uno dal nome invece che dalla definizione è un errore che ho
  // già fatto una volta su questa stessa cifra.
  const tetto = delMese?.advConsentito ?? null;
  const differenza = tetto != null ? tetto - alMese : null;

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Budget delle campagne · {MESI_IT[mese - 1]} {anno}
      </div>

      <div className="kpi-riga" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="kpi-valore">{formattaEuro(alGiorno)}</div>
          <div className="kpi-etichetta">
            Acceso adesso, al giorno · {conBudget.length} campagne in asta
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{formattaEuro(alMese)}</div>
          <div className="kpi-etichetta">Al mese, se spendessero tutto il tetto ogni giorno</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{tetto != null ? formattaEuro(tetto) : "—"}</div>
          <div className="kpi-etichetta">
            {tetto == null ? "Budgets non risponde" : "Da Budgets, sul budget vendite approvato"}
          </div>
        </div>
        {differenza != null && (
          <div className="kpi">
            <div
              className="kpi-valore"
              style={{ color: differenza < 0 ? "var(--orange)" : "var(--green)" }}
            >
              {differenza >= 0 ? "+" : ""}
              {formattaEuro(differenza)}
            </div>
            <div className="kpi-etichetta">
              {differenza >= 0 ? "Spazio che resta, al massimo teorico" : "Oltre il consentito, al massimo teorico"}
            </div>
          </div>
        )}
      </div>

      {/* ⚠️ La frase che impedisce di leggere questi numeri come una certezza. */}
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        Il budget giornaliero è un <b>tetto, non una spesa</b>: Google può spendere fino al doppio in
        un giorno e compensare nel mese, e una campagna con poco traffico spende meno di quello che
        le hai dato. Il numero «al mese» è quindi il <b>massimo teorico</b> — la spesa vera sta nelle
        schede delle campagne. Il tetto arriva da <b>Deluxy Budgets</b>, calcolato là sul budget
        vendite <b>approvato</b> — quello in cui le proposte consolidate hanno sostituito
        l&apos;iniziale.
      </p>

      {!budgets.ok && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>◈</span>
          <span>
            <b>Il tetto non si è potuto leggere</b>: {budgets.errore} Quello che vedi è solo quanto
            hai acceso, senza niente con cui confrontarlo.
          </span>
        </div>
      )}

      {senzaBudget.length > 0 && (
        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            <b>{senzaBudget.length} campagne accese non hanno un budget noto</b> e non sono nel
            totale. Su Meta il budget può stare sugli <b>ad set</b> invece che sulla campagna, e
            quelli l&apos;app non li importa: contarle come zero direbbe che questo brand spende meno
            di quanto spende.{" "}
            {senzaBudget.slice(0, 4).map((c) => c.nome).join(" · ")}
            {senzaBudget.length > 4 && ` … e altre ${senzaBudget.length - 4}`}
          </span>
        </div>
      )}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Piattaforma</th>
              <th className="num">In asta</th>
              <th className="num">Al giorno</th>
              <th className="num">Al mese (massimo)</th>
              <th className="num">Quota</th>
            </tr>
          </thead>
          <tbody>
            {[...perCanale.entries()]
              .sort((a, b) => b[1].giorno - a[1].giorno)
              .map(([canale, v]) => (
                <tr key={canale || "altro"}>
                  <td className="cella-nome">{ETICHETTA_CANALE[canale] ?? canale ?? "Altro"}</td>
                  <td className="num">
                    {v.quante}
                    {v.ignote > 0 && (
                      <div className="cella-sub" style={{ color: "var(--orange)" }}>
                        +{v.ignote} senza budget noto
                      </div>
                    )}
                  </td>
                  <td className="num">{formattaEuro(v.giorno)}</td>
                  <td className="num">{formattaEuro(v.giorno * GIORNI_MESE)}</td>
                  <td className="num">
                    {alGiorno > 0 ? `${Math.round((v.giorno / alGiorno) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {accese.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="cella-sub" style={{ cursor: "pointer" }}>
            Le {accese.length} campagne in asta, una per una
          </summary>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Campagna</th>
                  <th>Piattaforma</th>
                  <th className="num">€/giorno</th>
                </tr>
              </thead>
              <tbody>
                {accese
                  .slice()
                  .sort((a, b) => (b.budgetGiornaliero ?? -1) - (a.budgetGiornaliero ?? -1))
                  .map((c) => (
                    <tr key={c.id}>
                      <td className="cella-nome" style={{ maxWidth: 340 }}>
                        <a href={`/campagne/${c.id}`}>{c.nome}</a>
                      </td>
                      <td className="cella-muta">{ETICHETTA_CANALE[c.canale ?? ""] ?? c.canale}</td>
                      <td className="num">
                        {c.budgetGiornaliero != null ? (
                          formattaEuro(c.budgetGiornaliero)
                        ) : (
                          <span style={{ color: "var(--orange)" }}>non noto</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
