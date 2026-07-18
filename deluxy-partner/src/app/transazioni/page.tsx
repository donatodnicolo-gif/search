import Link from "next/link";
import { prisma } from "@/lib/db";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { ivato, nomeMese } from "@/lib/calc";
import { suggerisci, type Suggerimento } from "@/lib/riconciliazione";
import {
  importaEstratto,
  registraTransazioneFattura,
  registraTransazionePagamento,
  ignoraTransazione,
  ripristinaTransazione,
  eliminaTransazioniNonRegistrate,
} from "@/lib/transazioni-actions";

export const dynamic = "force-dynamic";

export default async function TransazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; nuove?: string; doppioni?: string; scartate?: string; errore?: string }>;
}) {
  const sp = await searchParams;

  const [transazioni, partners, fattureAperte, tutti] = await Promise.all([
    prisma.transazioneBancaria.findMany({ orderBy: { data: "desc" } }),
    prisma.partner.findMany(),
    prisma.fatturaServizio.findMany({
      where: { pagata: false, imponibile: { gt: 0 } },
      include: { partner: true },
    }),
    riepilogoTutti(ANNO_CORRENTE),
  ]);

  const daBonificare = tutti.flatMap((t) =>
    t.mesi
      .filter((m) => m.riepilogo.daBonificare >= 0.01)
      .map((m) => ({ partner: t.partner, mese: m.mese, importo: m.riepilogo.daBonificare }))
  );

  const ctx = { partners, fattureAperte, daBonificare };
  const nuove = transazioni.filter((t) => t.stato === "nuova");
  const registrate = transazioni.filter((t) => t.stato === "registrata");
  const ignorate = transazioni.filter((t) => t.stato === "ignorata");

  const conSugg = nuove.map((tx) => ({ tx, sugg: suggerisci(tx, ctx) }));
  const daRegistrare = conSugg.filter((x) => ["fattura", "incasso_partner", "bonifico_partner"].includes(x.sugg.tipo));
  const discrepanze = conSugg.filter((x) => x.sugg.tipo === "discrepanza");
  const sconosciute = conSugg.filter((x) => x.sugg.tipo === "sconosciuta");

  // Attesi mancanti: nel periodo coperto dall'estratto, cosa NON si trova in banca
  const periodo = transazioni.length
    ? {
        da: new Date(Math.min(...transazioni.map((t) => t.data.getTime()))),
        a: new Date(Math.max(...transazioni.map((t) => t.data.getTime()))),
      }
    : null;
  const TOL = 0.02;
  const accrediti = transazioni.filter((t) => t.importo > 0);
  const addebiti = transazioni.filter((t) => t.importo < 0);
  const fattureMancanti = periodo
    ? fattureAperte.filter(
        (f) =>
          f.scadenza && f.scadenza <= periodo.a &&
          !accrediti.some((t) => Math.abs(t.importo - ivato(f)) <= TOL)
      )
    : [];
  const bonificiMancanti = periodo
    ? daBonificare.filter((x) => !addebiti.some((t) => Math.abs(Math.abs(t.importo) - x.importo) <= TOL))
    : [];

  const importoTx = (v: number) => (
    <span className={`num ${v > 0 ? "pos" : "neg"}`} style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
      {v > 0 ? "+" : ""}{euro(v)}
    </span>
  );

  const rigaTx = (tx: (typeof transazioni)[number]) => (
    <>
      <td style={{ whiteSpace: "nowrap" }}>{dataIt(tx.data)}</td>
      <td style={{ maxWidth: 420 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tx.descrizione}>
          {tx.descrizione}
        </div>
        {tx.controparte && <div className="muted" style={{ fontSize: 12 }}>{tx.controparte}</div>}
      </td>
      <td className="num">{importoTx(tx.importo)}</td>
    </>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Import transazioni</h1>
          <p className="page-caption">
            Carica l&apos;estratto conto (CSV o XLSX): l&apos;app ricostruisce incassi e pagamenti,
            li confronta col database e segnala cosa manca.
          </p>
        </div>
        {(nuove.length > 0 || ignorate.length > 0) && (
          <div className="page-actions">
            <form action={eliminaTransazioniNonRegistrate}>
              <button className="btn danger small" type="submit" title="Elimina le transazioni non registrate per rifare l'import">
                Svuota non registrate
              </button>
            </form>
          </div>
        )}
      </div>

      {sp.import === "ok" && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />
            Import completato: {sp.nuove} nuove transazioni
            {Number(sp.doppioni) > 0 ? ` · ${sp.doppioni} già presenti (ignorate)` : ""}
            {Number(sp.scartate) > 0 ? ` · ${sp.scartate} righe scartate` : ""}
          </span>
        </div>
      )}
      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}

      <form action={importaEstratto} className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px" }}>
            <label className="field-label">Estratto conto (CSV o XLSX) — qualsiasi banca</label>
            <input type="file" name="file" accept=".csv,.txt,.xlsx,.xls" required style={{ border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius-m)", padding: 8, width: "100%", fontSize: 13.5, background: "var(--surface)" }} />
          </div>
          <button className="btn primary" type="submit">Importa</button>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Riconosce automaticamente le colonne più comuni (Data contabile/operazione, Importo o Dare/Avere,
          Descrizione/Causale). Ricaricare lo stesso estratto non crea doppioni. Nessun movimento viene
          registrato in automatico: ogni abbinamento va confermato qui sotto.
        </p>
      </form>

      {transazioni.length > 0 && (
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">Da registrare (match trovato)</div>
            <div className={`kpi-value ${daRegistrare.length ? "" : "pos"}`}>{daRegistrare.length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Discrepanze da controllare</div>
            <div className={`kpi-value ${discrepanze.length ? "neg" : "pos"}`}>{discrepanze.length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Non riconosciute</div>
            <div className="kpi-value">{sconosciute.length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Registrate / ignorate</div>
            <div className="kpi-value pos">{registrate.length} / {ignorate.length}</div>
            {periodo && <div className="kpi-sub">periodo estratto {dataIt(periodo.da)} – {dataIt(periodo.a)}</div>}
          </div>
        </div>
      )}

      {daRegistrare.length > 0 && (
        <>
          <h2 className="section-title">Match trovati — conferma per registrare</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th className="num">Importo</th><th>Abbinamento proposto</th><th></th></tr>
                </thead>
                <tbody>
                  {daRegistrare.map(({ tx, sugg }) => (
                    <tr key={tx.id}>
                      {rigaTx(tx)}
                      <td style={{ maxWidth: 340 }}>
                        {sugg.tipo === "fattura" && (
                          <>
                            <Link href={`/partner/${sugg.fattura.partnerId}`} style={{ fontWeight: 500 }}>{sugg.fattura.partner.nome}</Link>
                            <div className="muted" style={{ fontSize: 12 }}>
                              Fatt. {sugg.fattura.numero ?? "s.n."} · {euro(ivato(sugg.fattura))} · {sugg.motivo}
                            </div>
                          </>
                        )}
                        {sugg.tipo === "incasso_partner" && (
                          <>
                            <Link href={`/partner/${sugg.partner.id}`} style={{ fontWeight: 500 }}>{sugg.partner.nome}</Link>
                            <div className="muted" style={{ fontSize: 12 }}>{sugg.motivo}</div>
                          </>
                        )}
                        {sugg.tipo === "bonifico_partner" && (
                          <>
                            <Link href={`/partner/${sugg.partner.id}`} style={{ fontWeight: 500 }}>{sugg.partner.nome}</Link>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {sugg.mesePagamento ? `${nomeMese(sugg.mesePagamento)} ${ANNO_CORRENTE} · ` : ""}{sugg.motivo}
                            </div>
                          </>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          {sugg.tipo === "fattura" && (
                            <form action={registraTransazioneFattura.bind(null, tx.id, sugg.fattura.id)}>
                              <button className="btn small primary" type="submit">Salda fattura</button>
                            </form>
                          )}
                          {sugg.tipo === "incasso_partner" && (
                            <form action={registraTransazionePagamento.bind(null, tx.id, sugg.partner.id, null)}>
                              <button className="btn small primary" type="submit">Registra incasso</button>
                            </form>
                          )}
                          {sugg.tipo === "bonifico_partner" && (
                            <form action={registraTransazionePagamento.bind(null, tx.id, sugg.partner.id, sugg.mesePagamento)}>
                              <button className="btn small primary" type="submit">Registra bonifico</button>
                            </form>
                          )}
                          <form action={ignoraTransazione.bind(null, tx.id)}>
                            <button className="btn small secondary" type="submit">Ignora</button>
                          </form>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {discrepanze.length > 0 && (
        <>
          <h2 className="section-title">Discrepanze — importi che non tornano</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th className="num">Importo</th><th>Problema</th><th></th></tr>
                </thead>
                <tbody>
                  {discrepanze.map(({ tx, sugg }) => (
                    <tr key={tx.id}>
                      {rigaTx(tx)}
                      <td style={{ maxWidth: 340 }}>
                        {sugg.tipo === "discrepanza" && (
                          <>
                            <Link href={`/partner/${sugg.partner.id}`} style={{ fontWeight: 500 }}>{sugg.partner.nome}</Link>
                            <div style={{ fontSize: 12, color: "var(--orange)" }}>{sugg.motivo}</div>
                          </>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          {sugg.tipo === "discrepanza" && (
                            <>
                              <form action={registraTransazionePagamento.bind(null, tx.id, sugg.partner.id, null)}>
                                <button className="btn small secondary" type="submit" title="Registra comunque il movimento sul partner, sul mese della transazione">
                                  Registra comunque
                                </button>
                              </form>
                              <form action={ignoraTransazione.bind(null, tx.id)}>
                                <button className="btn small secondary" type="submit">Ignora</button>
                              </form>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {sconosciute.length > 0 && (
        <>
          <h2 className="section-title">Non riconosciute</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th className="num">Importo</th><th></th></tr>
                </thead>
                <tbody>
                  {sconosciute.map(({ tx }) => (
                    <tr key={tx.id}>
                      {rigaTx(tx)}
                      <td style={{ whiteSpace: "nowrap" }}>
                        <form action={ignoraTransazione.bind(null, tx.id)}>
                          <button className="btn small secondary" type="submit">Ignora</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Movimenti estranei ai partner (stipendi, fornitori, commissioni bancarie…): ignorali pure.
          </p>
        </>
      )}

      {periodo && (fattureMancanti.length > 0 || bonificiMancanti.length > 0) && (
        <>
          <h2 className="section-title">
            Attesi ma assenti dall&apos;estratto ({dataIt(periodo.da)} – {dataIt(periodo.a)})
          </h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Tipo</th><th>Partner</th><th>Riferimento</th><th className="num">Importo atteso</th></tr>
                </thead>
                <tbody>
                  {fattureMancanti.map((f) => (
                    <tr key={f.id}>
                      <td><span className="badge orange"><span className="dot" />Incasso mancante</span></td>
                      <td><Link href={`/partner/${f.partnerId}`} style={{ fontWeight: 500 }}>{f.partner.nome}</Link></td>
                      <td>Fatt. {f.numero ?? "s.n."} · scaduta {dataIt(f.scadenza)}</td>
                      <td className="num">{euro(ivato(f))}</td>
                    </tr>
                  ))}
                  {bonificiMancanti.map((x) => (
                    <tr key={x.partner.id + x.mese}>
                      <td><span className="badge blue"><span className="dot" />Bonifico non eseguito</span></td>
                      <td><Link href={`/partner/${x.partner.id}`} style={{ fontWeight: 500 }}>{x.partner.nome}</Link></td>
                      <td>Dovuto {nomeMese(x.mese)} {ANNO_CORRENTE}</td>
                      <td className="num">{euro(x.importo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {(registrate.length > 0 || ignorate.length > 0) && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Storico: {registrate.length} registrate · {ignorate.length} ignorate
          </summary>
          <div className="card tight" style={{ marginTop: 12 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th className="num">Importo</th><th>Esito</th><th></th></tr>
                </thead>
                <tbody>
                  {[...registrate, ...ignorate].map((tx) => (
                    <tr key={tx.id}>
                      {rigaTx(tx)}
                      <td style={{ maxWidth: 300 }}>
                        {tx.stato === "registrata" ? (
                          <span className="badge green"><span className="dot" />{tx.esito ?? "Registrata"}</span>
                        ) : (
                          <span className="badge neutral"><span className="dot" />Ignorata</span>
                        )}
                      </td>
                      <td>
                        {tx.stato === "ignorata" && (
                          <form action={ripristinaTransazione.bind(null, tx.id)}>
                            <button className="btn small secondary" type="submit">Ripristina</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {transazioni.length === 0 && !sp.errore && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">⇅</div>
            <div className="empty-title">Nessuna transazione importata</div>
            <div className="empty-text">
              Esporta l&apos;estratto conto dalla tua banca in CSV o Excel e caricalo qui sopra.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
