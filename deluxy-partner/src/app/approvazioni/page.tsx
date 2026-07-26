import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { approvaRichiesta, rifiutaRichiesta, aggiornaRichiesta } from "@/lib/approvazioni-actions";

export const dynamic = "force-dynamic";

const dataOra = (d: Date | null) =>
  d ? new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Coda di APPROVAZIONE delle richieste di pagamento arrivate dalle altre app
// (es. deluxy-messaging). Approvi → nasce un Pagamento diretto predisposto
// (l'esecuzione vera chiede poi il codice email). Rifiuti → chiusa.
export default async function ApprovazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; rifiutata?: string; salvata?: string }>;
}) {
  const sp = await searchParams;
  const [inAttesa, decise] = await Promise.all([
    prisma.richiestaPagamentoIn.findMany({ where: { stato: "in_attesa" }, orderBy: { createdAt: "desc" } }),
    prisma.richiestaPagamentoIn.findMany({ where: { stato: { not: "in_attesa" } }, orderBy: { decisoIl: "desc" }, take: 30 }),
  ]);
  const totale = inAttesa.reduce((a, r) => a + r.importo, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Approvazioni pagamenti</h1>
          <p className="page-caption">
            Richieste di pagamento in arrivo dalle altre app (es. <strong>Messaggi</strong>). Approvi → nasce un
            pagamento diretto da eseguire (col codice di conferma). Rifiuti → chiusa.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/pagamenti" className="btn secondary">Pagamenti diretti →</Link>
        </div>
      </div>

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}
      {(sp.rifiutata || sp.salvata) && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />{sp.rifiutata ? "Richiesta rifiutata" : "Dati aggiornati"}</span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Da approvare</div>
          <div className={`kpi-value ${inAttesa.length ? "neg" : "pos"}`}>{inAttesa.length}</div>
          <div className="kpi-sub">{euro(totale)} totale in attesa</div>
        </div>
      </div>

      <h2 className="section-title">In attesa</h2>
      {inAttesa.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">✓</div><div className="empty-title">Nessuna richiesta da approvare</div><div className="empty-text">Le richieste arrivano qui dalle app collegate.</div></div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {inAttesa.map((r) => (
            <div className="card" key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 18 }}>{euro(r.importo)}</span>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>a {r.beneficiario ?? r.contatto ?? "beneficiario da indicare"}</span>
                </div>
                <span className="badge blue"><span className="dot" />da {r.origine} · {dataOra(r.createdAt)}</span>
              </div>

              <div className="info-grid" style={{ marginTop: 12 }}>
                <div className="info-item"><div className="k">IBAN</div><div className="v" style={{ fontSize: 13.5 }}>{r.iban ?? <span style={{ color: "var(--orange)" }}>mancante</span>}</div></div>
                <div className="info-item"><div className="k">BIC</div><div className="v" style={{ fontSize: 13.5 }}>{r.bic ?? "—"}</div></div>
                <div className="info-item"><div className="k">Causale</div><div className="v" style={{ fontSize: 13.5 }}>{r.causale ?? "—"}</div></div>
                <div className="info-item"><div className="k">Contatto</div><div className="v" style={{ fontSize: 13.5 }}>{r.contatto ?? "—"}</div></div>
              </div>
              {r.note && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{r.note}</p>}
              {r.linkConversazione && (
                <p style={{ marginTop: 6 }}>
                  <a href={r.linkConversazione} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", fontSize: 13 }}>Apri la conversazione ↗</a>
                </p>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <form action={approvaRichiesta.bind(null, r.id)}>
                  <button className="btn primary" type="submit" title="Crea il pagamento diretto (poi si esegue col codice di conferma)">Approva</button>
                </form>
                <form action={rifiutaRichiesta.bind(null, r.id)}>
                  <button className="btn secondary" type="submit">Rifiuta</button>
                </form>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", padding: "8px 0" }}>Correggi dati (IBAN, importo…)</summary>
                  <form action={aggiornaRichiesta.bind(null, r.id)} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
                    <div><label className="field-label">Importo €</label><input type="number" name="importo" step="0.01" defaultValue={r.importo} style={{ width: 110 }} /></div>
                    <div><label className="field-label">Beneficiario</label><input type="text" name="beneficiario" defaultValue={r.beneficiario ?? ""} /></div>
                    <div><label className="field-label">IBAN</label><input type="text" name="iban" defaultValue={r.iban ?? ""} style={{ width: 220 }} /></div>
                    <div><label className="field-label">BIC</label><input type="text" name="bic" defaultValue={r.bic ?? ""} style={{ width: 110 }} /></div>
                    <div className="full"><label className="field-label">Causale</label><input type="text" name="causale" defaultValue={r.causale ?? ""} /></div>
                    <button className="btn secondary small" type="submit">Salva</button>
                  </form>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}

      {decise.length > 0 && (
        <>
          <h2 className="section-title">Decise di recente</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Quando</th><th>Importo</th><th>Beneficiario</th><th>Origine</th><th>Esito</th><th></th></tr></thead>
                <tbody>
                  {decise.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{dataOra(r.decisoIl)}</td>
                      <td className="num">{euro(r.importo)}</td>
                      <td>{r.beneficiario ?? r.contatto ?? "—"}</td>
                      <td className="muted">{r.origine}</td>
                      <td><span className={`badge ${r.stato === "approvata" ? "green" : "neutral"}`}><span className="dot" />{r.stato === "approvata" ? "Approvata" : "Rifiutata"}</span></td>
                      <td>{r.pagamentoDirettoId && <Link href={`/pagamenti/${r.pagamentoDirettoId}`} className="btn small secondary">Vai al pagamento</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
