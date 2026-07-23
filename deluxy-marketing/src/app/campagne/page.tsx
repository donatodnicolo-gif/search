import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  COLORE_BRAND,
  COLORE_STATO_CAMPAGNA,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_STATO_CAMPAGNA,
  formattaEuro,
  roas,
  STATI_CAMPAGNA,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

const ORDINE_BRAND = ["flowers", "gifts", "cake", "cross"];
const ORDINE_CANALE = ["google_ads", "meta_ads", "email", "sito", "seo", "crm", "social", "altro"];

// Esplora campagne: una colonna per brand, una card per campagna con canale,
// landing, obiettivo, budget e performance degli ultimi 30 giorni.
export default async function PaginaCampagne({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; canale?: string; q?: string }>;
}) {
  const { stato, canale, q } = await searchParams;
  const giorni30 = new Date(Date.now() - 30 * 86_400_000);
  const campagne = await prisma.campagna.findMany({
    where: {
      ...(stato ? { stato } : {}),
      ...(canale ? { canale } : {}),
      ...(q ? { nome: { contains: q } } : {}),
    },
    include: {
      metriche: { where: { data: { gte: giorni30 } } },
      landing: { select: { id: true, url: true, stato: true } },
      _count: { select: { azioni: true } },
    },
  });

  const brands = ORDINE_BRAND.filter((b) => campagne.some((c) => c.brand === b));

  return (
    <div className="layout">
      <Sidebar attiva="campagne" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Campagne</h1>
            <p className="page-sub">
              Tutte le campagne per brand: canale, landing di destinazione, obiettivo, budget e
              performance degli ultimi 30 giorni. Configurazione canonica nella Mappa 00.4.
            </p>
          </div>
          <a className="btn" href="/campagne/nuova">Nuova campagna</a>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca una campagna…" defaultValue={q ?? ""} />
          <select name="canale" defaultValue={canale ?? ""}>
            <option value="">Tutti i canali</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
          </select>
          <select name="stato" defaultValue={stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {STATI_CAMPAGNA.map((s) => (
              <option key={s} value={s}>{ETICHETTA_STATO_CAMPAGNA[s]}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {campagne.length === 0 ? (
          <div className="vuoto">Nessuna campagna con questi filtri.</div>
        ) : (
          <div className="board" style={{ gridAutoColumns: "minmax(300px, 1fr)" }}>
            {brands.map((brand) => {
              const del = campagne
                .filter((c) => c.brand === brand)
                .sort(
                  (a, b) =>
                    ORDINE_CANALE.indexOf(a.canale) - ORDINE_CANALE.indexOf(b.canale) ||
                    (b.budgetGiornaliero ?? 0) - (a.budgetGiornaliero ?? 0)
                );
              const budgetGiorno = del
                .filter((c) => c.stato === "attiva" || c.stato === "in_apprendimento")
                .reduce((s, c) => s + (c.budgetGiornaliero ?? 0), 0);
              let canalePrec = "";
              return (
                <div className="board-colonna" key={brand}>
                  <div className="board-testata">
                    <span className="board-titolo">
                      <span className="sb-dot" style={{ background: COLORE_BRAND[brand], width: 9, height: 9 }} />
                      {ETICHETTA_BRAND[brand]}
                    </span>
                    <span className="board-conta">
                      {del.length} · {formattaEuro(budgetGiorno)}/g
                    </span>
                  </div>
                  {del.map((c) => {
                    const spesa = c.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
                    const ricavi = c.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
                    const r = roas(ricavi, spesa);
                    const intestazioneCanale = c.canale !== canalePrec;
                    canalePrec = c.canale;
                    return (
                      <div key={c.id}>
                        {intestazioneCanale && (
                          <div className="canale-divisore">{ETICHETTA_CANALE[c.canale] ?? c.canale}</div>
                        )}
                        <a className="board-card card-campagna" href={`/campagne/${c.id}`}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <span className="board-card-nome" style={{ minWidth: 0 }}>{c.nome}</span>
                            <Badge
                              testo={ETICHETTA_STATO_CAMPAGNA[c.stato] ?? c.stato}
                              colore={COLORE_STATO_CAMPAGNA[c.stato] ?? "var(--text-tertiary)"}
                            />
                          </div>
                          {c.obiettivo && (
                            <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 3 }}>
                              ◎ {c.obiettivo}
                            </div>
                          )}
                          {c.landing && (
                            <div
                              className="cella-sub"
                              style={{ marginTop: 3, color: c.landing.stato === "mismatch" ? "var(--orange)" : undefined }}
                              title={c.landing.url}
                            >
                              ↳ {c.landing.url.replace(/^[^/]+/, "")}
                              {c.landing.stato === "mismatch" ? " · mismatch" : ""}
                            </div>
                          )}
                          <div className="card-campagna-kpi">
                            <span>
                              <b>{c.budgetGiornaliero != null ? `${formattaEuro(c.budgetGiornaliero)}/g` : "—"}</b>
                              <i>budget</i>
                            </span>
                            <span>
                              <b>{spesa > 0 ? formattaEuro(spesa) : "—"}</b>
                              <i>spesa 30g</i>
                            </span>
                            <span>
                              <b style={r != null ? { color: r >= 3 ? "var(--green)" : "var(--orange)" } : undefined}>
                                {r != null ? `${r.toFixed(1)}×` : "—"}
                              </b>
                              <i>ROAS</i>
                            </span>
                            {c._count.azioni > 0 && (
                              <span>
                                <b>{c._count.azioni}</b>
                                <i>azioni</i>
                              </span>
                            )}
                          </div>
                        </a>
                      </div>
                    );
                  })}
                  {del.length === 0 && <div className="vuoto-mini">Nessuna campagna</div>}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
