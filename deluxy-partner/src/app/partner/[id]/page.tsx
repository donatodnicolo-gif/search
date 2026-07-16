import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { riepilogoPartner, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt, pctIt } from "@/lib/format";
import { nomeMese, commissione, dovutoVendita } from "@/lib/calc";

export const dynamic = "force-dynamic";

function siNo(v: boolean) {
  return v ? "Sì" : "No";
}

export default async function PartnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) notFound();

  const anno = ANNO_CORRENTE;
  const { mesi, rolling } = await riepilogoPartner(id, anno);
  const mesiConDati = mesi.filter(
    (m) => m.fatture.length || m.vendite.length || m.saldo
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{partner.nome}</h1>
          <p className="page-caption">
            {[partner.categoria, partner.citta, partner.servizi].filter(Boolean).join(" · ") || "Scheda partner"}
          </p>
        </div>
        <div className="page-actions">
          <Link href={`/fatture/nuova?partnerId=${id}`} className="btn secondary">+ Fattura servizi</Link>
          <Link href={`/vendite/nuova?partnerId=${id}`} className="btn secondary">+ Vendita vendor</Link>
          <Link href={`/partner/${id}/modifica`} className="btn primary">Modifica</Link>
        </div>
      </div>

      <div className="card">
        <div className="info-grid">
          <div className="info-item"><div className="k">Fee su vendite</div><div className="v">{pctIt(partner.feePercent)}</div></div>
          <div className="info-item"><div className="k">Cliente per l&apos;anno</div><div className="v">{partner.clienteAnno ?? "—"}</div></div>
          <div className="info-item"><div className="k">GG pagamento fatture</div><div className="v">{partner.ggPagamento}</div></div>
          <div className="info-item"><div className="k">Compensazione</div><div className="v">{siNo(partner.compensazione)}</div></div>
          <div className="info-item"><div className="k">Commissioni a detrazione</div><div className="v">{siNo(partner.commissioniADetrazione)}</div></div>
          <div className="info-item"><div className="k">Debiti 2025</div><div className="v">{euro(partner.debiti2025)}</div></div>
          <div className="info-item"><div className="k">Crediti 2025</div><div className="v">{euro(partner.crediti2025)}</div></div>
          <div className="info-item"><div className="k">IBAN</div><div className="v">{partner.iban ?? "—"}</div></div>
        </div>
        {partner.note && (
          <p style={{ marginTop: 14, fontSize: 13.5, color: "var(--text-secondary)" }}>{partner.note}</p>
        )}
      </div>

      <h2 className="section-title">Rolling {anno}</h2>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite come vendor</div>
          <div className="kpi-value">{euro(rolling.vendite)}</div>
          <div className="kpi-sub">Commissioni {euro(rolling.commissioni)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Servizi fatturati (netto IVA)</div>
          <div className="kpi-value">{euro(rolling.fatture)}</div>
          <div className="kpi-sub">Stima chiusura {euro(rolling.stimaChiusura)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dovuto al partner (YTD)</div>
          <div className="kpi-value">{euro(rolling.incassiNettoCommissioni)}</div>
          <div className="kpi-sub">Bonificato {euro(rolling.pagatoAlPartner)} · incassato {euro(rolling.incassatoDalPartner)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Residuo</div>
          <div className={`kpi-value ${Math.abs(rolling.residuo) < 0.01 ? "" : rolling.residuo > 0 ? "pos" : "neg"}`}>
            {euro(rolling.residuo)}
          </div>
          <div className="kpi-sub">{rolling.residuo > 0.01 ? "il partner deve a Deluxy" : rolling.residuo < -0.01 ? "Deluxy deve al partner" : "pareggiato"}</div>
        </div>
      </div>

      <h2 className="section-title">Movimenti mensili {anno}</h2>
      {mesiConDati.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun movimento</div>
            <div className="empty-text">Inserisci una fattura servizi o una vendita vendor per iniziare.</div>
          </div>
        </div>
      )}
      {mesiConDati.map(({ mese, fatture, vendite, saldo, riepilogo: r }) => (
        <div className="month-block" key={mese} style={{ background: "var(--surface)" }}>
          <div className="month-head">
            <span>{nomeMese(mese)} {anno}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {Math.abs(r.residuo) < 0.01 ? (
                <span className="badge green"><span className="dot" />Pareggiato</span>
              ) : r.residuo > 0 ? (
                <span className="badge orange"><span className="dot" />Da incassare {euro(r.residuo)}</span>
              ) : (
                <span className="badge orange"><span className="dot" />Da bonificare {euro(-r.residuo)}</span>
              )}
              <Link href={`/saldi?anno=${anno}&mese=${mese}&q=${encodeURIComponent(partner.nome.slice(0, 12))}`} className="btn small secondary">
                Saldo mese
              </Link>
            </span>
          </div>
          <div className="month-body">
            <div className="table-wrap">
              <table className="mini-table">
                <tbody>
                  {fatture.map((f) => (
                    <tr key={f.id}>
                      <td style={{ width: 170 }} className="muted">Servizi a fatturazione</td>
                      <td>{f.tipologia.nome}{f.numero ? ` · fatt. ${f.numero}` : ""}</td>
                      <td>scad. {dataIt(f.scadenza)}</td>
                      <td>
                        {f.pagata ? (
                          <span className="badge green"><span className="dot" />Saldata {dataIt(f.dataPagamento)}</span>
                        ) : (
                          <span className="badge orange"><span className="dot" />Da incassare</span>
                        )}
                      </td>
                      <td className="num">{euro(f.imponibile)} <span className="muted">+IVA</span></td>
                    </tr>
                  ))}
                  {vendite.map((v) => (
                    <tr key={v.id}>
                      <td className="muted">Vendite come vendor</td>
                      <td>{v.descrizione ?? "Vendite"}{v.data ? ` · ${dataIt(v.data)}` : ""}</td>
                      <td>fee {pctIt(v.feePercent)} → comm. {euro(commissione(v))}</td>
                      <td>
                        {saldo?.commFattEmessa ? (
                          <span className="badge green"><span className="dot" />Fatt. comm. {saldo.commFattNumero ?? ""}</span>
                        ) : (
                          <span className="badge neutral"><span className="dot" />Fatt. comm. da emettere</span>
                        )}
                      </td>
                      <td className="num">{euro(v.incassoLordo)} <span className="muted">→ dovuto {euro(dovutoVendita(v))}</span></td>
                    </tr>
                  ))}
                  {(r.aggiunte !== 0 || r.detrazioni !== 0) && (
                    <tr>
                      <td className="muted">Extra</td>
                      <td colSpan={3}>Aggiunte {euro(r.aggiunte)} · Detrazioni {euro(r.detrazioni)}</td>
                      <td className="num">{euro(r.aggiunte - r.detrazioni)}</td>
                    </tr>
                  )}
                  <tr style={{ background: "var(--bg)" }}>
                    <td className="muted">Saldo</td>
                    <td colSpan={2}>
                      Servizi IVATI {euro(r.serviziIvato)} − dovuto vendite {euro(r.dovutoPartner)}
                    </td>
                    <td>
                      {saldo?.bonificoImporto != null && (
                        <span className="muted">
                          Bonifico {saldo.bonificoImporto > 0 ? "inviato" : "ricevuto"} {euro(Math.abs(saldo.bonificoImporto))} il {dataIt(saldo.bonificoData)}
                        </span>
                      )}
                    </td>
                    <td className={`num ${Math.abs(r.residuo) < 0.01 ? "" : r.residuo > 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                      {euro(r.saldo)} → residuo {euro(r.residuo)}
                    </td>
                  </tr>
                  {saldo?.note && (
                    <tr>
                      <td className="muted">Note</td>
                      <td colSpan={4} style={{ color: "var(--text-secondary)" }}>{saldo.note}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
