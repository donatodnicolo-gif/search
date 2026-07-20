import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno, contoEconomico } from "@/lib/calc";
import { fetchConsuntivo } from "@/lib/finance";
import { eur, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

const PERIODI = [
  { key: "anno", label: "Anno", dal: 1, al: 12 },
  { key: "s1", label: "1° semestre", dal: 1, al: 6 },
  { key: "s2", label: "2° semestre", dal: 7, al: 12 },
];
const STATI = [
  { key: "tutte", label: "Tutte" },
  { key: "pagate", label: "Solo saldate" },
  { key: "aperte", label: "Solo aperte" },
] as const;

export default async function ConsuntivoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; stato?: string }>;
}) {
  const sp = await searchParams;
  const periodo = PERIODI.find((p) => p.key === sp.periodo) ?? PERIODI[0];
  const stato = (STATI.find((s) => s.key === sp.stato)?.key ?? "tutte") as "tutte" | "pagate" | "aperte";

  const [res, dati] = await Promise.all([
    fetchConsuntivo({ anno: ANNO_CORRENTE, dal: periodo.dal, al: periodo.al, stato }),
    caricaAnno(ANNO_CORRENTE),
  ]);

  // Budget dei ricavi per tipologia (dal budget pubblicato, livello raggiungibile),
  // per confrontarlo col consuntivo dove il nome della tipologia combacia.
  const pl = contoEconomico(dati, "RAGGIUNGIBILE");
  const budgetPerNome = new Map<string, number>();
  for (const t of dati.tipologie) {
    budgetPerNome.set(t.nome.trim().toLowerCase(), pl.ricaviPerServizio[t.slug] ?? 0);
  }
  // Il budget dell'anno intero va rapportato al periodo scelto (quota mesi).
  const quotaPeriodo = (periodo.al - periodo.dal + 1) / 12;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Consuntivo</h1>
          <p className="page-caption">
            Importi realmente fatturati per tipologia di servizio, richiamati dall&apos;app Finance.
            Dove il nome combacia con una tipologia del budget, il confronto è immediato.
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {PERIODI.map((p) => (
              <Link key={p.key} href={`/consuntivo?periodo=${p.key}&stato=${stato}`} className={p.key === periodo.key ? "on" : ""}>
                {p.label}
              </Link>
            ))}
          </div>
          <div className="seg">
            {STATI.map((s) => (
              <Link key={s.key} href={`/consuntivo?periodo=${periodo.key}&stato=${s.key}`} className={s.key === stato ? "on" : ""}>
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {!res.ok ? (
        <div className="card empty">
          <div className="empty-icon">↯</div>
          <div className="empty-title">{res.configurato ? "Finance non disponibile" : "Collega l'app Finance"}</div>
          <div className="empty-text">{res.errore}</div>
          {!res.configurato && (
            <div className="empty-text" style={{ marginTop: 10 }}>
              La chiave è la stessa di <code>/api/verifiche</code> di Finance. Va messa in <code>.env</code> come{" "}
              <code>FINANCE_API_KEY</code> (in produzione, tra le variabili d&apos;ambiente del progetto), mai committata.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Imponibile fatturato — {res.dati.periodo.etichetta}</div>
              <div className="kpi-value">{eur(res.dati.totali.imponibile)}</div>
              <div className="kpi-sub">
                {res.dati.stato} · {res.dati.totali.fatture} fatture
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Totale IVA inclusa</div>
              <div className="kpi-value">{eur(res.dati.totali.totale)}</div>
              <div className="kpi-sub">IVA {eur(res.dati.totali.iva)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Tipologie fatturate</div>
              <div className="kpi-value">{res.dati.tipologie.length}</div>
              <div className="kpi-sub">ordinate per imponibile</div>
            </div>
          </div>

          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipologia (Finance)</th>
                    <th className="num">Imponibile</th>
                    <th className="num">IVA</th>
                    <th className="num">Totale</th>
                    <th className="num">Fatture</th>
                    <th className="num">Quota</th>
                    <th className="num">Budget periodo</th>
                    <th className="num">Scostamento</th>
                  </tr>
                </thead>
                <tbody>
                  {res.dati.tipologie.map((t) => {
                    const budgetAnno = budgetPerNome.get(t.tipologia.trim().toLowerCase());
                    const budgetPeriodo = budgetAnno != null ? budgetAnno * quotaPeriodo : null;
                    const scost = budgetPeriodo != null ? t.imponibile - budgetPeriodo : null;
                    return (
                      <tr key={t.tipologia}>
                        <td style={{ fontWeight: 500 }}>{t.tipologia}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{eur(t.imponibile)}</td>
                        <td className="num muted">{eur(t.iva)}</td>
                        <td className="num">{eur(t.totale)}</td>
                        <td className="num muted">{t.fatture}</td>
                        <td className="num muted">{pct(t.quota)}</td>
                        <td className="num muted">{budgetPeriodo != null ? eur(budgetPeriodo) : "—"}</td>
                        <td className={`num ${scost == null ? "" : scost >= 0 ? "pos" : "neg"}`}>
                          {scost == null ? <span className="muted">—</span> : `${scost >= 0 ? "+" : ""}${eur(scost)}`}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td>Totale</td>
                    <td className="num">{eur(res.dati.totali.imponibile)}</td>
                    <td className="num">{eur(res.dati.totali.iva)}</td>
                    <td className="num">{eur(res.dati.totali.totale)}</td>
                    <td className="num">{res.dati.totali.fatture}</td>
                    <td className="num">100%</td>
                    <td className="num" />
                    <td className="num" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p className="page-caption" style={{ marginTop: 18 }}>
            Il <strong>budget periodo</strong> è il budget annuale della tipologia omonima rapportato ai mesi
            del periodo scelto ({pct(quotaPeriodo * 100, 0)} dell&apos;anno). Il confronto compare solo dove il
            nome della tipologia in Finance coincide con una tipologia definita in{" "}
            <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>; le altre righe sono comunque
            fatturato reale. Dati aggiornati a ogni apertura della pagina.
          </p>
        </>
      )}
    </>
  );
}
