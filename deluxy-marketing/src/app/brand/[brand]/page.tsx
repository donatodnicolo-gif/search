import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { Scadenza } from "@/components/Scadenza";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_ESITO,
  COLORE_STATO_AZIONE,
  COLORE_STATO_CAMPAGNA,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_ESITO,
  ETICHETTA_STATO_AZIONE,
  ETICHETTA_STATO_CAMPAGNA,
  ETICHETTA_TIPO_ANALISI,
  formattaData,
  formattaEuro,
  roas,
  STATI_AZIONE_APERTI,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// La vista di un brand: tutte le analisi, le azioni, le campagne e la spesa
// di Flowers / Cake / Gifts / cross-brand in una pagina sola.
export default async function PaginaBrand({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  if (!(BRANDS as readonly string[]).includes(brand)) notFound();

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorni30 = new Date(oggi.getTime() - 29 * 86_400_000);

  const [aperte, scadute, analisi, campagne, metriche30] = await Promise.all([
    prisma.azione.findMany({
      where: { brand, stato: { in: STATI_AZIONE_APERTI } },
      orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
      take: 12,
    }),
    prisma.azione.count({
      where: { brand, stato: { in: STATI_AZIONE_APERTI }, scadenza: { lt: oggi } },
    }),
    prisma.analisi.findMany({ where: { brand }, orderBy: { dataAnalisi: "desc" }, take: 8 }),
    prisma.campagna.findMany({
      where: { brand },
      orderBy: [{ stato: "asc" }, { creataIl: "desc" }],
      include: { metriche: { where: { data: { gte: giorni30 } } } },
    }),
    prisma.metricaCampagna.findMany({
      where: { data: { gte: giorni30 }, campagna: { brand } },
      select: { data: true, spesa: true },
    }),
  ]);

  // Spesa del brand aggregata per giorno (30 giorni)
  const perGiorno = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(giorni30.getTime() + i * 86_400_000);
    perGiorno.set(d.toISOString().slice(0, 10), 0);
  }
  for (const m of metriche30) {
    const chiave = m.data.toISOString().slice(0, 10);
    if (perGiorno.has(chiave)) perGiorno.set(chiave, (perGiorno.get(chiave) ?? 0) + (m.spesa ?? 0));
  }
  const puntiSpesa = [...perGiorno.entries()].map(([g, valore]) => ({ data: new Date(g), valore }));
  const spesa30 = puntiSpesa.reduce((s, p) => s + p.valore, 0);
  const ricavi30 = campagne.reduce(
    (s, c) => s + c.metriche.reduce((sm, m) => sm + (m.ricavi ?? 0), 0),
    0
  );
  const roas30 = roas(ricavi30, spesa30);
  const ultimoAudit = analisi.find((a) => a.tipo.startsWith("audit_"));

  return (
    <div className="layout">
      <Sidebar brandAttivo={brand} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="sb-dot" style={{ background: COLORE_BRAND[brand], width: 14, height: 14 }} />
              {ETICHETTA_BRAND[brand]}
            </h1>
            <p className="page-sub">
              Tutto il marketing di {ETICHETTA_BRAND[brand]} in una pagina: analisi e audit, azioni
              aperte, campagne e spesa degli ultimi 30 giorni.
            </p>
          </div>
          <a className="btn" href={`/analisi/nuova?brand=${brand}`}>Deposita analisi</a>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{aperte.length}</div>
            <div className="kpi-etichetta">Azioni aperte</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={scadute > 0 ? { color: "var(--red)" } : undefined}>{scadute}</div>
            <div className="kpi-etichetta">Azioni scadute</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{spesa30 > 0 ? formattaEuro(spesa30) : "—"}</div>
            <div className="kpi-etichetta">Spesa 30 gg</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{roas30 != null ? `${roas30.toFixed(1)}×` : "—"}</div>
            <div className="kpi-etichetta">ROAS 30 gg</div>
          </div>
          <div className="kpi">
            {ultimoAudit?.esito ? (
              <div style={{ marginBottom: 6 }}>
                <Badge testo={ETICHETTA_ESITO[ultimoAudit.esito] ?? ultimoAudit.esito} colore={COLORE_ESITO[ultimoAudit.esito] ?? "var(--text-tertiary)"} />
              </div>
            ) : (
              <div className="kpi-valore">—</div>
            )}
            <div className="kpi-etichetta">
              Ultimo audit{ultimoAudit ? ` · ${formattaData(ultimoAudit.dataAnalisi)}` : ""}
            </div>
          </div>
        </div>

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">Azioni aperte</div>
              {aperte.length === 0 ? (
                <div className="vuoto-mini">Nessuna azione aperta per questo brand</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Azione</th>
                        <th>Stato</th>
                        <th>Scadenza</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aperte.map((a) => (
                        <tr key={a.id}>
                          <td><a href={`/azioni/${a.id}`} className="cella-nome">{a.titolo}</a></td>
                          <td>
                            <Badge testo={ETICHETTA_STATO_AZIONE[a.stato] ?? a.stato} colore={COLORE_STATO_AZIONE[a.stato] ?? "var(--text-tertiary)"} />
                          </td>
                          <td><Scadenza data={a.scadenza} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <a className="btn small btn-secondario" href={`/azioni?brand=${brand}`}>Tutte le azioni {ETICHETTA_BRAND[brand]}</a>
              </div>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Campagne</div>
              {campagne.length === 0 ? (
                <div className="vuoto-mini">Nessuna campagna registrata</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Campagna</th>
                        <th>Canale</th>
                        <th>Stato</th>
                        <th className="num">Spesa 30gg</th>
                        <th className="num">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campagne.map((c) => {
                        const sp = c.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
                        const ri = c.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
                        const r = roas(ri, sp);
                        return (
                          <tr key={c.id}>
                            <td><a href={`/campagne/${c.id}`} className="cella-nome">{c.nome}</a></td>
                            <td className="cella-muta">{ETICHETTA_CANALE[c.canale] ?? c.canale}</td>
                            <td>
                              <Badge testo={ETICHETTA_STATO_CAMPAGNA[c.stato] ?? c.stato} colore={COLORE_STATO_CAMPAGNA[c.stato] ?? "var(--text-tertiary)"} />
                            </td>
                            <td className="num">{sp > 0 ? formattaEuro(sp) : "—"}</td>
                            <td className="num">{r != null ? `${r.toFixed(1)}×` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div>
            <section className="scheda">
              <div className="scheda-titolo">Spesa {ETICHETTA_BRAND[brand]} — 30 giorni</div>
              <GraficoSpesa punti={puntiSpesa} />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Ultime analisi &amp; audit</div>
              {analisi.length === 0 ? (
                <div className="vuoto-mini">Nessuna analisi per questo brand</div>
              ) : (
                <ul className="storia">
                  {analisi.map((an) => (
                    <li key={an.id}>
                      <span className="storia-data">{formattaData(an.dataAnalisi)}</span>
                      <span className="storia-testo">
                        <a href={`/analisi/${an.id}`} className="cella-nome">{an.titolo}</a>
                        <span className="cella-sub">{ETICHETTA_TIPO_ANALISI[an.tipo] ?? an.tipo}</span>
                      </span>
                      {an.esito && (
                        <span className="storia-autore">
                          <Badge testo={ETICHETTA_ESITO[an.esito] ?? an.esito} colore={COLORE_ESITO[an.esito] ?? "var(--text-tertiary)"} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: 12 }}>
                <a className="btn small btn-secondario" href={`/analisi?brand=${brand}`}>Tutte le analisi {ETICHETTA_BRAND[brand]}</a>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
