import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_STATO_CAMPAGNA,
  COLORE_STATO_LANDING,
  ETICHETTA_BRAND,
  ETICHETTA_STATO_LANDING,
  formattaData,
  STATI_LANDING,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Registro delle landing: quale pagina riceve il traffico di quali campagne,
// con stato (attiva / mismatch / da verificare) e performance nella scheda.
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
    orderBy: [{ brand: "asc" }, { url: "asc" }],
    include: {
      campagne: { select: { id: true, nome: true, stato: true, budgetGiornaliero: true } },
      metriche: { orderBy: { periodo: "desc" }, take: 1 },
    },
  });
  const nMismatch = landing.filter((l) => l.stato === "mismatch").length;

  return (
    <div className="layout">
      <Sidebar attiva="landing" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Landing page</h1>
            <p className="page-sub">
              Lo schema chiaro delle landing: a quali campagne sono associate, in che stato sono
              (i mismatch di lingua o destinazione sono evidenziati) e le loro performance.
              Configurazione canonica nella Mappa 00.4 su Drive.
            </p>
          </div>
          <a className="btn" href="/landing/nuova">Registra landing</a>
        </div>

        {nMismatch > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>{nMismatch} landing in mismatch</b>: campagne che mandano traffico alla pagina
              sbagliata (lingua o destinazione). Regola: campagna ENG → URL con /en; brand
              protection → landing dedicata, non la home.
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

        {landing.length === 0 ? (
          <div className="vuoto">Nessuna landing registrata con questi filtri.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Landing</th>
                  <th>Brand</th>
                  <th>Lingua</th>
                  <th>Stato</th>
                  <th>Campagne collegate</th>
                  <th className="num">Ultima perf.</th>
                </tr>
              </thead>
              <tbody>
                {landing.map((l) => {
                  const m = l.metriche[0];
                  return (
                    <tr key={l.id}>
                      <td style={{ maxWidth: 340 }}>
                        <a href={`/landing/${l.id}`}>
                          <div className="cella-nome" style={{ overflowWrap: "anywhere" }}>{l.url}</div>
                          {l.scopo && <div className="cella-sub" style={{ whiteSpace: "normal" }}>{l.scopo}</div>}
                        </a>
                      </td>
                      <td>
                        <Badge testo={ETICHETTA_BRAND[l.brand] ?? l.brand} colore={COLORE_BRAND[l.brand] ?? "var(--text-tertiary)"} />
                      </td>
                      <td className="cella-muta" style={{ textTransform: "uppercase" }}>{l.lingua ?? "—"}</td>
                      <td>
                        <Badge testo={ETICHETTA_STATO_LANDING[l.stato] ?? l.stato} colore={COLORE_STATO_LANDING[l.stato] ?? "var(--text-tertiary)"} />
                      </td>
                      <td>
                        {l.campagne.length === 0 ? (
                          <span className="cella-muta">—</span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {l.campagne.map((c) => (
                              <a key={c.id} href={`/campagne/${c.id}`} style={{ fontSize: 12.5 }}>
                                <span className="sb-dot" style={{ display: "inline-block", background: COLORE_STATO_CAMPAGNA[c.stato] ?? "var(--text-tertiary)", marginRight: 6, width: 7, height: 7 }} />
                                {c.nome}
                                {c.budgetGiornaliero != null && <span className="cella-muta"> · {c.budgetGiornaliero}€/g</span>}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="num cella-muta">
                        {m ? `${m.periodo}${m.tassoConversione != null ? ` · CR ${(m.tassoConversione * 100).toFixed(1)}%` : ""}` : formattaData(l.verificataIl)}
                      </td>
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
