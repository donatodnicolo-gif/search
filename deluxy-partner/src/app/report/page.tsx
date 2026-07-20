import { prisma } from "@/lib/db";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro } from "@/lib/format";
import { MESI } from "@/lib/calc";

export const dynamic = "force-dynamic";

function aggrega<T>(items: T[], key: (t: T) => string, val: (t: T) => number) {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || "—";
    map.set(k, (map.get(k) ?? 0) + val(it));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

// Quota percentuale sul totale (una cifra decimale sotto il 10%, intera sopra).
function quota(v: number, totale: number): string {
  if (!totale) return "—";
  const p = (v / totale) * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

// Variazione % rispetto a un valore di riferimento (col segno).
function variazione(v: number, base: number): string {
  if (!base) return v ? "n.d." : "—";
  const p = ((v - base) / base) * 100;
  return `${p > 0 ? "+" : ""}${Math.round(p)}%`;
}

// Riga di tabella "chiave · valore · quota %", con barra di quota.
function RigaQuota({ k, v, totale }: { k: string; v: number; totale: number }) {
  const p = totale ? (v / totale) * 100 : 0;
  return (
    <tr>
      <td>{k}</td>
      <td className="num">{euro(v)}</td>
      <td className="num" style={{ width: 110 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <span className="quota-barra" aria-hidden>
            <span style={{ width: `${Math.min(p, 100)}%` }} />
          </span>
          <span style={{ minWidth: 42, display: "inline-block" }}>{quota(v, totale)}</span>
        </span>
      </td>
    </tr>
  );
}

export default async function ReportPage() {
  const anno = ANNO_CORRENTE;
  const tutti = await riepilogoTutti(anno);
  const forecast = await prisma.forecast.findMany({ where: { anno } });

  // Per tipologia di servizio (fatture) — le aree del "Piano Per Area"
  const fatture = tutti.flatMap((t) => t.fatture);
  const perTipologia = aggrega(fatture, (f) => f.tipologia.nome, (f) => f.imponibile);

  // Vendite/servizi per città e categoria
  const perCitta = aggrega(tutti, (t) => t.partner.citta ?? "—", (t) => t.rolling.vendite + t.rolling.fatture);
  const perCategoria = aggrega(tutti, (t) => t.partner.categoria?.trim() ?? "—", (t) => t.rolling.vendite + t.rolling.fatture);

  // Andamento mensile complessivo
  const perMese = Array.from({ length: 12 }, (_, i) => {
    const mese = i + 1;
    let vendite = 0, servizi = 0, commissioni = 0;
    for (const t of tutti) {
      const m = t.mesi[i].riepilogo;
      vendite += m.vendite; servizi += m.serviziNetto; commissioni += m.commissioni;
    }
    return { mese, vendite, servizi, commissioni };
  });
  const maxMese = Math.max(...perMese.map((m) => m.vendite + m.servizi), 1);
  const totAnno = perMese.reduce((a, m) => a + m.vendite + m.servizi, 0);

  // Totali di riferimento per le quote percentuali
  const totTipologia = perTipologia.reduce((a, [, v]) => a + v, 0);
  const totCitta = perCitta.reduce((a, [, v]) => a + v, 0);
  const totCategoria = perCategoria.reduce((a, [, v]) => a + v, 0);
  const totComplessivo = tutti.reduce((a, t) => a + t.rolling.vendite + t.rolling.fatture, 0);

  // Forecast vs actual (dal piano commerciale). `precYtd` somma l'anno
  // precedente SOLO fino all'ultimo mese con dati actual, così il confronto
  // "vs anno precedente" mette a paragone periodi omogenei (non YTD vs anno intero).
  const ultimoMeseActual = forecast.reduce((m, f) => ((f.actual ?? 0) > 0 ? Math.max(m, f.mese) : m), 0);
  const fcPerCliente = new Map<string, { forecast: number; actual: number; prec: number; precYtd: number }>();
  for (const f of forecast) {
    const cur = fcPerCliente.get(f.partnerNome) ?? { forecast: 0, actual: 0, prec: 0, precYtd: 0 };
    cur.forecast += f.forecast ?? 0;
    cur.actual += f.actual ?? 0;
    cur.prec += f.valPrecedente ?? 0;
    if (f.mese <= ultimoMeseActual) cur.precYtd += f.valPrecedente ?? 0;
    fcPerCliente.set(f.partnerNome, cur);
  }
  const fcRighe = [...fcPerCliente.entries()]
    .filter(([, v]) => v.forecast || v.actual || v.prec)
    .sort((a, b) => b[1].forecast - a[1].forecast);
  const totFc = fcRighe.reduce((a, [, v]) => a + v.forecast, 0);
  const totAct = fcRighe.reduce((a, [, v]) => a + v.actual, 0);
  const totPrec = fcRighe.reduce((a, [, v]) => a + v.prec, 0);
  const totPrecYtd = fcRighe.reduce((a, [, v]) => a + v.precYtd, 0);

  // Top partner per valore complessivo
  const top = [...tutti]
    .sort((a, b) => (b.rolling.vendite + b.rolling.fatture) - (a.rolling.vendite + a.rolling.fatture))
    .slice(0, 15);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Report</h1>
          <p className="page-caption">
            Andamento {anno}: per tipologia, città e categoria, con forecast del piano commerciale.
          </p>
        </div>
      </div>

      <h2 className="section-title">Andamento mensile (vendite + servizi)</h2>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mese</th><th style={{ width: "36%" }}></th>
                <th className="num">Vendite</th><th className="num">Servizi</th>
                <th className="num">Commissioni</th><th className="num">% anno</th>
              </tr>
            </thead>
            <tbody>
              {perMese.map((m) => (
                <tr key={m.mese}>
                  <td>{MESI[m.mese - 1]}</td>
                  <td>
                    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--fill)" }}>
                      <div style={{ width: `${(m.vendite / maxMese) * 100}%`, background: "var(--gold)" }} />
                      <div style={{ width: `${(m.servizi / maxMese) * 100}%`, background: "var(--ink)" }} />
                    </div>
                  </td>
                  <td className="num">{euro(m.vendite)}</td>
                  <td className="num">{euro(m.servizi)}</td>
                  <td className="num pos">{euro(m.commissioni)}</td>
                  <td className="num muted">{quota(m.vendite + m.servizi, totAnno)}</td>
                </tr>
              ))}
              <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                <td>Totale</td><td></td>
                <td className="num">{euro(perMese.reduce((a, m) => a + m.vendite, 0))}</td>
                <td className="num">{euro(perMese.reduce((a, m) => a + m.servizi, 0))}</td>
                <td className="num pos">{euro(perMese.reduce((a, m) => a + m.commissioni, 0))}</td>
                <td className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Barra oro = vendite come vendor · barra nera = servizi a fatturazione (netto IVA).
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 28 }}>
        <div>
          <h2 className="section-title" style={{ marginTop: 0 }}>Servizi per tipologia</h2>
          <div className="card tight">
            <table>
              <thead><tr><th>Tipologia (Piano per Area)</th><th className="num">Fatturato netto</th><th className="num">%</th></tr></thead>
              <tbody>
                {perTipologia.map(([k, v]) => (
                  <RigaQuota key={k} k={k} v={v} totale={totTipologia} />
                ))}
                <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                  <td>Totale</td><td className="num">{euro(totTipologia)}</td><td className="num">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="section-title" style={{ marginTop: 0 }}>Valore per città</h2>
          <div className="card tight">
            <table>
              <thead><tr><th>Città</th><th className="num">Vendite + servizi</th><th className="num">%</th></tr></thead>
              <tbody>
                {perCitta.slice(0, 10).map(([k, v]) => (
                  <RigaQuota key={k} k={k} v={v} totale={totCitta} />
                ))}
                {perCitta.length > 10 && (
                  <tr className="muted">
                    <td>Altre {perCitta.length - 10} città</td>
                    <td className="num">{euro(perCitta.slice(10).reduce((a, [, v]) => a + v, 0))}</td>
                    <td className="num">{quota(perCitta.slice(10).reduce((a, [, v]) => a + v, 0), totCitta)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="section-title" style={{ marginTop: 0 }}>Valore per categoria</h2>
          <div className="card tight">
            <table>
              <thead><tr><th>Categoria</th><th className="num">Vendite + servizi</th><th className="num">%</th></tr></thead>
              <tbody>
                {perCategoria.slice(0, 10).map(([k, v]) => (
                  <RigaQuota key={k} k={k} v={v} totale={totCategoria} />
                ))}
                {perCategoria.length > 10 && (
                  <tr className="muted">
                    <td>Altre {perCategoria.length - 10} categorie</td>
                    <td className="num">{euro(perCategoria.slice(10).reduce((a, [, v]) => a + v, 0))}</td>
                    <td className="num">{quota(perCategoria.slice(10).reduce((a, [, v]) => a + v, 0), totCategoria)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h2 className="section-title">Top partner {anno}</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Partner</th>
                <th className="num">Vendite</th>
                <th className="num">Servizi</th>
                <th className="num">Commissioni</th>
                <th className="num">Stima chiusura</th>
                <th className="num">% sul totale</th>
                <th className="num">% cumulata</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let cumulato = 0;
                return top.map((t) => {
                  const valore = t.rolling.vendite + t.rolling.fatture;
                  cumulato += valore;
                  return (
                    <tr key={t.partner.id}>
                      <td style={{ fontWeight: 500 }}>{t.partner.nome}</td>
                      <td className="num">{euro(t.rolling.vendite)}</td>
                      <td className="num">{euro(t.rolling.fatture)}</td>
                      <td className="num pos">{euro(t.rolling.commissioni)}</td>
                      <td className="num">{euro(t.rolling.stimaChiusura)}</td>
                      <td className="num">{quota(valore, totComplessivo)}</td>
                      <td className="num muted">{quota(cumulato, totComplessivo)}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Forecast {anno} vs actual (piano commerciale)</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num">Consuntivo {anno - 1}</th>
                <th className="num">Actual {anno}</th>
                <th className="num">Forecast {anno}</th>
                <th className="num">Avanzamento</th>
                <th className="num">vs {anno - 1} (stesso periodo)</th>
                <th className="num">% sul forecast</th>
              </tr>
            </thead>
            <tbody>
              {fcRighe.map(([nome, v]) => {
                const avanz = v.forecast ? Math.round((v.actual / v.forecast) * 100) : null;
                const cresc = variazione(v.actual, v.precYtd);
                return (
                  <tr key={nome}>
                    <td>{nome}</td>
                    <td className="num muted">{euro(v.prec)}</td>
                    <td className="num">{euro(v.actual)}</td>
                    <td className="num">{euro(v.forecast)}</td>
                    <td className={`num ${avanz != null && avanz >= 100 ? "pos" : ""}`}>
                      {avanz != null ? `${avanz}%` : "—"}
                    </td>
                    <td className={`num ${cresc.startsWith("+") ? "pos" : cresc.startsWith("-") ? "neg" : "muted"}`}>
                      {cresc}
                    </td>
                    <td className="num muted">{quota(v.forecast, totFc)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                <td>Totale</td>
                <td className="num">{euro(totPrec)}</td>
                <td className="num">{euro(totAct)}</td>
                <td className="num">{euro(totFc)}</td>
                <td className="num">{totFc ? `${Math.round((totAct / totFc) * 100)}%` : "—"}</td>
                <td className="num">{variazione(totAct, totPrecYtd)}</td>
                <td className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10, padding: "0 16px 4px" }}>
          <strong>Avanzamento</strong> = actual sul forecast dell&apos;intero anno · <strong>vs {anno - 1}</strong> =
          crescita dell&apos;actual confrontata con lo <em>stesso periodo</em> dell&apos;anno precedente
          {ultimoMeseActual ? ` (gennaio–${MESI[ultimoMeseActual - 1].toLowerCase()})` : ""} ·{" "}
          <strong>% sul forecast</strong> = peso del cliente sul forecast totale. La colonna
          &laquo;Consuntivo {anno - 1}&raquo; resta l&apos;anno intero.
        </p>
      </div>
    </>
  );
}
