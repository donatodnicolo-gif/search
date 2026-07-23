import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
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

export default async function PaginaCampagne({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; stato?: string }>;
}) {
  const { brand, stato } = await searchParams;
  const giorni30 = new Date(Date.now() - 30 * 86_400_000);
  const campagne = await prisma.campagna.findMany({
    where: { ...(brand ? { brand } : {}), ...(stato ? { stato } : {}) },
    orderBy: [{ stato: "asc" }, { creataIl: "desc" }],
    include: {
      metriche: { where: { data: { gte: giorni30 } } },
      _count: { select: { azioni: true } },
    },
  });

  return (
    <div className="layout">
      <Sidebar attiva="campagne" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Campagne</h1>
            <p className="page-sub">
              Il registro vivo delle campagne ADV con spesa, conversioni e ROAS degli ultimi 30
              giorni. Le metriche arrivano dalle sessioni Claude via API o si inseriscono a mano.
            </p>
          </div>
          <a className="btn" href="/campagne/nuova">Nuova campagna</a>
        </div>

        <form className="filtri" method="get">
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
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
          <div className="vuoto">Nessuna campagna registrata: creane una o falla registrare via API.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campagna</th>
                  <th>Brand</th>
                  <th>Canale</th>
                  <th>Stato</th>
                  <th className="num">Budget/g</th>
                  <th className="num">Spesa 30gg</th>
                  <th className="num">Conv. 30gg</th>
                  <th className="num">ROAS 30gg</th>
                  <th className="num">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {campagne.map((c) => {
                  const spesa = c.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
                  const ricavi = c.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
                  const conv = c.metriche.reduce((s, m) => s + (m.conversioni ?? 0), 0);
                  const r = roas(ricavi, spesa);
                  return (
                    <tr key={c.id}>
                      <td>
                        <a href={`/campagne/${c.id}`}>
                          <div className="cella-nome">{c.nome}</div>
                          {c.obiettivo && <div className="cella-sub">{c.obiettivo}</div>}
                        </a>
                      </td>
                      <td>
                        <Badge testo={ETICHETTA_BRAND[c.brand] ?? c.brand} colore={COLORE_BRAND[c.brand] ?? "var(--text-tertiary)"} />
                      </td>
                      <td className="cella-muta">{ETICHETTA_CANALE[c.canale] ?? c.canale}</td>
                      <td>
                        <Badge testo={ETICHETTA_STATO_CAMPAGNA[c.stato] ?? c.stato} colore={COLORE_STATO_CAMPAGNA[c.stato] ?? "var(--text-tertiary)"} />
                      </td>
                      <td className="num">{formattaEuro(c.budgetGiornaliero)}</td>
                      <td className="num">{spesa > 0 ? formattaEuro(spesa) : "—"}</td>
                      <td className="num">{conv > 0 ? conv.toLocaleString("it-IT") : "—"}</td>
                      <td className="num">{r != null ? `${r.toFixed(1)}×` : "—"}</td>
                      <td className="num">{c._count.azioni || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
