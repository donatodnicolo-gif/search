import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { riepilogoPartner, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt, pctIt } from "@/lib/format";
import { nomeMese, commissione, dovutoVendita, ivato, MESI } from "@/lib/calc";
import { segnaFatturaPagata, riallineaFeeVendite, aggiungiTariffa, eliminaTariffa } from "@/lib/actions";
import { feeDaTariffe } from "@/lib/fee";
import { AnagraficaCard } from "@/components/AnagraficaCard";
import { PagamentoMese } from "@/components/PagamentoMese";
import { RecapAI } from "@/components/RecapAI";
import { costruisciRecapPrompt } from "@/lib/recap";

export const dynamic = "force-dynamic";

function siNo(v: boolean) {
  return v ? "Sì" : "No";
}

export default async function PartnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) notFound();

  const anno = ANNO_CORRENTE;
  const annoPrec = anno - 1;
  const [{ mesi, rolling }, prec, tariffe] = await Promise.all([
    riepilogoPartner(id, anno),
    riepilogoPartner(id, annoPrec),
    prisma.tariffaPartner.findMany({ where: { partnerId: id }, orderBy: [{ dalAnno: "desc" }, { dalMese: "desc" }] }),
  ]);
  const mesiConDati = mesi.filter(
    (m) => m.fatture.length || m.vendite.length || m.saldo
  );
  // valore mese = vendite + servizi fatturati (netto IVA), per il confronto anno su anno
  const valoreMese = (r: { vendite: number; serviziNetto: number }) => r.vendite + r.serviziNetto;

  // fee attesa per una vendita = fee valida nel suo mese secondo lo storico
  const feeBase = partner.feePercent ?? 0;
  const feeAttesaVendita = (v: { anno: number; mese: number }) => feeDaTariffe(tariffe, v.anno, v.mese, feeBase);
  const venditeDisallineate = mesi
    .flatMap((m) => m.vendite)
    .filter((v) => v.feePercent !== feeAttesaVendita(v)).length;

  const recapPrompt = costruisciRecapPrompt({
    partner,
    anno,
    annoPrec,
    mesi,
    mesiPrec: prec.mesi,
    rolling,
    rollingPrec: prec.rolling,
  });

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
          {venditeDisallineate > 0 && (
            <form action={riallineaFeeVendite.bind(null, id, anno)}>
              <button
                className="btn secondary"
                type="submit"
                title={`Applica a ${venditeDisallineate} vendite ${anno} la fee prevista dallo storico per il loro mese`}
              >
                Riallinea fee vendite ({venditeDisallineate})
              </button>
            </form>
          )}
          <Link href={`/fatture/nuova?partnerId=${id}`} className="btn secondary">+ Fattura servizi</Link>
          <Link href={`/vendite/nuova?partnerId=${id}`} className="btn secondary">+ Vendita vendor</Link>
          <Link href={`/partner/${id}/modifica`} className="btn primary">Modifica</Link>
        </div>
      </div>

      <RecapAI partnerId={id} prompt={recapPrompt} />

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

      <AnagraficaCard nomePartner={partner.nome} anagraficaId={partner.anagraficaId} />

      <h2 className="section-title">Fee nel tempo</h2>
      <div className="card">
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12 }}>
          Fee base attuale <strong>{pctIt(partner.feePercent)}</strong>. Se la fee cambia da un certo
          mese, aggiungi una decorrenza: le vendite di quel mese in poi la useranno automaticamente,
          quelle precedenti restano invariate.
        </p>
        {tariffe.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="mini-table">
              <thead>
                <tr><th>Dal</th><th>Fee</th><th></th></tr>
              </thead>
              <tbody>
                {tariffe.map((t) => (
                  <tr key={t.id}>
                    <td>{nomeMese(t.dalMese)} {t.dalAnno}</td>
                    <td>{pctIt(t.feePercent)}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={eliminaTariffa.bind(null, t.id, id)}>
                        <button className="btn small danger" type="submit">Elimina</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={aggiungiTariffa.bind(null, id)} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="field-label">Dal mese</label>
            <select name="dalMese" defaultValue={new Date().getMonth() + 1} style={{ width: "auto" }}>
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Anno</label>
            <input type="number" name="dalAnno" defaultValue={anno} step="1" style={{ width: 90 }} />
          </div>
          <div>
            <label className="field-label">Fee %</label>
            <input type="number" name="feePercent" step="0.1" min="0" max="100" required style={{ width: 90 }} placeholder="es. 22" />
          </div>
          <button className="btn primary small" type="submit">Aggiungi decorrenza</button>
          {venditeDisallineate > 0 && (
            <span className="muted" style={{ fontSize: 12.5, alignSelf: "center", marginLeft: "auto" }}>
              {venditeDisallineate} vendite {anno} non allineate allo storico — usa «Riallinea fee vendite» in alto.
            </span>
          )}
        </form>
      </div>

      <h2 className="section-title">Rolling {anno}</h2>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite come vendor</div>
          <div className="kpi-value">{euro(rolling.vendite)}</div>
          <div className="kpi-sub">
            Commissioni {euro(rolling.commissioni)} · {annoPrec} intero: {euro(prec.rolling.vendite)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Servizi fatturati (netto IVA)</div>
          <div className="kpi-value">{euro(rolling.fatture)}</div>
          <div className="kpi-sub">
            Stima chiusura {euro(rolling.stimaChiusura)} · {annoPrec} intero: {euro(prec.rolling.fatture)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dovuto al partner (YTD)</div>
          <div className="kpi-value">{euro(rolling.incassiNettoCommissioni)}</div>
          <div className="kpi-sub">Bonificato {euro(rolling.pagatoAlPartner)} · incassato {euro(rolling.incassatoDalPartner)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{partner.compensazione ? "Residuo (in compensazione)" : "Partite aperte"}</div>
          {partner.compensazione ? (
            <>
              <div className={`kpi-value ${Math.abs(rolling.residuo) < 0.01 ? "" : rolling.residuo > 0 ? "pos" : "neg"}`}>
                {euro(rolling.residuo)}
              </div>
              <div className="kpi-sub">
                {rolling.residuo > 0.01 ? "il partner deve a Deluxy" : rolling.residuo < -0.01 ? "Deluxy deve al partner" : "pareggiato"}
              </div>
            </>
          ) : (
            <>
              <div className={`kpi-value ${rolling.daBonificare >= 0.01 ? "neg" : ""}`} style={{ fontSize: 22 }}>
                {euro(rolling.daBonificare)}
              </div>
              <div className="kpi-sub">
                da bonificare al partner · <strong>{euro(rolling.daIncassare)}</strong> da incassare (fatture)
              </div>
            </>
          )}
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
        <div className="month-block" key={mese} id={`mese-${mese}`} style={{ background: "var(--surface)", scrollMarginTop: 20 }}>
          <div className="month-head">
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              {nomeMese(mese)} {anno}
              {(() => {
                const v25 = valoreMese(prec.mesi[mese - 1].riepilogo);
                const v26 = valoreMese(r);
                if (!v25) return <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{annoPrec}: —</span>;
                const dp = ((v26 - v25) / v25) * 100;
                return (
                  <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                    {annoPrec}: {euro(v25)} ·{" "}
                    <span style={{ color: dp >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                      {dp >= 0 ? "+" : ""}{dp.toFixed(1).replace(".", ",")}%
                    </span>
                  </span>
                );
              })()}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {r.pareggiato && <span className="badge green"><span className="dot" />Pareggiato</span>}
              {r.daBonificare >= 0.01 && (
                <span className="badge orange"><span className="dot" />Da bonificare {euro(r.daBonificare)}</span>
              )}
              {r.daIncassare >= 0.01 && (
                <span className="badge orange"><span className="dot" />Da incassare {euro(r.daIncassare)}</span>
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
                      <td>
                        {f.tipologia.nome} ·{" "}
                        <Link href={`/fatture/${f.id}`} style={{ color: "var(--blue)" }} title="Apri il record della fattura">
                          fatt. {f.numero ?? "s.n."}
                        </Link>
                      </td>
                      <td>scad. {dataIt(f.scadenza)}</td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {f.pagata ? (
                            <span className="badge green">
                              <span className="dot" />
                              Saldata{f.dataPagamento ? ` ${dataIt(f.dataPagamento)}` : ""}
                            </span>
                          ) : (
                            <span className="badge orange"><span className="dot" />Da incassare</span>
                          )}
                          <form action={segnaFatturaPagata.bind(null, f.id, !f.pagata, undefined)}>
                            <button
                              className="btn small secondary"
                              type="submit"
                              title={f.pagata ? "Segna di nuovo da incassare" : "Il partner ha saldato questa fattura (data odierna)"}
                            >
                              {f.pagata ? "Riapri" : "Hanno saldato"}
                            </button>
                          </form>
                        </span>
                      </td>
                      <td className="num">
                        {euro(f.imponibile)} <span className="muted">+IVA → {euro(ivato(f))}</span>
                      </td>
                    </tr>
                  ))}
                  {vendite.map((v) => (
                    <tr key={v.id}>
                      <td className="muted">Vendite come vendor</td>
                      <td>
                        <Link href={`/vendite/${v.id}`} style={{ color: "var(--blue)" }} title="Apri e modifica la vendita (incasso, fee…)">
                          {v.descrizione ?? "Vendite"}
                        </Link>
                        {v.data ? ` · ${dataIt(v.data)}` : ""}
                      </td>
                      <td>
                        fee {pctIt(v.feePercent)} → comm. {euro(commissione(v))}
                        {v.feePercent !== feeAttesaVendita(v) && (
                          <Link href={`/vendite/${v.id}`} className="badge orange" style={{ marginLeft: 6 }} title={`Per ${nomeMese(v.mese)} la fee prevista è ${feeAttesaVendita(v)}%`}>
                            <span className="dot" />attesa {pctIt(feeAttesaVendita(v))}?
                          </Link>
                        )}
                      </td>
                      <td>
                        {saldo?.commFattEmessa ? (
                          <span className="badge green"><span className="dot" />Fatt. comm. {saldo.commFattNumero ?? ""}</span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span className="badge neutral"><span className="dot" />Fatt. comm. da emettere</span>
                            <Link
                              className="btn small secondary"
                              href={`/fic/emetti?partnerId=${partner.id}&anno=${anno}&mese=${mese}`}
                              title="Crea la fattura commissioni su Fatture in Cloud"
                            >
                              Emetti
                            </Link>
                          </span>
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
                  {r.compensazione ? (
                    <tr style={{ background: "var(--bg)" }}>
                      <td className="muted">Saldo del mese (compensazione)</td>
                      <td colSpan={2}>
                        Fatture IVATE {euro(r.serviziIvato)} − dovuto vendite {euro(r.dovutoPartner)} ={" "}
                        <strong>{euro(r.saldo)}</strong>{" "}
                        <span className="muted">
                          {Math.abs(r.saldo) < 0.01 ? "" : r.saldo > 0 ? "(il partner ci deve)" : "(dobbiamo al partner)"}
                        </span>
                      </td>
                      <td>
                        {saldo?.bonificoImporto != null && (
                          <span className="muted">
                            {saldo.bonificoImporto > 0 ? "Pagato al partner" : "Incassato"}{" "}
                            {euro(Math.abs(saldo.bonificoImporto))}
                            {saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                          </span>
                        )}
                      </td>
                      <td className={`num ${r.pareggiato ? "" : r.residuo > 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                        residuo {euro(r.residuo)}
                      </td>
                    </tr>
                  ) : (
                    <>
                      <tr style={{ background: "var(--bg)" }}>
                        <td className="muted">Da bonificare al partner</td>
                        <td colSpan={2}>
                          Dovuto vendite {euro(r.dovutoPartner)}
                          {r.bonificoInviato > 0 && <> − già bonificato {euro(r.bonificoInviato)}</>}
                        </td>
                        <td>
                          {saldo?.bonificoImporto != null && saldo.bonificoImporto > 0 && (
                            <span className="muted">
                              Bonifico inviato{saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                            </span>
                          )}
                        </td>
                        <td className={`num ${r.daBonificare >= 0.01 ? "neg" : ""}`} style={{ fontWeight: 600 }}>
                          {euro(r.daBonificare)}
                        </td>
                      </tr>
                      <tr style={{ background: "var(--bg)" }}>
                        <td className="muted">Da incassare dal partner</td>
                        <td colSpan={2}>
                          Fatture non saldate {euro(r.serviziNonPagati)}
                          {r.bonificoRicevuto > 0 && <> − acconti ricevuti {euro(r.bonificoRicevuto)}</>}
                        </td>
                        <td>
                          {saldo?.bonificoImporto != null && saldo.bonificoImporto < 0 && (
                            <span className="muted">
                              Incasso registrato{saldo.bonificoData ? ` il ${dataIt(saldo.bonificoData)}` : ""}
                            </span>
                          )}
                        </td>
                        <td className={`num ${r.daIncassare >= 0.01 ? "pos" : ""}`} style={{ fontWeight: 600 }}>
                          {euro(r.daIncassare)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <PagamentoMese
              partnerId={partner.id}
              anno={anno}
              mese={mese}
              daBonificare={r.daBonificare}
              daIncassare={r.daIncassare}
              bonificoImporto={saldo?.bonificoImporto ?? null}
              bonificoData={saldo?.bonificoData ?? null}
              note={saldo?.note ?? null}
            />
          </div>
        </div>
      ))}

      {mesiConDati.length > 0 && (() => {
        // Totale YTD: somma dei mesi con dati, confrontata con lo stesso periodo 2025
        const ultimoMese = Math.max(...mesiConDati.map((m) => m.mese));
        const ytd = mesi.slice(0, ultimoMese).map((m) => m.riepilogo);
        const sum = (fn: (r: (typeof ytd)[number]) => number) => ytd.reduce((a, r) => a + fn(r), 0);
        const ytdPrec = prec.mesi.slice(0, ultimoMese).map((m) => m.riepilogo);
        const sumPrec = (fn: (r: (typeof ytdPrec)[number]) => number) => ytdPrec.reduce((a, r) => a + fn(r), 0);
        const totCur = sum((r) => r.vendite + r.serviziNetto);
        const totPrec = sumPrec((r) => r.vendite + r.serviziNetto);
        const dp = totPrec ? ((totCur - totPrec) / totPrec) * 100 : null;
        const daBonificareYtd = sum((r) => r.daBonificare);
        const daIncassareYtd = sum((r) => r.daIncassare);
        return (
          <div className="month-block" style={{ background: "var(--surface)" }}>
            <div className="month-head">
              <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                Totale YTD {anno} (Gennaio–{nomeMese(ultimoMese)})
                <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                  {annoPrec} stesso periodo: {totPrec ? euro(totPrec) : "—"}
                  {dp != null && (
                    <>
                      {" · "}
                      <span style={{ color: dp >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                        {dp >= 0 ? "+" : ""}{dp.toFixed(1).replace(".", ",")}%
                      </span>
                    </>
                  )}
                </span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {daBonificareYtd < 0.01 && daIncassareYtd < 0.01 && (
                  <span className="badge green"><span className="dot" />Tutto pareggiato</span>
                )}
                {daBonificareYtd >= 0.01 && (
                  <span className="badge orange"><span className="dot" />Da bonificare {euro(daBonificareYtd)}</span>
                )}
                {daIncassareYtd >= 0.01 && (
                  <span className="badge orange"><span className="dot" />Da incassare {euro(daIncassareYtd)}</span>
                )}
              </span>
            </div>
            <div className="month-body">
              <div className="table-wrap">
                <table className="mini-table">
                  <tbody>
                    <tr>
                      <td style={{ width: 170 }} className="muted">Vendite come vendor</td>
                      <td>commissioni {euro(sum((r) => r.commissioni))}</td>
                      <td className="num">{euro(sum((r) => r.vendite))} <span className="muted">→ dovuto {euro(sum((r) => r.dovutoPartner))}</span></td>
                    </tr>
                    <tr>
                      <td className="muted">Servizi a fatturazione</td>
                      <td>IVA inclusa {euro(sum((r) => r.serviziIvato))}</td>
                      <td className="num">{euro(sum((r) => r.serviziNetto))} <span className="muted">netto IVA</span></td>
                    </tr>
                    <tr style={{ background: "var(--bg)" }}>
                      <td className="muted">Da bonificare al partner</td>
                      <td>Già bonificato {euro(rolling.pagatoAlPartner)}</td>
                      <td className={`num ${daBonificareYtd >= 0.01 ? "neg" : ""}`} style={{ fontWeight: 600 }}>
                        {euro(daBonificareYtd)}
                      </td>
                    </tr>
                    <tr style={{ background: "var(--bg)" }}>
                      <td className="muted">Da incassare dal partner</td>
                      <td>Già incassato {euro(rolling.incassatoDalPartner)}</td>
                      <td className={`num ${daIncassareYtd >= 0.01 ? "pos" : ""}`} style={{ fontWeight: 600 }}>
                        {euro(daIncassareYtd)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
