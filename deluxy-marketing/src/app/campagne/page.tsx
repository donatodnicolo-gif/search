import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_STATO_CAMPAGNA,
  formattaEuro,
  roas,
  STATI_CAMPAGNA,
} from "@/lib/dominio";
import { categoriaCampagna, iconaCanale, saluteCampagna } from "@/lib/salute";
import { COLORE_CLASSE, ETICHETTA_CLASSE } from "@/lib/dominio";

export const dynamic = "force-dynamic";

const ORDINE_BRAND = ["flowers", "gifts", "cake", "cross"];
const ORDINE_CANALE = ["google_ads", "meta_ads", "tiktok", "email", "sito", "seo", "crm", "social", "altro"];

// Esplora campagne: una colonna per brand, una card per campagna con icona di
// canale e categoria, landing, budget, performance e stato di salute.
export default async function PaginaCampagne({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; canale?: string; brand?: string; q?: string }>;
}) {
  const { stato, canale, brand, q } = await searchParams;
  const giorni30 = new Date(Date.now() - 30 * 86_400_000);
  const campagne = await prisma.campagna.findMany({
    where: {
      ...(stato ? { stato } : {}),
      ...(canale ? { canale } : {}),
      ...(brand ? { brand } : {}),
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
      <Sidebar attiva="campagne" canaleAttivo={canale} brandAttivo={brand} />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Campagne{canale ? ` — ${ETICHETTA_CANALE[canale] ?? canale}` : ""}
            </h1>
            <p className="page-sub">
              Una colonna per brand. Ogni card mostra il canale e la categoria di prodotto con
              un&apos;icona, la landing di destinazione, il budget e come sta andando: performa,
              nella media, in apprendimento o critica.
            </p>
          </div>
          <a className="btn" href="/campagne/nuova">Nuova campagna</a>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca una campagna…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="canale" defaultValue={canale ?? ""}>
            <option value="">Tutti i canali</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="tiktok">TikTok</option>
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
          <div className="colonne-brand">
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
                <div className="colonna-brand" key={brand}>
                  <div className="colonna-brand-testata">
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
                    const salute = saluteCampagna(c.stato, r, spesa, c.brand);
                    const categoria = categoriaCampagna(`${c.nome} ${c.landing?.url ?? ""} ${c.obiettivo ?? ""}`);
                    const nuovoCanale = c.canale !== canalePrec;
                    canalePrec = c.canale;
                    return (
                      <div key={c.id}>
                        {nuovoCanale && (
                          <div className="canale-divisore">
                            <Icona nome={iconaCanale(c.canale)} />
                            {ETICHETTA_CANALE[c.canale] ?? c.canale}
                          </div>
                        )}
                        <a className="card-campagna" href={`/campagne/${c.id}`}>
                          <div className="card-campagna-alto">
                            <span className="card-campagna-icona" title={categoria.nome}>
                              <Icona nome={categoria.icona} />
                            </span>
                            <span className="card-campagna-nome">{c.nome}</span>
                          </div>
                          <div className="card-campagna-tag">
                            <span className="tag-salute" style={{ color: salute.colore }} title={salute.spiega}>
                              <span className="dot" />
                              {salute.etichetta}
                            </span>
                            <span className="tag-neutro">{categoria.nome}</span>
                            {c.classe !== "standard" && (
                              <span className="tag-salute" style={{ color: COLORE_CLASSE[c.classe] }} title={c.classe === "traino" ? "Campagna protetta (doc 11): modifiche solo con change control" : "Campagna sperimentale"}>
                                <span className="dot" />
                                {c.classe === "traino" ? "🛡 Traino" : ETICHETTA_CLASSE[c.classe]}
                              </span>
                            )}
                          </div>
                          {c.obiettivo && <div className="card-campagna-obiettivo">◎ {c.obiettivo}</div>}
                          {c.landing && (
                            <div
                              className="card-campagna-landing"
                              style={c.landing.stato === "mismatch" ? { color: "var(--orange)" } : undefined}
                              title={c.landing.url}
                            >
                              ↳ {c.landing.url.replace(/^[^/]+/, "") || "/"}
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
                              <b style={r != null ? { color: salute.colore } : undefined}>
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
