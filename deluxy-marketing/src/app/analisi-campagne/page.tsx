import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTA_BRAND, ETICHETTA_CANALE, formattaEuro } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import { PRESET_PERIODO, risolviPeriodo, variazione, type Periodo } from "@/lib/periodo";

export const dynamic = "force-dynamic";

// Analisi delle campagne per periodo: si sceglie la finestra (preset o date
// libere) e ogni numero viene confrontato con il periodo precedente della
// stessa lunghezza E con lo stesso periodo dell'anno prima — nel gifting la
// stagionalità domina, quindi il confronto anno-su-anno è quello che conta
// (doc 10). Il giudizio usa il break-even ROAS del brand, mai un ROAS assoluto.

type Riga = {
  spesa: number;
  ricavi: number;
  click: number;
  impression: number;
  conversioni: number;
};

const VUOTA: Riga = { spesa: 0, ricavi: 0, click: 0, impression: 0, conversioni: 0 };

async function aggregaPeriodo(p: Periodo, canale?: string, brand?: string) {
  const metriche = await prisma.metricaCampagna.findMany({
    where: {
      data: { gte: p.da, lt: p.a },
      campagna: {
        ...(canale ? { canale } : {}),
        ...(brand ? { brand } : {}),
      },
    },
    include: { campagna: { select: { id: true, nome: true, brand: true, canale: true, classe: true, stato: true } } },
  });

  const totale: Riga = { ...VUOTA };
  const perCampagna = new Map<string, Riga & { nome: string; brand: string; canale: string; classe: string; stato: string }>();
  const perBrand = new Map<string, Riga>();

  for (const m of metriche) {
    const r = {
      spesa: m.spesa ?? 0,
      ricavi: m.ricavi ?? 0,
      click: m.click ?? 0,
      impression: m.impression ?? 0,
      conversioni: m.conversioni ?? 0,
    };
    totale.spesa += r.spesa; totale.ricavi += r.ricavi; totale.click += r.click;
    totale.impression += r.impression; totale.conversioni += r.conversioni;

    const c = perCampagna.get(m.campagna.id) ?? {
      ...VUOTA, nome: m.campagna.nome, brand: m.campagna.brand,
      canale: m.campagna.canale, classe: m.campagna.classe, stato: m.campagna.stato,
    };
    c.spesa += r.spesa; c.ricavi += r.ricavi; c.click += r.click;
    c.impression += r.impression; c.conversioni += r.conversioni;
    perCampagna.set(m.campagna.id, c);

    const b = perBrand.get(m.campagna.brand) ?? { ...VUOTA };
    b.spesa += r.spesa; b.ricavi += r.ricavi; b.click += r.click;
    b.impression += r.impression; b.conversioni += r.conversioni;
    perBrand.set(m.campagna.brand, b);
  }
  return { totale, perCampagna, perBrand };
}

function roas(r: Riga): number | null {
  return r.spesa > 0 ? r.ricavi / r.spesa : null;
}
function cpa(r: Riga): number | null {
  return r.conversioni > 0 ? r.spesa / r.conversioni : null;
}
function ctr(r: Riga): number | null {
  return r.impression > 0 ? (r.click / r.impression) * 100 : null;
}

function Delta({ ora, prima, invertito }: { ora: number; prima: number; invertito?: boolean }) {
  const v = variazione(ora, prima);
  if (v == null) return <i style={{ fontStyle: "normal", color: "var(--text-tertiary)" }}>—</i>;
  const positivo = invertito ? v < 0 : v > 0;
  return (
    <i style={{ fontStyle: "normal", fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: positivo ? "var(--green)" : "var(--red)" }}>
      {v > 0 ? "+" : ""}{v.toFixed(0)}%
    </i>
  );
}

// Giudizio della campagna nel periodo: confronto col break-even del brand
function giudizio(r: Riga, brand: string): { testo: string; colore: string } {
  const ro = roas(r);
  if (r.spesa < 20) return { testo: "Poca spesa", colore: "var(--text-tertiary)" };
  if (ro == null || r.conversioni < 5) {
    return r.conversioni === 0 && r.spesa >= 25
      ? { testo: "Spende senza convertire", colore: "var(--red)" }
      : { testo: "Pochi dati", colore: "var(--text-tertiary)" };
  }
  const be = breakEvenRoas(brand);
  if (ro >= be * 1.5) return { testo: "Molto sopra il break-even", colore: "var(--green)" };
  if (ro >= be) return { testo: "Sopra il break-even", colore: "var(--green)" };
  if (ro >= be * 0.7) return { testo: "Sotto il break-even", colore: "var(--orange)" };
  return { testo: "In perdita netta", colore: "var(--red)" };
}

export default async function AnalisiCampagne({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; da?: string; a?: string; canale?: string; brand?: string }>;
}) {
  const p = await searchParams;
  const periodo = risolviPeriodo(p.preset, p.da, p.a);
  const canale = p.canale || undefined;
  const brand = p.brand || undefined;

  const [ora, prima, anno] = await Promise.all([
    aggregaPeriodo(periodo.corrente, canale, brand),
    aggregaPeriodo(periodo.precedente, canale, brand),
    aggregaPeriodo(periodo.annoPrima, canale, brand),
  ]);

  const campagne = [...ora.perCampagna.entries()].sort((x, y) => y[1].spesa - x[1].spesa);
  const brands = [...ora.perBrand.entries()].sort((x, y) => y[1].spesa - x[1].spesa);
  const roasOra = roas(ora.totale);
  const nessunDato = ora.totale.spesa === 0 && ora.totale.ricavi === 0 && campagne.length === 0;

  const linkPreset = (chiave: string) => {
    const q = new URLSearchParams();
    if (chiave !== "libero") q.set("preset", chiave);
    if (canale) q.set("canale", canale);
    if (brand) q.set("brand", brand);
    return `/analisi-campagne?${q.toString()}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="periodo" canaleAttivo={canale} brandAttivo={brand} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Analisi periodo</h1>
            <p className="page-sub">
              {periodo.corrente.etichetta} · confronto col periodo precedente (Δ) e con lo stesso periodo 2025 (Δa) —
              nel gifting conta il confronto anno su anno, la stagionalità domina.
            </p>
          </div>
        </div>

        {/* Selettore del periodo */}
        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 12 }}>
            {PRESET_PERIODO.filter((x) => x.chiave !== "libero").map((x) => (
              <a
                key={x.chiave}
                className={`pill-opt${periodo.preset === x.chiave ? " attuale" : ""}`}
                href={linkPreset(x.chiave)}
              >
                {x.nome}
              </a>
            ))}
          </div>
          <form className="filtri" method="get" action="/analisi-campagne" style={{ marginBottom: 0 }}>
            <input type="date" name="da" defaultValue={p.da ?? ""} title="Dal" />
            <input type="date" name="a" defaultValue={p.a ?? ""} title="Al (compreso)" />
            <select name="canale" defaultValue={canale ?? ""}>
              <option value="">Tutti i canali</option>
              {Object.entries(ETICHETTA_CANALE).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select name="brand" defaultValue={brand ?? ""}>
              <option value="">Tutti i brand</option>
              {Object.entries(ETICHETTA_BRAND).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button className="btn small" type="submit">Applica</button>
          </form>
        </section>

        {nessunDato ? (
          <div className="vuoto">
            Nessuna metrica nel periodo {periodo.corrente.etichetta}
            {canale ? ` per ${ETICHETTA_CANALE[canale] ?? canale}` : ""}: le metriche
            giornaliere arrivano dallo script di Google Ads (funzione main) o via API.
          </div>
        ) : (
          <>
            {/* KPI del periodo con doppio confronto */}
            <div className="kpi-riga">
              <div className="kpi">
                <div className="kpi-valore">{formattaEuro(ora.totale.spesa)}</div>
                <div className="kpi-etichetta">
                  Spesa · Δ <Delta ora={ora.totale.spesa} prima={prima.totale.spesa} /> · Δa{" "}
                  <Delta ora={ora.totale.spesa} prima={anno.totale.spesa} />
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{formattaEuro(ora.totale.ricavi)}</div>
                <div className="kpi-etichetta">
                  Ricavi (piattaforma) · Δ <Delta ora={ora.totale.ricavi} prima={prima.totale.ricavi} /> · Δa{" "}
                  <Delta ora={ora.totale.ricavi} prima={anno.totale.ricavi} />
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{roasOra != null ? `${roasOra.toFixed(2)}×` : "—"}</div>
                <div className="kpi-etichetta">
                  ROAS{brand ? ` · break-even ${breakEvenRoas(brand).toFixed(1)}×` : ""} · reale stimato{" "}
                  {roasOra != null ? `${(roasOra * 0.6).toFixed(1)}–${(roasOra * 0.75).toFixed(1)}×` : "—"}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{Math.round(ora.totale.conversioni)}</div>
                <div className="kpi-etichetta">
                  Conversioni · CPA {formattaEuro(cpa(ora.totale))} · Δ{" "}
                  <Delta ora={ora.totale.conversioni} prima={prima.totale.conversioni} />
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{ctr(ora.totale) != null ? `${ctr(ora.totale)!.toFixed(2)}%` : "—"}</div>
                <div className="kpi-etichetta">
                  CTR · {ora.totale.click.toLocaleString("it-IT")} clic su {ora.totale.impression.toLocaleString("it-IT")} impr.
                </div>
              </div>
            </div>

            {/* Per brand */}
            {brands.length > 1 && (
              <section className="scheda">
                <div className="scheda-titolo">Per brand</div>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Brand</th><th>Spesa</th><th>Ricavi</th><th>ROAS</th>
                        <th>Break-even</th><th>Conv.</th><th>CPA</th><th>Δ ricavi</th><th>Δa ricavi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brands.map(([b, r]) => {
                        const ro = roas(r);
                        const be = breakEvenRoas(b);
                        return (
                          <tr key={b}>
                            <td className="cella-nome">{ETICHETTA_BRAND[b] ?? b}</td>
                            <td>{formattaEuro(r.spesa)}</td>
                            <td>{formattaEuro(r.ricavi)}</td>
                            <td style={{ fontWeight: 600, color: ro != null ? (ro >= be ? "var(--green)" : "var(--red)") : undefined }}>
                              {ro != null ? `${ro.toFixed(2)}×` : "—"}
                            </td>
                            <td className="cella-muta">{be.toFixed(1)}×</td>
                            <td>{Math.round(r.conversioni)}</td>
                            <td>{formattaEuro(cpa(r))}</td>
                            <td><Delta ora={r.ricavi} prima={prima.perBrand.get(b)?.ricavi ?? 0} /></td>
                            <td><Delta ora={r.ricavi} prima={anno.perBrand.get(b)?.ricavi ?? 0} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Per campagna */}
            <section className="scheda">
              <div className="scheda-titolo">Per campagna ({campagne.length})</div>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Campagna</th><th>Spesa</th><th>Ricavi</th><th>ROAS</th>
                      <th>Conv.</th><th>CPA</th><th>CTR</th><th>Δ spesa</th><th>Δa ricavi</th><th>Giudizio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campagne.map(([id, r]) => {
                      const ro = roas(r);
                      const g = giudizio(r, r.brand);
                      const pr = prima.perCampagna.get(id);
                      const an = anno.perCampagna.get(id);
                      return (
                        <tr key={id}>
                          <td style={{ maxWidth: 260 }}>
                            <a className="cella-nome" href={`/campagne/${id}`}>{r.nome}</a>
                            <div className="cella-sub">
                              {ETICHETTA_BRAND[r.brand] ?? r.brand} · {ETICHETTA_CANALE[r.canale] ?? r.canale}
                              {r.classe === "traino" ? " · TRAINO" : ""}
                              {r.stato === "in_pausa" ? " · in pausa" : ""}
                            </div>
                          </td>
                          <td>{formattaEuro(r.spesa)}</td>
                          <td>{formattaEuro(r.ricavi)}</td>
                          <td style={{ fontWeight: 600, color: ro != null ? (ro >= breakEvenRoas(r.brand) ? "var(--green)" : "var(--red)") : undefined }}>
                            {ro != null ? `${ro.toFixed(2)}×` : "—"}
                          </td>
                          <td>{Math.round(r.conversioni)}</td>
                          <td>{formattaEuro(cpa(r))}</td>
                          <td>{ctr(r) != null ? `${ctr(r)!.toFixed(2)}%` : "—"}</td>
                          <td><Delta ora={r.spesa} prima={pr?.spesa ?? 0} invertito /></td>
                          <td><Delta ora={r.ricavi} prima={an?.ricavi ?? 0} /></td>
                          <td><span style={{ fontSize: 12, fontWeight: 600, color: g.colore }}>{g.testo}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="cella-sub" style={{ marginTop: 10 }}>
                Ricavi e ROAS sono quelli dichiarati dalla piattaforma: il reale stimato è il 60–75%
                (doc 10 §3). Le campagne senza metriche nel periodo non compaiono. Δ = variazione sul
                periodo precedente della stessa lunghezza · Δa = sullo stesso periodo del 2025.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
