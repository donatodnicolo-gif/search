import { Badge } from "@/components/Badge";
import { BottoneSync } from "@/components/BottoneSync";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { Scadenza } from "@/components/Scadenza";
import { ScelteBrand } from "@/components/ScelteBrand";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { PRESET_PERIODO, risolviPeriodo, variazione } from "@/lib/periodo";
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

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; da?: string; a?: string }>;
}) {
  const p = await searchParams;
  const periodo = risolviPeriodo(p.preset ?? "30g", p.da, p.a);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  // I giorni del grafico e delle somme seguono il periodo scelto; le azioni
  // aperte no: quelle sono uno stato di adesso, non un intervallo.
  const giorniPeriodo = Math.max(
    1,
    Math.round((periodo.corrente.a.getTime() - periodo.corrente.da.getTime()) / 86_400_000)
  );

  const [aperte, scadute, nAnalisi30, campagneAttive, azioniUrgenti, ultimeAnalisi, metriche14, alertAperti, fatteNonVerificate] =
    await Promise.all([
      prisma.azione.count({ where: { stato: { in: STATI_AZIONE_APERTI } } }),
      prisma.azione.count({
        where: { stato: { in: STATI_AZIONE_APERTI }, scadenza: { lt: oggi } },
      }),
      prisma.analisi.count({ where: { dataAnalisi: { gte: periodo.corrente.da, lt: periodo.corrente.a } } }),
      prisma.campagna.count({ where: { stato: { in: ["attiva", "in_apprendimento"] } } }),
      prisma.azione.findMany({
        where: { stato: { in: STATI_AZIONE_APERTI } },
        orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
        take: 10,
        include: { analisi: { select: { titolo: true } }, campagna: { select: { nome: true } } },
      }),
      prisma.analisi.findMany({ orderBy: { dataAnalisi: "desc" }, take: 6 }),
      prisma.metricaCampagna.findMany({
        where: { data: { gte: periodo.corrente.da, lt: periodo.corrente.a } },
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

  // Spesa aggregata per giorno sul periodo scelto
  const perGiorno = new Map<string, number>();
  for (let i = 0; i < giorniPeriodo; i++) {
    const d = new Date(periodo.corrente.da.getTime() + i * 86_400_000);
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
  const spesaPeriodo = puntiSpesa.reduce((s, p) => s + p.valore, 0);

  // Vendite, ordini e spesa del periodo precedente: i numeri da soli non dicono
  // se si sta migliorando. Gli ordini annullati e rimborsati restano fuori —
  // sono soldi che non sono mai entrati o che sono tornati indietro.
  const fuori = { notIn: ["annullato", "rimborsato"] };
  const [venditeOra, venditePrima, spesaPrimaAgg] = await Promise.all([
    prisma.ordine.aggregate({
      where: { data: { gte: periodo.corrente.da, lt: periodo.corrente.a }, stato: fuori },
      _sum: { totale: true },
      _count: { _all: true },
    }),
    prisma.ordine.aggregate({
      where: { data: { gte: periodo.precedente.da, lt: periodo.precedente.a }, stato: fuori },
      _sum: { totale: true },
      _count: { _all: true },
    }),
    prisma.metricaCampagna.aggregate({
      where: { data: { gte: periodo.precedente.da, lt: periodo.precedente.a } },
      _sum: { spesa: true },
    }),
  ]);
  const vendite = venditeOra._sum.totale ?? 0;
  const venditePrec = venditePrima._sum.totale ?? 0;
  const spesaPrec = spesaPrimaAgg._sum.spesa ?? 0;
  // Quali canali hanno davvero mandato spesa nel periodo: se ne manca uno, il
  // ROS è ottimistico perché divide tutte le vendite per una spesa parziale.
  const spesaPerCanale = await prisma.metricaCampagna.groupBy({
    by: ["campagnaId"],
    where: { data: { gte: periodo.corrente.da, lt: periodo.corrente.a }, spesa: { gt: 0 } },
    _sum: { spesa: true },
  });
  const campagneConSpesa = await prisma.campagna.findMany({
    where: { id: { in: spesaPerCanale.map((x) => x.campagnaId) } },
    select: { id: true, canale: true },
  });
  const canali = new Set(campagneConSpesa.map((c) => c.canale));
  const canaliMuti = ["google_ads", "meta_ads"].filter((c) => !canali.has(c));

  const ros = spesaPeriodo > 0 ? vendite / spesaPeriodo : null;
  const rosPrec = spesaPrec > 0 ? venditePrec / spesaPrec : null;

  // Link che cambia il periodo tenendo il resto della querystring
  const linkPeriodo = (chiave: string) => {
    const q = new URLSearchParams();
    if (chiave !== "libero") q.set("preset", chiave);
    else {
      if (p.da) q.set("da", p.da);
      if (p.a) q.set("a", p.a);
    }
    return `/?${q.toString()}`;
  };
  const delta = (ora: number, prima: number) => {
    const v = variazione(ora, prima); // è già in percentuale
    if (v == null) return null;
    return { testo: `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`, colore: v >= 0 ? "var(--green)" : "var(--red)" };
  };

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

        <ScelteBrand />

        {/* Il periodo comanda tutto quello che è una somma: spesa, vendite,
            analisi e grafico. Le azioni aperte restano quelle di adesso. */}
        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 12 }}>
            {PRESET_PERIODO.filter((x) => x.chiave !== "libero").map((x) => (
              <a
                key={x.chiave}
                className={`pill-opt${periodo.preset === x.chiave ? " attuale" : ""}`}
                href={linkPeriodo(x.chiave)}
              >
                {x.nome}
              </a>
            ))}
          </div>
          <form className="filtri" method="get" action="/" style={{ marginBottom: 0 }}>
            <input type="date" name="da" defaultValue={p.da ?? ""} title="Dal" />
            <input type="date" name="a" defaultValue={p.a ?? ""} title="Al (compreso)" />
            <button className="btn small" type="submit">Vai</button>
            <span className="cella-sub" style={{ alignSelf: "center" }}>
              Stai guardando: <b>{periodo.corrente.etichetta}</b> ({giorniPeriodo} giorni)
            </span>
          </form>
        </section>

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
            <div className="kpi-etichetta">Analisi nel periodo</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{campagneAttive}</div>
            <div className="kpi-etichetta">Campagne attive</div>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(spesaPeriodo)}</div>
            <div className="kpi-etichetta">
              Spesa ADV nel periodo
              {delta(spesaPeriodo, spesaPrec) && (
                <span style={{ color: delta(spesaPeriodo, spesaPrec)!.colore, fontWeight: 600 }}>
                  {" "}· {delta(spesaPeriodo, spesaPrec)!.testo} sul periodo prima
                </span>
              )}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(vendite)}</div>
            <div className="kpi-etichetta">
              Vendite nel periodo
              {delta(vendite, venditePrec) && (
                <span style={{ color: delta(vendite, venditePrec)!.colore, fontWeight: 600 }}>
                  {" "}· {delta(vendite, venditePrec)!.testo}
                </span>
              )}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={ros != null ? { color: ros >= 5 ? "var(--green)" : ros >= 3 ? "var(--text)" : "var(--red)" } : undefined}>
              {ros != null ? `${ros.toFixed(1)}×` : "—"}
            </div>
            <div className="kpi-etichetta">
              {canaliMuti.length > 0 ? "ROS parziale: manca " + canaliMuti.map((c) => (c === "meta_ads" ? "Meta" : "Google")).join(" e ") : "ROS del periodo (vendite ÷ spesa ADV)"}
              {rosPrec != null && ros != null && delta(ros, rosPrec) && (
                <span style={{ color: delta(ros, rosPrec)!.colore, fontWeight: 600 }}>
                  {" "}· {delta(ros, rosPrec)!.testo}
                </span>
              )}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{venditeOra._count._all}</div>
            <div className="kpi-etichetta">
              Ordini nel periodo
              {delta(venditeOra._count._all, venditePrima._count._all) && (
                <span style={{ color: delta(venditeOra._count._all, venditePrima._count._all)!.colore, fontWeight: 600 }}>
                  {" "}· {delta(venditeOra._count._all, venditePrima._count._all)!.testo}
                </span>
              )}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {vendite > 0 && venditeOra._count._all > 0 ? formattaEuro(vendite / venditeOra._count._all) : "—"}
            </div>
            <div className="kpi-etichetta">Scontrino medio</div>
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
              <div className="scheda-titolo">Spesa ADV — {periodo.corrente.etichetta.toLowerCase()}</div>
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
