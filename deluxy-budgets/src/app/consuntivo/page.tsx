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

  // Budget dei ricavi per tipologia (dal budget pubblicato, livello raggiungibile).
  const pl = contoEconomico(dati, "RAGGIUNGIBILE");
  // Il budget dell'anno intero va rapportato al periodo scelto (quota mesi).
  const quotaPeriodo = (periodo.al - periodo.dal + 1) / 12;

  // Fatturato reale per nome di tipologia Finance (chiave normalizzata).
  const fatturatoPerNome = new Map<string, { nome: string; imponibile: number; fatture: number }>();
  if (res.ok) {
    for (const t of res.dati.tipologie) {
      fatturatoPerNome.set(t.tipologia.trim().toLowerCase(), {
        nome: t.tipologia,
        imponibile: t.imponibile,
        fatture: t.fatture,
      });
    }
  }

  // Ogni voce di budget raccoglie il fatturato delle sue voci Finance mappate
  // (o, se nessuna è indicata, della voce con lo stesso nome). Tengo traccia
  // dei nomi Finance consumati, così mostro a parte quelli non mappati.
  const consumati = new Set<string>();
  const confronto = dati.tipologie.map((t) => {
    const nomiFinance = t.vociFinance.length ? t.vociFinance : [t.nome];
    let consuntivo = 0;
    let fatture = 0;
    const collegati: string[] = [];
    for (const nome of nomiFinance) {
      const k = nome.trim().toLowerCase();
      const f = fatturatoPerNome.get(k);
      if (f) {
        consuntivo += f.imponibile;
        fatture += f.fatture;
        collegati.push(f.nome);
        consumati.add(k);
      }
    }
    const budgetPeriodo = (pl.ricaviPerServizio[t.slug] ?? 0) * quotaPeriodo;
    return {
      nome: t.nome,
      slug: t.slug,
      budgetPeriodo,
      consuntivo,
      fatture,
      collegati,
      mappata: collegati.length > 0,
      scostamento: consuntivo - budgetPeriodo,
    };
  });

  // Voci fatturate in Finance non associate ad alcuna voce di budget.
  const nonMappate = res.ok
    ? res.dati.tipologie.filter((t) => !consumati.has(t.tipologia.trim().toLowerCase()))
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Consuntivo</h1>
          <p className="page-caption">
            Importi realmente fatturati richiamati dall&apos;app Finance, raggruppati per voce di budget
            secondo la mappatura impostata in Margini e confrontati col budget del periodo.
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

          <h2 className="section-title">Budget vs consuntivo, per voce di budget</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce di budget</th>
                    <th>Da Finance</th>
                    <th className="num">Budget periodo</th>
                    <th className="num">Consuntivo</th>
                    <th className="num">Scostamento</th>
                    <th className="num">Realizzato</th>
                  </tr>
                </thead>
                <tbody>
                  {confronto.map((c) => (
                    <tr key={c.slug}>
                      <td style={{ fontWeight: 600 }}>{c.nome}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {c.collegati.length ? c.collegati.join(" + ") : <span className="muted">nessuna voce collegata</span>}
                      </td>
                      <td className="num">{eur(c.budgetPeriodo)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {c.mappata ? eur(c.consuntivo) : <span className="muted">—</span>}
                      </td>
                      <td className={`num ${!c.mappata ? "" : c.scostamento >= 0 ? "pos" : "neg"}`}>
                        {c.mappata ? `${c.scostamento >= 0 ? "+" : ""}${eur(c.scostamento)}` : <span className="muted">—</span>}
                      </td>
                      <td className="num muted">
                        {c.mappata && c.budgetPeriodo > 0 ? pct((c.consuntivo / c.budgetPeriodo) * 100, 0) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {nonMappate.length > 0 && (
            <>
              <h2 className="section-title">Fatturato non associato a una voce di budget</h2>
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
                      </tr>
                    </thead>
                    <tbody>
                      {nonMappate.map((t) => (
                        <tr key={t.tipologia}>
                          <td style={{ fontWeight: 500 }}>{t.tipologia}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{eur(t.imponibile)}</td>
                          <td className="num muted">{eur(t.iva)}</td>
                          <td className="num">{eur(t.totale)}</td>
                          <td className="num muted">{t.fatture}</td>
                          <td className="num muted">{pct(t.quota)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="page-caption" style={{ marginTop: 12 }}>
                Queste tipologie sono fatturate in Finance ma non collegate ad alcuna voce di budget.
                Associale in <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>, campo
                &quot;Voci in Finance&quot;, perché entrino nel confronto.
              </p>
            </>
          )}

          <p className="page-caption" style={{ marginTop: 18 }}>
            Il <strong>budget periodo</strong> è il budget annuale della voce rapportato ai mesi del periodo
            scelto ({pct(quotaPeriodo * 100, 0)} dell&apos;anno). Il <strong>consuntivo</strong> somma il
            fatturato reale delle tipologie di Finance associate alla voce in{" "}
            <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>. Dati aggiornati a ogni
            apertura della pagina.
          </p>
        </>
      )}
    </>
  );
}
