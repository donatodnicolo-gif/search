import { Sidebar } from "@/components/Sidebar";
import { leggiPerformance } from "@/lib/ai-analisi";
import { BRANDS, ETICHETTA_BRAND, formattaEuro } from "@/lib/dominio";
import { PRESET_PERIODO } from "@/lib/periodo";
import { periodoApp } from "@/lib/periodo-condiviso";

export const dynamic = "force-dynamic";

const COLORE_TIPO: Record<string, string> = {
  cosa_va: "var(--green)",
  cosa_non_va: "var(--red)",
  rischio: "var(--orange)",
  da_capire: "var(--blue)",
};
const ETICHETTA_TIPO: Record<string, string> = {
  cosa_va: "Va bene",
  cosa_non_va: "Non va",
  rischio: "Rischio",
  da_capire: "Da capire",
};
const COLORE_PRIORITA: Record<string, string> = {
  P0: "var(--red)",
  P1: "var(--orange)",
  P2: "var(--text-tertiary)",
};

// Lettura AI delle performance. L'analisi parte solo quando la chiedi: niente
// chiamate automatiche a ogni visita (costano e non servono).
export default async function PaginaAI({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; preset?: string; da?: string; a?: string; leggi?: string }>;
}) {
  const p = await searchParams;
  const brand = p.brand && (BRANDS as readonly string[]).includes(p.brand) ? p.brand : null;
  const periodo = await periodoApp(p, "30g");
  const chiesta = p.leggi === "1";

  const esito = chiesta ? await leggiPerformance(brand, p.preset ?? "30g", p.da, p.a) : null;

  const link = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (brand) q.set("brand", brand);
    if (periodo.preset !== "libero") q.set("preset", periodo.preset);
    if (p.da) q.set("da", p.da);
    if (p.a) q.set("a", p.a);
    for (const [k, v] of Object.entries(extra)) v ? q.set(k, v) : q.delete(k);
    return `/ai?${q.toString()}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="ai" brandAttivo={brand ?? undefined} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Lettura AI delle performance</h1>
            <p className="page-sub">
              L&apos;AI riceve i numeri già calcolati dall&apos;app — spesa, vendite Shopify, MER,
              break-even del brand, alert e incidenti aperti — e dice cosa significano. Non calcola
              nulla e <b>non esegue nulla</b>: le azioni che propone passano dalla coda di{" "}
              <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a> con approvazione
              manuale, come qualsiasi altra modifica.
            </p>
          </div>
        </div>

        {/* Scelta di cosa leggere */}
        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 10 }}>
            <a className={`pill-opt${brand === null ? " attuale" : ""}`} href={link({ brand: "" })}>
              Tutti i brand
            </a>
            {BRANDS.map((b) => (
              <a key={b} className={`pill-opt${brand === b ? " attuale" : ""}`} href={link({ brand: b })}>
                {ETICHETTA_BRAND[b]}
              </a>
            ))}
          </div>
          <div className="pill-scelta" style={{ marginBottom: 12 }}>
            {PRESET_PERIODO.filter((x) => x.chiave !== "libero").map((x) => (
              <a key={x.chiave} className={`pill-opt${periodo.preset === x.chiave ? " attuale" : ""}`} href={link({ preset: x.chiave, da: "", a: "" })}>
                {x.nome}
              </a>
            ))}
          </div>
          <form className="filtri" method="get" action="/ai" style={{ marginBottom: 0 }}>
            {brand && <input type="hidden" name="brand" value={brand} />}
            <input type="date" name="da" defaultValue={p.da ?? ""} title="Dal" />
            <input type="date" name="a" defaultValue={p.a ?? ""} title="Al (compreso)" />
            <input type="hidden" name="leggi" value="1" />
            <button className="btn" type="submit">Leggi il periodo</button>
          </form>
        </section>

        {!chiesta && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              Scegli brand e periodo, poi <b>Leggi il periodo</b>. Ogni lettura è una chiamata al
              modello: parte solo quando la chiedi, non a ogni visita.
            </span>
          </div>
        )}

        {esito && !esito.ok && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
            <span>
              <b>Lettura non possibile:</b> {esito.errore}
            </span>
          </div>
        )}

        {/* I numeri dati in pasto al modello: trasparenza sulla fonte */}
        {esito?.dati && (
          <div className="kpi-riga">
            <div className="kpi">
              <div className="kpi-valore">{formattaEuro(esito.dati.totali.spesa)}</div>
              <div className="kpi-etichetta">Spesa nel periodo · {esito.dati.periodo.etichetta}</div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">
                {esito.dati.totali.ordini > 0 ? formattaEuro(esito.dati.totali.venditeShopify) : "—"}
              </div>
              <div className="kpi-etichetta">
                Vendite Shopify{esito.dati.totali.ordini > 0 ? ` · ${esito.dati.totali.ordini} ordini` : " (serve un brand)"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">{esito.dati.totali.mer != null ? `${esito.dati.totali.mer}×` : "—"}</div>
              <div className="kpi-etichetta">
                MER{esito.dati.breakEven ? ` · break-even ${esito.dati.breakEven}×` : ""}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">{esito.dati.campagne.length}</div>
              <div className="kpi-etichetta">
                Campagne con dati
                {esito.dati.giorniSenzaDati > 1 ? ` · dati fermi da ${esito.dati.giorniSenzaDati} giorni` : ""}
              </div>
            </div>
          </div>
        )}

        {esito?.ok && (
          <>
            <section className="scheda">
              <div className="scheda-titolo">La sintesi</div>
              <p style={{ fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{esito.lettura.sintesi}</p>
              <p className="cella-sub" style={{ marginTop: 12 }}>
                Modello {esito.modello} · periodo {esito.dati.periodo.dal} → {esito.dati.periodo.al}
                {brand ? ` · ${ETICHETTA_BRAND[brand]}` : " · tutti i brand"}
              </p>
            </section>

            {esito.lettura.osservazioni.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Cosa dicono i numeri ({esito.lettura.osservazioni.length})</div>
                <ul className="storia">
                  {esito.lettura.osservazioni.map((o, i) => (
                    <li key={i}>
                      <span className="storia-autore" style={{ color: COLORE_TIPO[o.tipo] ?? "var(--text-tertiary)", fontWeight: 600, fontSize: 11.5 }}>
                        {ETICHETTA_TIPO[o.tipo] ?? o.tipo}
                      </span>
                      <span className="storia-testo">
                        <b className="cella-nome">{o.titolo}</b>
                        <span className="cella-sub" style={{ whiteSpace: "normal" }}>{o.spiegazione}</span>
                        {o.numeri && (
                          <span className="cella-sub" style={{ whiteSpace: "normal", color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                            {o.numeri}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {esito.lettura.azioni.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Azioni proposte ({esito.lettura.azioni.length})</div>
                <p className="cella-sub" style={{ marginBottom: 12 }}>
                  Sono <b>proposte</b>, non decisioni: nessuna è stata eseguita. Per metterne una in
                  atto passa dalla scheda della campagna, dove il guardrail controlla blackout,
                  finestra, rollback e freeze prima di accodarla.
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Azione</th>
                        <th>Campagna</th>
                        <th>Livello</th>
                        <th>Priorità</th>
                      </tr>
                    </thead>
                    <tbody>
                      {esito.lettura.azioni.map((a, i) => (
                        <tr key={i}>
                          <td style={{ maxWidth: 380 }}>
                            <div className="cella-nome">{a.titolo}</div>
                            <div className="cella-sub" style={{ whiteSpace: "normal" }}>{a.perche}</div>
                          </td>
                          <td className="cella-muta">{a.campagna ?? "—"}</td>
                          <td>
                            <span className="tag-neutro">{a.livello}</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, fontSize: 12, color: COLORE_PRIORITA[a.priorita] }}>
                              {a.priorita}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {esito.lettura.domandeAperte.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Cosa questi dati non dicono</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                  {esito.lettura.domandeAperte.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
