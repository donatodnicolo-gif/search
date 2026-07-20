import Link from "next/link";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { nomeMese, MESI } from "@/lib/calc";
import { upsertSaldo } from "@/lib/actions";

export const dynamic = "force-dynamic";

// Riconciliazione mensile: per ogni partner del mese, saldo in compensazione,
// bonifico registrato e chiusura. Sostituisce i blocchi "Extra" + "Saldi" del foglio.
export default async function SaldiPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; mese?: string; q?: string; solo?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? parseInt(sp.anno) : ANNO_CORRENTE;
  const mese = sp.mese ? parseInt(sp.mese) : new Date().getMonth() + 1;

  const tutti = await riepilogoTutti(anno);
  const righe = tutti
    .map((t) => {
      const m = t.mesi.find((x) => x.mese === mese)!;
      return { partner: t.partner, saldo: m.saldo, r: m.riepilogo };
    })
    .filter((x) => {
      const has = x.r.vendite || x.r.serviziNetto || x.r.bonifico || x.saldo;
      if (!has) return false;
      if (sp.q && !x.partner.nome.toLowerCase().includes(sp.q.toLowerCase())) return false;
      if (sp.solo === "aperti" && x.r.pareggiato) return false;
      return true;
    })
    .sort((a, b) => Math.max(b.r.daBonificare, b.r.daIncassare) - Math.max(a.r.daBonificare, a.r.daIncassare));

  const daPagare = righe.filter((x) => x.r.daBonificare >= 0.01);
  const daIncassare = righe.filter((x) => x.r.daIncassare >= 0.01);
  const totDaPagare = daPagare.reduce((a, x) => a + x.r.daBonificare, 0);
  const totDaIncassare = daIncassare.reduce((a, x) => a + x.r.daIncassare, 0);
  const backUrl = `/saldi?anno=${anno}&mese=${mese}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Saldi e bonifici</h1>
          <p className="page-caption">
            Chiusura mensile per partner: compensazione, bonifici e residui — {nomeMese(mese)} {anno}.
          </p>
        </div>
        <div className="page-actions">
          <a href={`/api/sepa?anno=${anno}&mese=${mese}`} className="btn secondary">
            Export SEPA (pain.001)
          </a>
          <a href={`/api/sepa?anno=${anno}&mese=${mese}&formato=csv`} className="btn secondary">
            Export CSV bonifici
          </a>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Da bonificare ai partner</div>
          <div className={`kpi-value ${totDaPagare > 0 ? "neg" : ""}`}>{euro(totDaPagare)}</div>
          <div className="kpi-sub">{daPagare.length} partner</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da incassare dai partner</div>
          <div className={`kpi-value ${totDaIncassare > 0 ? "neg" : ""}`}>{euro(totDaIncassare)}</div>
          <div className="kpi-sub">{daIncassare.length} partner</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Partner pareggiati</div>
          <div className="kpi-value pos">{righe.filter((x) => x.r.pareggiato).length}</div>
          <div className="kpi-sub">su {righe.length} con movimenti nel mese</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="mese" defaultValue={mese}>
            {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" name="anno" defaultValue={anno} style={{ width: 90 }} />
          <input type="text" name="q" placeholder="Cerca partner…" defaultValue={sp.q ?? ""} />
          <select name="solo" defaultValue={sp.solo ?? ""}>
            <option value="">Tutti</option>
            <option value="aperti">Solo residui aperti</option>
          </select>
          <button className="btn secondary small" type="submit">Applica</button>
        </form>
      </div>

      {righe.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun movimento nel mese</div>
            <div className="empty-text">Nessun partner ha fatture, vendite o saldi per {nomeMese(mese)} {anno}.</div>
          </div>
        </div>
      ) : (
        righe.map(({ partner, saldo, r }) => (
          <details className="card tight" key={partner.id} style={{ marginBottom: 12 }}>
            <summary
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "14px 20px", cursor: "pointer", listStyle: "none", flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                <Link href={`/partner/${partner.id}`}>{partner.nome}</Link>
                {partner.compensazione && (
                  <span className="badge gold" style={{ marginLeft: 8 }}><span className="dot" />Compensazione</span>
                )}
              </span>
              <span style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
                <span className="muted">Servizi IVATI {euro(r.serviziIvato)}</span>
                <span className="muted">Dovuto vendite {euro(r.dovutoPartner)}</span>
                <span className="muted">Bonifico {euro(r.bonifico)}</span>
                {r.pareggiato && <span className="badge green"><span className="dot" />Pareggiato</span>}
                {r.daBonificare >= 0.01 && (
                  <span className="badge orange"><span className="dot" />Da bonificare {euro(r.daBonificare)}</span>
                )}
                {r.daIncassare >= 0.01 && (
                  <span className="badge orange"><span className="dot" />Da incassare {euro(r.daIncassare)}</span>
                )}
              </span>
            </summary>
            <div style={{ borderTop: "1px solid var(--hairline)", padding: "18px 20px" }}>
              <form action={upsertSaldo}>
                <input type="hidden" name="partnerId" value={partner.id} />
                <input type="hidden" name="anno" value={anno} />
                <input type="hidden" name="mese" value={mese} />
                <input type="hidden" name="back" value={backUrl} />
                <div className="form-grid">
                  <div className="checkbox-row">
                    <input type="checkbox" id={`cfe-${partner.id}`} name="commFattEmessa" defaultChecked={saldo?.commFattEmessa ?? false} />
                    <label htmlFor={`cfe-${partner.id}`}>Fattura commissioni emessa</label>
                  </div>
                  <div>
                    <label className="field-label">N° fattura commissioni</label>
                    <input type="text" name="commFattNumero" defaultValue={saldo?.commFattNumero ?? ""} placeholder="es. 72/2026" />
                  </div>
                  <div>
                    <label className="field-label">Aggiunte € (a favore del partner)</label>
                    <input type="number" name="aggiunte" step="0.01" defaultValue={saldo?.aggiunte ?? 0} />
                  </div>
                  <div>
                    <label className="field-label">Detrazioni €</label>
                    <input type="number" name="detrazioni" step="0.01" defaultValue={saldo?.detrazioni ?? 0} />
                  </div>
                  <div>
                    <label className="field-label">Bonifico € (+ inviato / − ricevuto)</label>
                    <input type="number" name="bonificoImporto" step="0.01" defaultValue={saldo?.bonificoImporto ?? ""} placeholder={r.daBonificare >= 0.01 ? r.daBonificare.toFixed(2) : "0,00"} />
                  </div>
                  <div>
                    <label className="field-label">Data bonifico</label>
                    <input type="date" name="bonificoData" defaultValue={saldo?.bonificoData ? saldo.bonificoData.toISOString().slice(0, 10) : ""} />
                  </div>
                  <div>
                    <label className="field-label">Data pagamento/saldo</label>
                    <input type="date" name="dataPagamento" defaultValue={saldo?.dataPagamento ? saldo.dataPagamento.toISOString().slice(0, 10) : ""} />
                  </div>
                  <div className="checkbox-row">
                    <input type="checkbox" id={`ch-${partner.id}`} name="chiuso" defaultChecked={saldo?.chiuso ?? false} />
                    <label htmlFor={`ch-${partner.id}`}>Mese chiuso</label>
                  </div>
                  <div className="full">
                    <label className="field-label">Note</label>
                    <input type="text" name="note" defaultValue={saldo?.note ?? ""} />
                  </div>
                </div>
                <div className="form-footer" style={{ marginTop: 16 }}>
                  <span className="muted" style={{ marginRight: "auto", fontSize: 12.5, alignSelf: "center" }}>
                    {saldo?.bonificoData ? `Ultimo bonifico registrato il ${dataIt(saldo.bonificoData)}` : "Nessun bonifico registrato"}
                  </span>
                  <button type="submit" className="btn primary small">Salva saldo mese</button>
                </div>
              </form>
            </div>
          </details>
        ))
      )}
    </>
  );
}
