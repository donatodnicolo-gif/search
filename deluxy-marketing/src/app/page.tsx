import { Badge } from "@/components/Badge";
import { BottoneSync } from "@/components/BottoneSync";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { Scadenza } from "@/components/Scadenza";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  COLORE_BRAND,
  COLORE_ESITO,
  COLORE_STATO_AZIONE,
  ETICHETTA_BRAND,
  ETICHETTA_ESITO,
  ETICHETTA_STATO_AZIONE,
  ETICHETTA_TIPO_ANALISI,
  formattaData,
  formattaEuro,
  STATI_AZIONE_APERTI,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

function settimanaIso(d: Date): number {
  const data = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const giorno = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - giorno);
  const inizioAnno = new Date(Date.UTC(data.getUTCFullYear(), 0, 1));
  return Math.ceil(((data.getTime() - inizioAnno.getTime()) / 86_400_000 + 1) / 7);
}

// ROS (vendite / spesa MKT) sulle ultime 4 settimane registrate di uno scope,
// con confronto sulle stesse settimane dell'anno prima.
async function rosScope(scope: string): Promise<{ ros: number | null; delta: number | null }> {
  const settimane = await prisma.settimanaMkt.findMany({
    where: { scope, anno: 2026, vendite: { not: null } },
    orderBy: { inizio: "desc" },
    take: 4,
  });
  if (settimane.length === 0) return { ros: null, delta: null };
  const spesa = settimane.reduce((s, w) => s + (w.google ?? 0) + (w.meta ?? 0), 0);
  const vendite = settimane.reduce((s, w) => s + (w.vendite ?? 0), 0);
  const ros = spesa > 0 ? vendite / spesa : null;
  const numeri = settimane.map((w) => settimanaIso(w.inizio));
  const prima = await prisma.settimanaMkt.findMany({ where: { scope, anno: 2025 } });
  const primaFiltrate = prima.filter((w) => numeri.includes(settimanaIso(w.inizio)));
  const spesaPrima = primaFiltrate.reduce((s, w) => s + (w.google ?? 0) + (w.meta ?? 0), 0);
  const venditePrima = primaFiltrate.reduce((s, w) => s + (w.vendite ?? 0), 0);
  const rosPrima = spesaPrima > 0 ? venditePrima / spesaPrima : null;
  return { ros, delta: ros != null && rosPrima != null && rosPrima > 0 ? ros / rosPrima - 1 : null };
}

export default async function Dashboard() {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorni30 = new Date(oggi.getTime() - 30 * 86_400_000);
  const giorni14 = new Date(oggi.getTime() - 13 * 86_400_000);

  const [aperte, scadute, nAnalisi30, campagneAttive, azioniUrgenti, ultimeAnalisi, metriche14, alertAperti, fatteNonVerificate] =
    await Promise.all([
      prisma.azione.count({ where: { stato: { in: STATI_AZIONE_APERTI } } }),
      prisma.azione.count({
        where: { stato: { in: STATI_AZIONE_APERTI }, scadenza: { lt: oggi } },
      }),
      prisma.analisi.count({ where: { dataAnalisi: { gte: giorni30 } } }),
      prisma.campagna.count({ where: { stato: { in: ["attiva", "in_apprendimento"] } } }),
      prisma.azione.findMany({
        where: { stato: { in: STATI_AZIONE_APERTI } },
        orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
        take: 10,
        include: { analisi: { select: { titolo: true } }, campagna: { select: { nome: true } } },
      }),
      prisma.analisi.findMany({ orderBy: { dataAnalisi: "desc" }, take: 6 }),
      prisma.metricaCampagna.findMany({
        where: { data: { gte: giorni14 } },
        select: { data: true, spesa: true },
      }),
      prisma.alert.findMany({
        where: { stato: "aperto", creatoIl: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        include: { campagna: { select: { id: true, nome: true } } },
        orderBy: { creatoIl: "desc" },
        take: 8,
      }),
      prisma.azione.findMany({
        where: { stato: "fatta", verificataIl: null, fattoIl: { not: null } },
        orderBy: { fattoIl: "desc" },
        take: 6,
        select: { id: true, titolo: true, fattoIl: true },
      }),
    ]);

  // Spesa aggregata per giorno negli ultimi 14 giorni
  const perGiorno = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(giorni14.getTime() + i * 86_400_000);
    perGiorno.set(d.toISOString().slice(0, 10), 0);
  }
  for (const m of metriche14) {
    const chiave = m.data.toISOString().slice(0, 10);
    if (perGiorno.has(chiave)) perGiorno.set(chiave, (perGiorno.get(chiave) ?? 0) + (m.spesa ?? 0));
  }
  const puntiSpesa = [...perGiorno.entries()].map(([giorno, valore]) => ({
    data: new Date(giorno),
    valore,
  }));
  const spesa7 = puntiSpesa.slice(-7).reduce((s, p) => s + p.valore, 0);

  const [rosTotale, rosGifts, rosFlowers, rosCake] = await Promise.all([
    rosScope("totale"),
    rosScope("gifts"),
    rosScope("flowers"),
    rosScope("cake"),
  ]);
  const rosPerScope: Record<string, { ros: number | null; delta: number | null }> = {
    totale: rosTotale,
    gifts: rosGifts,
    flowers: rosFlowers,
    cake: rosCake,
  };

  return (
    <div className="layout">
      <Sidebar attiva="home" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Dashboard marketing</h1>
            <p className="page-sub">
              La memoria operativa dell&apos;ADV Deluxy: cosa dicono le analisi, cosa c&apos;è da fare,
              come vanno le campagne. Fonte documentale: cartella Drive “ADV DELUXY SRL”.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <BottoneSync />
            <a className="btn" href="/analisi/nuova">Deposita analisi</a>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{aperte}</div>
            <div className="kpi-etichetta">Azioni aperte</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={scadute > 0 ? { color: "var(--red)" } : undefined}>
              {scadute}
            </div>
            <div className="kpi-etichetta">Azioni scadute</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{nAnalisi30}</div>
            <div className="kpi-etichetta">Analisi negli ultimi 30 gg</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{campagneAttive}</div>
            <div className="kpi-etichetta">Campagne attive</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(spesa7)}</div>
            <div className="kpi-etichetta">Spesa ADV ultimi 7 gg</div>
          </div>
        </div>

        <div className="kpi-riga">
          {[
            ["totale", "ROS Deluxy (totale)"],
            ["gifts", "ROS Deluxy.it"],
            ["flowers", "ROS Flowers"],
            ["cake", "ROS Cake"],
          ].map(([scope, etichetta]) => {
            const r = rosPerScope[scope];
            return (
              <a className="kpi" key={scope} href={`/mkt?scope=${scope}`}>
                <div className="kpi-valore" style={r?.ros != null ? { color: r.ros >= 5 ? "var(--green)" : r.ros >= 3 ? "var(--text)" : "var(--red)" } : undefined}>
                  {r?.ros != null ? `${r.ros.toFixed(1)}×` : "—"}
                </div>
                <div className="kpi-etichetta">
                  {etichetta}
                  {r?.delta != null && (
                    <span style={{ color: r.delta >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                      {" "}· {r.delta >= 0 ? "+" : ""}{(r.delta * 100).toFixed(0)}% vs 2025
                    </span>
                  )}
                </div>
              </a>
            );
          })}
        </div>

        {(alertAperti.length > 0 || fatteNonVerificate.length > 0) && (
          <section className="scheda">
            <div className="scheda-titolo">Guardrail — cose che chiedono attenzione</div>
            {alertAperti.map((a) => (
              <div key={a.id} className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 5 }}>
                <b style={{ color: a.livello === "rosso" ? "var(--red)" : a.livello === "arancio" ? "var(--orange)" : "var(--gold-strong)" }}>{a.tipo}</b>{" "}
                <a href={`/campagne/${a.campagna.id}`} style={{ color: "var(--blue)" }}>{a.campagna.nome}</a>: {a.messaggio}
              </div>
            ))}
            {fatteNonVerificate.length > 0 && (
              <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>
                <b>Fatte ma non verificate</b> (completamento ≠ efficacia):{" "}
                {fatteNonVerificate.map((f, i) => (
                  <span key={f.id}>{i > 0 ? " · " : ""}<a href={`/azioni/${f.id}`} style={{ color: "var(--blue)" }}>{f.titolo}</a></span>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="due-colonne">
          <section className="scheda">
            <div className="scheda-titolo">Azioni in cima alla lista</div>
            {azioniUrgenti.length === 0 ? (
              <div className="vuoto-mini">Nessuna azione aperta: deposita un&apos;analisi o creane una.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Azione</th>
                      <th>Brand</th>
                      <th>Stato</th>
                      <th>Scadenza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {azioniUrgenti.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <a href={`/azioni/${a.id}`}>
                            <div className="cella-nome">{a.titolo}</div>
                            {(a.analisi || a.campagna) && (
                              <div className="cella-sub">
                                {a.analisi ? `Da analisi: ${a.analisi.titolo}` : `Campagna: ${a.campagna?.nome}`}
                              </div>
                            )}
                          </a>
                        </td>
                        <td>
                          <Badge testo={ETICHETTA_BRAND[a.brand] ?? a.brand} colore={COLORE_BRAND[a.brand] ?? "var(--text-tertiary)"} />
                        </td>
                        <td>
                          <Badge testo={ETICHETTA_STATO_AZIONE[a.stato] ?? a.stato} colore={COLORE_STATO_AZIONE[a.stato] ?? "var(--text-tertiary)"} />
                        </td>
                        <td>
                          <Scadenza data={a.scadenza} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div>
            <section className="scheda">
              <div className="scheda-titolo">Spesa ADV — ultimi 14 giorni</div>
              <GraficoSpesa punti={puntiSpesa} />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Ultime analisi</div>
              {ultimeAnalisi.length === 0 ? (
                <div className="vuoto-mini">Ancora nessuna analisi depositata</div>
              ) : (
                <ul className="storia">
                  {ultimeAnalisi.map((an) => (
                    <li key={an.id}>
                      <span className="storia-data">{formattaData(an.dataAnalisi)}</span>
                      <span className="storia-testo">
                        <a href={`/analisi/${an.id}`} className="cella-nome">{an.titolo}</a>
                        <span className="cella-sub">
                          {ETICHETTA_TIPO_ANALISI[an.tipo] ?? an.tipo} · {ETICHETTA_BRAND[an.brand] ?? an.brand}
                        </span>
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
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
