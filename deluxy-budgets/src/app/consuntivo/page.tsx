import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno, contoEconomico } from "@/lib/calc";
import { fetchConsuntivo, fetchSpeseBanca } from "@/lib/finance";
import { caricaCategorie, ricostruisci } from "@/lib/cfo";
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

  const [res, spese, categorie, dati] = await Promise.all([
    fetchConsuntivo({ anno: ANNO_CORRENTE, dal: periodo.dal, al: periodo.al, stato }),
    fetchSpeseBanca({ anno: ANNO_CORRENTE, dal: periodo.dal, al: periodo.al }),
    caricaCategorie(),
    caricaAnno(ANNO_CORRENTE),
  ]);

  // Budget del periodo (dal budget pubblicato, livello raggiungibile) rapportato
  // ai mesi scelti.
  const pl = contoEconomico(dati, "RAGGIUNGIBILE");
  const quotaPeriodo = (periodo.al - periodo.dal + 1) / 12;

  // ---- Ricavi reali per voce di budget (da Finance, via mappatura Margini) ----
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
    return {
      nome: t.nome,
      slug: t.slug,
      budgetPeriodo: (pl.ricaviPerServizio[t.slug] ?? 0) * quotaPeriodo,
      consuntivo,
      fatture,
      collegati,
      mappata: collegati.length > 0,
    };
  });
  const nonMappate = res.ok
    ? res.dati.tipologie.filter((t) => !consumati.has(t.tipologia.trim().toLowerCase()))
    : [];
  const ricaviCons = confronto.reduce((s, c) => s + c.consuntivo, 0);

  // ---- Costi reali per voce di P&L (dalla banca, categorizzati nel CFO) ----
  const costi = { COGS: 0, ADV: 0, PERSONALE: 0, STRUTTURA: 0 };
  let nonCategorizzato = 0;
  let esclusi = 0;
  if (spese.ok) {
    for (const r of ricostruisci(spese.dati.controparti, categorie)) {
      const tp = r.categoria?.tipoPL;
      if (!tp) nonCategorizzato += r.uscite;
      else if (tp === "ESCLUSA") esclusi += r.uscite;
      else if (tp in costi) costi[tp as keyof typeof costi] += r.uscite;
    }
  }

  // ---- Conto economico consuntivo ----
  const margineLordoCons = ricaviCons - costi.COGS;
  const ebitdaCons = margineLordoCons - costi.ADV - costi.PERSONALE - costi.STRUTTURA;

  type RigaPL = { label: string; nota?: string; cons: number; budget: number; tipo: "ricavo" | "costo" | "totale" };
  const righePL: RigaPL[] = [
    { label: "Totale ricavi", cons: ricaviCons, budget: pl.ricavi * quotaPeriodo, tipo: "totale" },
    { label: "Costo del venduto", nota: "banca · Fornitori/COGS", cons: costi.COGS, budget: pl.cogs * quotaPeriodo, tipo: "costo" },
    { label: "Margine lordo", cons: margineLordoCons, budget: pl.margineLordo * quotaPeriodo, tipo: "totale" },
    { label: "Spesa pubblicitaria (ADV)", nota: "banca · Marketing", cons: costi.ADV, budget: pl.adv * quotaPeriodo, tipo: "costo" },
    { label: "Costo del personale", nota: "banca · Personale", cons: costi.PERSONALE, budget: pl.personale * quotaPeriodo, tipo: "costo" },
    { label: "Costi di struttura", nota: "banca · Struttura", cons: costi.STRUTTURA, budget: pl.costiFissi * quotaPeriodo, tipo: "costo" },
    { label: "EBITDA", cons: ebitdaCons, budget: pl.ebitda * quotaPeriodo, tipo: "totale" },
  ];

  // Scostamento "buono": più ricavi/margine o meno costi. Colora di conseguenza.
  const buono = (r: RigaPL) => {
    const d = r.cons - r.budget;
    return r.tipo === "costo" ? d <= 0 : d >= 0;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Consuntivo</h1>
          <p className="page-caption">
            Il conto economico reale, con le stesse voci del P&amp;L a budget: ricavi da Finance, costi dalla
            categorizzazione bancaria del CFO. A fianco il budget del periodo e lo scostamento.
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
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Ricavi reali — {res.dati.periodo.etichetta}</div>
              <div className="kpi-value">{eur(ricaviCons)}</div>
              <div className="kpi-sub">imponibile · {res.dati.totali.fatture} fatture</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">EBITDA consuntivo</div>
              <div className={`kpi-value ${ebitdaCons >= 0 ? "pos" : "neg"}`}>{eur(ebitdaCons)}</div>
              <div className="kpi-sub">{ricaviCons > 0 ? pct((ebitdaCons / ricaviCons) * 100) : "—"} sui ricavi</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Costi categorizzati (banca)</div>
              <div className="kpi-value">{eur(costi.COGS + costi.ADV + costi.PERSONALE + costi.STRUTTURA)}</div>
              <div className="kpi-sub">
                {spese.ok
                  ? `${eur(nonCategorizzato)} ancora da categorizzare`
                  : "spese banca non disponibili"}
              </div>
            </div>
          </div>

          <h2 className="section-title">Conto economico — consuntivo vs budget</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    <th className="num">Consuntivo</th>
                    <th className="num">Budget periodo</th>
                    <th className="num">Scostamento</th>
                    <th className="num">Realizzato</th>
                  </tr>
                </thead>
                <tbody>
                  {righePL.map((r) => {
                    const forte = r.tipo === "totale";
                    const scost = r.cons - r.budget;
                    return (
                      <tr key={r.label} className={r.label === "EBITDA" ? "tot" : undefined}>
                        <td style={{ fontWeight: forte ? 600 : 400 }}>
                          {r.label}
                          {r.nota && <div className="muted" style={{ fontSize: 11.5 }}>{r.nota}</div>}
                        </td>
                        <td className="num" style={{ fontWeight: forte ? 600 : 400 }}>
                          {r.tipo === "costo" ? `− ${eur(r.cons)}` : eur(r.cons)}
                        </td>
                        <td className="num muted">
                          {r.tipo === "costo" ? `− ${eur(r.budget)}` : eur(r.budget)}
                        </td>
                        <td className={`num ${buono(r) ? "pos" : "neg"}`}>
                          {scost >= 0 ? "+" : ""}{eur(scost)}
                        </td>
                        <td className="num muted">
                          {r.budget > 0 ? pct((r.cons / r.budget) * 100, 0) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="page-caption" style={{ marginTop: 14 }}>
            I <strong>ricavi</strong> sono l&apos;imponibile fatturato in Finance mappato alle voci di budget in{" "}
            <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>. I <strong>costi</strong> sono
            le uscite di banca categorizzate nel <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>{" "}
            per voce di P&amp;L: {spese.ok ? `restano ${eur(nonCategorizzato)} da categorizzare` : "spese banca non disponibili"}
            {esclusi > 0 && `, ${eur(esclusi)} esclusi (oneri finanziari)`}, quindi finché la categorizzazione non è
            completa i costi reali sono sottostimati e l&apos;EBITDA è ottimistico. Nota: i ricavi sono al netto IVA
            (competenza), le uscite di banca sono di cassa (IVA inclusa): è un consuntivo gestionale, non un bilancio.
          </p>

          <h2 className="section-title">Ricavi reali per voce di budget</h2>
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
                      <td className={`num ${!c.mappata ? "" : c.consuntivo - c.budgetPeriodo >= 0 ? "pos" : "neg"}`}>
                        {c.mappata ? `${c.consuntivo - c.budgetPeriodo >= 0 ? "+" : ""}${eur(c.consuntivo - c.budgetPeriodo)}` : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td>Totale ricavi</td>
                    <td />
                    <td className="num">{eur(pl.ricavi * quotaPeriodo)}</td>
                    <td className="num">{eur(ricaviCons)}</td>
                    <td className={`num ${ricaviCons - pl.ricavi * quotaPeriodo >= 0 ? "pos" : "neg"}`}>
                      {ricaviCons - pl.ricavi * quotaPeriodo >= 0 ? "+" : ""}{eur(ricaviCons - pl.ricavi * quotaPeriodo)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {nonMappate.length > 0 && (
            <p className="page-caption" style={{ marginTop: 12 }}>
              {nonMappate.length} tipologie fatturate in Finance non sono collegate a una voce di budget
              (per {eur(nonMappate.reduce((s, t) => s + t.imponibile, 0))}). Associale in{" "}
              <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>, campo &quot;Voci in Finance&quot;,
              perché entrino nei ricavi consuntivi.
            </p>
          )}
        </>
      )}
    </>
  );
}
