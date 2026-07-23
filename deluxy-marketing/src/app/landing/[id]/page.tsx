import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { aggiungiMetricaLanding, cambiaStatoLanding } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  COLORE_BRAND,
  COLORE_STATO_CAMPAGNA,
  COLORE_STATO_LANDING,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_STATO_CAMPAGNA,
  ETICHETTA_STATO_LANDING,
  formattaData,
  formattaEuro,
  formattaNumero,
  STATI_LANDING,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function SchedaLanding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const landing = await prisma.landingPage.findUnique({
    where: { id },
    include: {
      campagne: true,
      metriche: { orderBy: { periodo: "desc" } },
    },
  });
  if (!landing) notFound();

  return (
    <div className="layout">
      <Sidebar attiva="landing" />
      <main className="main">
        <a className="ritorno" href="/landing">← Landing page</a>
        <div className="page-head">
          <div>
            <h1 className="page-title" style={{ overflowWrap: "anywhere", fontSize: 24 }}>{landing.url}</h1>
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge testo={ETICHETTA_BRAND[landing.brand] ?? landing.brand} colore={COLORE_BRAND[landing.brand] ?? "var(--text-tertiary)"} />
              {landing.lingua && <span style={{ textTransform: "uppercase" }}>{landing.lingua}</span>}
              {landing.tipo && <span>{landing.tipo}</span>}
              {landing.scopo && <span>{landing.scopo}</span>}
            </p>
          </div>
          <a className="btn btn-secondario" href={`https://${landing.url.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer">
            Apri la pagina
          </a>
        </div>

        <section className="scheda">
          <div className="scheda-titolo">Stato</div>
          <form className="pill-scelta" action={cambiaStatoLanding}>
            <input type="hidden" name="id" value={landing.id} />
            {STATI_LANDING.map((s) => (
              <button
                key={s}
                className={`pill-opt${landing.stato === s ? " attuale" : ""}`}
                style={{ color: landing.stato === s ? undefined : COLORE_STATO_LANDING[s] }}
                type="submit"
                name="stato"
                value={s}
                disabled={landing.stato === s}
              >
                <span className="dot" />
                <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_LANDING[s]}</span>
              </button>
            ))}
          </form>
          {landing.note && <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>{landing.note}</p>}
          {landing.gemellaUrl && (
            <p className="cella-sub" style={{ marginTop: 6 }}>
              Versione gemella: {landing.gemellaUrl}
            </p>
          )}
          <p className="cella-sub" style={{ marginTop: 6 }}>
            Ultima verifica: {formattaData(landing.verificataIl)}
            {landing.scorecard != null && ` · scorecard ${landing.scorecard}/100`}
          </p>
        </section>

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">Campagne che atterrano qui ({landing.campagne.length})</div>
              {landing.campagne.length === 0 ? (
                <div className="vuoto-mini">Nessuna campagna collegata (si collega dalla scheda campagna)</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Campagna</th>
                        <th>Canale</th>
                        <th>Stato</th>
                        <th className="num">Budget/g</th>
                      </tr>
                    </thead>
                    <tbody>
                      {landing.campagne.map((c) => (
                        <tr key={c.id}>
                          <td><a href={`/campagne/${c.id}`} className="cella-nome">{c.nome}</a></td>
                          <td className="cella-muta">{ETICHETTA_CANALE[c.canale] ?? c.canale}</td>
                          <td>
                            <Badge testo={ETICHETTA_STATO_CAMPAGNA[c.stato] ?? c.stato} colore={COLORE_STATO_CAMPAGNA[c.stato] ?? "var(--text-tertiary)"} />
                          </td>
                          <td className="num">{formattaEuro(c.budgetGiornaliero)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Performance registrate</div>
              {landing.metriche.length === 0 ? (
                <div className="vuoto-mini">Nessuna metrica: aggiungila qui accanto o via API (dalle revisioni landing).</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Periodo</th>
                        <th>Canale</th>
                        <th className="num">Clic</th>
                        <th className="num">Costo</th>
                        <th className="num">Sessioni</th>
                        <th className="num">Conv.</th>
                        <th className="num">Ricavi</th>
                        <th className="num">CR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {landing.metriche.map((m) => (
                        <tr key={m.id}>
                          <td className="cella-nome">{m.periodo}</td>
                          <td className="cella-muta">{m.canale ?? "—"}</td>
                          <td className="num">{formattaNumero(m.clic)}</td>
                          <td className="num">{formattaEuro(m.costo)}</td>
                          <td className="num">{formattaNumero(m.sessioni)}</td>
                          <td className="num">{formattaNumero(m.conversioni)}</td>
                          <td className="num">{formattaEuro(m.ricavi)}</td>
                          <td className="num">
                            {m.tassoConversione != null ? `${(m.tassoConversione * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="scheda">
            <div className="scheda-titolo">Aggiungi performance</div>
            <form className="modulo" action={aggiungiMetricaLanding} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <input type="hidden" name="landingId" value={landing.id} />
              <div className="campo-modulo">
                <label>Periodo <span className="obbligatorio">*</span></label>
                <input name="periodo" required placeholder="2026-07 o 2026-W30" />
              </div>
              <div className="campo-modulo">
                <label>Canale</label>
                <select name="canale" defaultValue="totale">
                  <option value="totale">Totale</option>
                  <option value="google_ads">Google Ads</option>
                  <option value="meta_ads">Meta Ads</option>
                  <option value="organico">Organico</option>
                </select>
              </div>
              <div className="campo-modulo">
                <label>Clic</label>
                <input name="clic" type="number" min="0" />
              </div>
              <div className="campo-modulo">
                <label>Costo (€)</label>
                <input name="costo" type="number" step="0.01" min="0" />
              </div>
              <div className="campo-modulo">
                <label>Sessioni</label>
                <input name="sessioni" type="number" min="0" />
              </div>
              <div className="campo-modulo">
                <label>Conversioni</label>
                <input name="conversioni" type="number" step="0.01" min="0" />
              </div>
              <div className="campo-modulo">
                <label>Ricavi (€)</label>
                <input name="ricavi" type="number" step="0.01" min="0" />
              </div>
              <div className="campo-modulo">
                <label>CR (es. 0.045)</label>
                <input name="tassoConversione" type="number" step="0.001" min="0" max="1" />
              </div>
              <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                <button className="btn small" type="submit">Salva</button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
