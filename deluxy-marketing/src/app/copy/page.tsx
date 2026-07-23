import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, formattaEuro } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Copy & annunci: titoli e descrizioni RSA per campagna, con keyword e resa.
// Fonte: fogli "Flowers ADS Google" (+ENG) del Monitoraggio; regole di tono
// e claim nei Definitivi 7.2/7.3 su Drive.
export default async function PaginaCopy({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; campagna?: string; q?: string }>;
}) {
  const { brand, campagna, q } = await searchParams;
  const tutti = await prisma.copyAnnuncio.findMany({
    where: {
      ...(brand ? { brand } : {}),
      ...(campagna ? { campagna } : {}),
      ...(q ? { testo: { contains: q } } : {}),
    },
    orderBy: [{ campagna: "asc" }, { tipo: "asc" }, { posizione: "asc" }],
  });
  const campagne = await prisma.copyAnnuncio.groupBy({ by: ["campagna"], orderBy: { campagna: "asc" } });

  // raggruppa per campagna
  const perCampagna = new Map<string, typeof tutti>();
  for (const c of tutti) {
    if (!perCampagna.has(c.campagna)) perCampagna.set(c.campagna, []);
    perCampagna.get(c.campagna)!.push(c);
  }

  return (
    <div className="layout">
      <Sidebar attiva="copy" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Copy &amp; annunci</h1>
            <p className="page-sub">
              I testi degli annunci per campagna: titoli e descrizioni RSA con conteggio caratteri,
              keyword con resa e spesa. Le regole di tono e claim per brand vivono nei Definitivi
              (7.2 Tono di Voce, 7.3 Claim e Consegna).
            </p>
          </div>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca nel testo…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="campagna" defaultValue={campagna ?? ""}>
            <option value="">Tutte le campagne</option>
            {campagne.map((c) => (
              <option key={c.campagna} value={c.campagna}>{c.campagna}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {perCampagna.size === 0 && (
          <div className="vuoto">Nessun copy: importare il Monitoraggio o depositare via API.</div>
        )}

        {[...perCampagna.entries()].map(([nomeCampagna, asset]) => {
          const titoli = asset.filter((a) => a.tipo === "titolo");
          const descrizioni = asset.filter((a) => a.tipo === "descrizione");
          const keyword = asset.filter((a) => a.tipo === "keyword");
          const note = asset.filter((a) => a.tipo === "nota");
          const brandCampagna = asset[0]?.brand ?? "cross";
          return (
            <section className="scheda" key={nomeCampagna}>
              <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {nomeCampagna}
                <Badge testo={ETICHETTA_BRAND[brandCampagna] ?? brandCampagna} colore={COLORE_BRAND[brandCampagna] ?? "var(--text-tertiary)"} />
                {note.map((n) => (
                  <Badge key={n.id} testo={n.testo} colore="var(--green)" />
                ))}
                {asset[0]?.lingua && <span style={{ textTransform: "uppercase", color: "var(--text-tertiary)" }}>{asset[0].lingua}</span>}
              </div>
              <div className="due-colonne">
                <div>
                  {titoli.length > 0 && (
                    <>
                      <div className="cella-sub" style={{ marginBottom: 6 }}>TITOLI ({titoli.length}, max 30 caratteri)</div>
                      <ul className="storia">
                        {titoli.map((t) => (
                          <li key={t.id}>
                            <span className="storia-data">H{t.posizione}</span>
                            <span className="storia-testo">{t.testo}</span>
                            <span className="storia-autore" style={(t.caratteri ?? 0) > 30 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                              {t.caratteri} car.
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {descrizioni.length > 0 && (
                    <>
                      <div className="cella-sub" style={{ margin: "14px 0 6px" }}>DESCRIZIONI ({descrizioni.length}, max 90 caratteri)</div>
                      <ul className="storia">
                        {descrizioni.map((d) => (
                          <li key={d.id}>
                            <span className="storia-data">D{d.posizione}</span>
                            <span className="storia-testo">{d.testo}</span>
                            <span className="storia-autore" style={(d.caratteri ?? 0) > 90 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                              {d.caratteri} car.
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div>
                  {keyword.length > 0 && (
                    <>
                      <div className="cella-sub" style={{ marginBottom: 6 }}>KEYWORD ({keyword.length}) — resa e spesa</div>
                      <div style={{ overflowX: "auto" }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Keyword</th>
                              <th className="num">Incasso</th>
                              <th className="num">Spesa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {keyword
                              .sort((a, b) => (b.incasso ?? 0) - (a.incasso ?? 0))
                              .slice(0, 15)
                              .map((k) => (
                                <tr key={k.id}>
                                  <td>{k.testo}</td>
                                  <td className="num" style={{ color: (k.incasso ?? 0) > 0 ? "var(--green)" : "var(--text-tertiary)" }}>
                                    {formattaEuro(k.incasso)}
                                  </td>
                                  <td className="num cella-muta">{formattaEuro(k.spesa)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {keyword.length > 15 && (
                        <div className="cella-sub" style={{ marginTop: 6 }}>
                          Mostrate le prime 15 per incasso ({keyword.length} totali).
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
