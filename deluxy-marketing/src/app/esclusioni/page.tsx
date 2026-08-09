import { Sidebar } from "@/components/Sidebar";
import { applicaRegoleEsclusione, salvaRegoleEsclusione } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaEuro, formattaNumero } from "@/lib/dominio";
import {
  CHIAVE_CONCORRENTI,
  CHIAVE_REGOLE,
  REGOLE,
  concorrentiDa,
  regoleAttiveDa,
  valutaRicerca,
} from "@/lib/esclusioni";
import { linguaDaNome } from "@/lib/vendite-campagna";

export const dynamic = "force-dynamic";

// Liste esclusioni: le regole con cui una parola cercata diventa una negativa.
//
// ⚠️ La pagina mostra l'ANTEPRIMA sui dati veri prima di far premere qualsiasi
// cosa: quante ricerche colpirebbe ogni regola adesso, con la spesa che
// spegnerebbe e gli esempi. Una regola che si accende alla cieca è un
// interruttore su un impianto che non si vede.
export default async function Esclusioni({
  searchParams,
}: {
  searchParams: Promise<{ salvato?: string; bloccata?: string }>;
}) {
  const sp = await searchParams;

  const [impRegole, impConcorrenti, termini, campagne] = await Promise.all([
    prisma.impostazione.findUnique({ where: { chiave: CHIAVE_REGOLE } }),
    prisma.impostazione.findUnique({ where: { chiave: CHIAVE_CONCORRENTI } }),
    prisma.termineRicerca.findMany({
      select: { testo: true, campagnaId: true, spesa: true, clic: true, conversioni: true, ricavi: true },
    }),
    prisma.campagna.findMany({
      where: { stato: { notIn: ["defunta", "conclusa"] } },
      select: { id: true, nome: true },
    }),
  ]);

  const attive = regoleAttiveDa(impRegole?.valore);
  const concorrenti = concorrentiDa(impConcorrenti?.valore);
  const perId = new Map(campagne.map((c) => [c.id, c]));

  // L'anteprima si calcola su TUTTE le regole, accese o spente: serve proprio a
  // decidere se accenderne una.
  type Colpita = { testo: string; campagna: string; spesa: number; conversioni: number; ricavi: number; motivo: string };
  const perRegola: Record<string, Colpita[]> = {};
  for (const r of REGOLE) perRegola[r.id] = [];

  for (const t of termini) {
    const c = perId.get(t.campagnaId);
    if (!c) continue;
    const lingua = linguaDaNome(c.nome);
    for (const r of REGOLE) {
      const v = valutaRicerca(t.testo, {
        linguaCampagna: lingua,
        attive: [r.id],
        concorrenti,
      });
      if (v) {
        perRegola[r.id].push({
          testo: t.testo,
          campagna: c.nome,
          spesa: t.spesa ?? 0,
          conversioni: t.conversioni ?? 0,
          ricavi: t.ricavi ?? 0,
          motivo: v.motivo,
        });
        break; // la prima regola che colpisce vince, come in `valutaRicerca`
      }
    }
  }

  const somma = (a: Colpita[], k: "spesa" | "conversioni" | "ricavi") =>
    a.reduce((s, x) => s + (x[k] ?? 0), 0);

  return (
    <div className="layout">
      <Sidebar attiva="esclusioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Liste esclusioni</h1>
            <p className="page-sub">
              Le regole con cui una parola cercata diventa una negativa. Qui si accendono, si
              spengono e si vede <b>prima</b> quanto costerebbero.
            </p>
          </div>
        </div>

        {sp.salvato && <div className="nota-ok">Regole salvate.</div>}
        {sp.bloccata && <div className="nota-avviso">{sp.bloccata}</div>}

        {/* ⚠️ La cosa più importante della pagina, e va detta prima di tutto il
            resto: nessuna regola esclude da sola. */}
        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            <b>Nessuna regola esclude da sola.</b> Ogni ricerca colpita diventa una proposta in{" "}
            <a href="/operazioni">coda</a>, marcata come venuta dalle regole e non da una persona:
            si esclude solo dopo che qualcuno l&apos;ha approvata. Le negative nascono{" "}
            <b>esatte</b> — spengono quella ricerca, non tutte quelle che le somigliano.
          </span>
        </div>

        <form action={salvaRegoleEsclusione}>
          {REGOLE.map((r) => {
            const colpite = perRegola[r.id];
            const spesa = somma(colpite, "spesa");
            const conv = somma(colpite, "conversioni");
            const ricavi = somma(colpite, "ricavi");
            const accesa = attive.includes(r.id);
            return (
              <section className="scheda" key={r.id}>
                <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" name="regola" value={r.id} defaultChecked={accesa} />
                    {r.nome}
                  </label>
                  <span className="tag-neutro">
                    {r.come === "fatto" ? "si decide da sé" : "serve un giudizio"}
                  </span>
                  {!accesa && <span className="tag-neutro">SPENTA</span>}
                </div>

                <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 8 }}>
                  {r.cosaFa}
                </p>
                <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
                  {r.perche}
                </p>

                <div className="kpi-riga" style={{ marginBottom: colpite.length > 0 ? 12 : 0 }}>
                  <div className="kpi">
                    <div className="kpi-valore">{formattaNumero(colpite.length)}</div>
                    <div className="kpi-etichetta">Ricerche che colpirebbe adesso</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-valore">{spesa > 0 ? formattaEuro(spesa) : "—"}</div>
                    <div className="kpi-etichetta">Spesa che spegnerebbe (storico in archivio)</div>
                  </div>
                  <div className="kpi">
                    {/* ⚠️ Il numero che fa cambiare idea: se le ricerche colpite
                        hanno incassato, la regola sta tagliando soldi veri. */}
                    <div
                      className="kpi-valore"
                      style={ricavi > 0 ? { color: "var(--red)" } : undefined}
                    >
                      {ricavi > 0 ? formattaEuro(ricavi) : "0 €"}
                    </div>
                    <div className="kpi-etichetta">
                      Incasso che hanno prodotto {ricavi > 0 && <b>— guarda bene prima di accendere</b>}
                      {conv > 0 && ` · ${formattaNumero(conv)} conversioni`}
                    </div>
                  </div>
                </div>

                {colpite.length > 0 && (
                  <details>
                    <summary className="cella-sub">
                      Vedi le {colpite.length} ricerche che colpirebbe
                    </summary>
                    <div style={{ overflowX: "auto", marginTop: 10 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Ricerca</th>
                            <th>Campagna</th>
                            <th className="num">Spesa</th>
                            <th className="num">Conv.</th>
                            <th className="num">Incasso</th>
                            <th>Perché</th>
                          </tr>
                        </thead>
                        <tbody>
                          {colpite
                            .sort((a, b) => b.spesa - a.spesa)
                            .slice(0, 60)
                            .map((x, i) => (
                              <tr key={`${x.campagna}-${x.testo}-${i}`}>
                                <td className="cella-nome">{x.testo}</td>
                                <td>{x.campagna}</td>
                                <td className="num">{x.spesa > 0 ? formattaEuro(x.spesa) : "—"}</td>
                                <td className="num">{x.conversioni > 0 ? formattaNumero(x.conversioni) : "—"}</td>
                                <td className="num">{x.ricavi > 0 ? formattaEuro(x.ricavi) : "—"}</td>
                                <td className="cella-sub" style={{ whiteSpace: "normal" }}>{x.motivo}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {colpite.length > 60 && (
                        <p className="cella-sub" style={{ marginTop: 8 }}>
                          Mostrate le 60 più care su {colpite.length}.
                        </p>
                      )}
                    </div>
                  </details>
                )}

                {r.id === "concorrenti" && (
                  <div className="campo-modulo" style={{ marginTop: 14 }}>
                    <label>
                      I concorrenti, uno per riga (o separati da virgola)
                      <textarea
                        name="concorrenti"
                        rows={4}
                        defaultValue={concorrenti.join("\n")}
                        placeholder={"flora queen\ninterflora\nfloraqueen"}
                      />
                    </label>
                    <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                      Il confronto è su <b>parole intere</b> e serve almeno tre lettere: «rose» non
                      diventa un concorrente per sbaglio. Senza nomi nell&apos;elenco questa regola
                      non colpisce niente, anche se accesa.
                    </span>
                  </div>
                )}
              </section>
            );
          })}

          <div className="azioni-modulo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn small" type="submit">Salva le regole</button>
            <span className="cella-sub">
              Salvare non mette in coda niente: accende e spegne, e basta.
            </span>
          </div>
        </form>

        <section className="scheda">
          <div className="scheda-titolo">Applica adesso le regole accese</div>
          <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
            Passa in rassegna tutte le parole cercate in archivio e mette in coda una negativa
            <b> esatta</b> per ognuna colpita da una regola accesa. Le ricerche che hanno già una
            negativa in coda o eseguita <b>si saltano</b>: non si accodano doppioni.
          </p>
          <form action={applicaRegoleEsclusione}>
            <button className="btn small" type="submit" disabled={attive.length === 0}>
              Metti in coda le esclusioni
              {attive.length === 0 && " (nessuna regola accesa)"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
