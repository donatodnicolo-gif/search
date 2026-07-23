import { Badge } from "@/components/Badge";
import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_STATO_LANDING,
  ETICHETTA_BRAND,
  ETICHETTA_STATO_LANDING,
  STATI_LANDING,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Tema visivo della landing dedotto da URL e scopo → icona e colore.
function temaLanding(url: string, scopo: string | null): { icona: string; colore: string; nome: string } {
  const t = `${url} ${scopo ?? ""}`.toLowerCase();
  if (/fior|flower|rose|bouquet/.test(t)) return { icona: "fiori", colore: "var(--purple)", nome: "Fiori" };
  if (/tort|cake/.test(t)) return { icona: "torta", colore: "var(--orange)", nome: "Torte" };
  if (/colazion/.test(t)) return { icona: "colazione", colore: "var(--gold-strong)", nome: "Colazioni" };
  if (/palloncin|balloon/.test(t)) return { icona: "palloncino", colore: "var(--red)", nome: "Palloncini" };
  if (/compleanno|birthday/.test(t)) return { icona: "compleanno", colore: "var(--pink, var(--red))", nome: "Compleanno" };
  if (/event|allestiment|matrimon|catering/.test(t)) return { icona: "eventi", colore: "var(--green)", nome: "Eventi" };
  if (/corporate|aziendal|b2b|business/.test(t)) return { icona: "b2b", colore: "var(--text-secondary)", nome: "B2B" };
  if (/paris|destination|mykonos|santorini|francia/.test(t)) return { icona: "destinazioni", colore: "var(--blue)", nome: "Destinazioni" };
  if (/regal|gift/.test(t)) return { icona: "regalo", colore: "var(--blue)", nome: "Regali" };
  if (/brand|protection|^[a-z.]+\/$|\/$/.test(t)) return { icona: "audit", colore: "var(--text-tertiary)", nome: "Brand" };
  return { icona: "pagina", colore: "var(--text-tertiary)", nome: "Pagina" };
}

const ORDINE_BRAND = ["flowers", "gifts", "cake", "cross"];

// Registro visivo delle landing: card a tema con campagne associate e stato.
export default async function PaginaLanding({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; stato?: string; q?: string }>;
}) {
  const { brand, stato, q } = await searchParams;
  const landing = await prisma.landingPage.findMany({
    where: {
      ...(brand ? { brand } : {}),
      ...(stato ? { stato } : {}),
      ...(q ? { OR: [{ url: { contains: q } }, { scopo: { contains: q } }] } : {}),
    },
    orderBy: { url: "asc" },
    include: {
      campagne: { select: { id: true, nome: true, stato: true, budgetGiornaliero: true } },
      metriche: { orderBy: { periodo: "desc" }, take: 1 },
    },
  });
  const nMismatch = landing.filter((l) => l.stato === "mismatch").length;
  const brands = ORDINE_BRAND.filter((b) => landing.some((l) => l.brand === b));

  return (
    <div className="layout">
      <Sidebar attiva="landing" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Landing page</h1>
            <p className="page-sub">
              Lo schema delle landing per brand: ogni card mostra il tema, le campagne che ci
              atterrano e lo stato. I mismatch (lingua o destinazione sbagliata) sono in
              arancione. Config canonica: Mappa 00.4 su Drive.
            </p>
          </div>
          <a className="btn" href="/landing/nuova">Registra landing</a>
        </div>

        {nMismatch > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>{nMismatch} landing in mismatch</b>: campagne che mandano traffico alla pagina
              sbagliata. Regola: campagna ENG → URL con /en; brand protection → landing dedicata,
              non la home.
            </span>
          </div>
        )}

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca per URL o scopo…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="stato" defaultValue={stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {STATI_LANDING.map((s) => (
              <option key={s} value={s}>{ETICHETTA_STATO_LANDING[s]}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {landing.length === 0 && <div className="vuoto">Nessuna landing con questi filtri.</div>}

        {brands.map((b) => {
          const del = landing.filter((l) => l.brand === b);
          return (
            <section key={b} style={{ marginBottom: 26 }}>
              <div className="scheda-titolo" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="sb-dot" style={{ background: COLORE_BRAND[b], width: 9, height: 9 }} />
                {ETICHETTA_BRAND[b]} ({del.length})
              </div>
              <div className="griglia-landing">
                {del.map((l) => {
                  const tema = temaLanding(l.url, l.scopo);
                  const m = l.metriche[0];
                  return (
                    <a
                      className={`card-landing${l.stato === "mismatch" ? " card-landing-mismatch" : ""}`}
                      key={l.id}
                      href={`/landing/${l.id}`}
                    >
                      <div className="card-landing-testata">
                        <span className="card-landing-icona" style={{ color: tema.colore }}>
                          <Icona nome={tema.icona} />
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span className="card-landing-tema" style={{ color: tema.colore }}>
                            {tema.nome}
                            {l.lingua ? ` · ${l.lingua.toUpperCase()}` : ""}
                          </span>
                          <span className="card-landing-url">{l.url.replace(/^[^/]+/, "") || "/"}</span>
                        </span>
                        <Badge
                          testo={ETICHETTA_STATO_LANDING[l.stato] ?? l.stato}
                          colore={COLORE_STATO_LANDING[l.stato] ?? "var(--text-tertiary)"}
                        />
                      </div>
                      {l.scopo && <div className="card-landing-scopo">{l.scopo}</div>}
                      <div className="card-landing-piede">
                        <span>
                          {l.campagne.length > 0
                            ? `${l.campagne.length} campagn${l.campagne.length === 1 ? "a" : "e"} · ${l.campagne
                                .reduce((s, c) => s + (c.budgetGiornaliero ?? 0), 0)
                                .toFixed(0)}€/g`
                            : "Nessuna campagna"}
                        </span>
                        {m?.tassoConversione != null && <span>CR {(m.tassoConversione * 100).toFixed(1)}%</span>}
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
