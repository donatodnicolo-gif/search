import Link from "next/link";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro } from "@/lib/format";
import { qontoConfigurato, qontoOrganizzazione } from "@/lib/qonto";
import { costruisciAnalisi, sommaVoci, CHIAVE_SENZA_SCADENZA } from "@/lib/analisi";

export const dynamic = "force-dynamic";

// ANALISI FINANZIARIA — vista per SCADENZA con split saldato / da saldare.
// Le regole del piano di cassa stanno in `src/lib/analisi.ts`, condivise con la
// scheda del singolo periodo (/analisi/[periodo]): qui c'è solo il quadro
// d'insieme, la liquidità Qonto e la proiezione.

export default async function AnalisiPage() {
  const anno = ANNO_CORRENTE;
  const analisi = await costruisciAnalisi(anno);
  const { righe, totali, senzaData, compensate } = analisi;

  // liquidità attuale da Qonto (facoltativa)
  let saldoBanca: number | null = null;
  let contiBanca = "";
  if (await qontoConfigurato()) {
    try {
      const org = await qontoOrganizzazione();
      const attivi = org.conti.filter((c) => !c.status || c.status === "active");
      saldoBanca = attivi.reduce((a, c) => a + c.balance, 0);
      contiBanca = attivi.map((c) => `${c.name ?? c.slug} ${euro(c.balance)}`).join(" · ");
    } catch {
      saldoBanca = null;
    }
  }

  const totIncassato = totali.incassato;
  const totDaIncassare = totali.daIncassare;
  const totPagato = totali.pagato;
  const totDaPagare = totali.daPagare;
  let cumulato = saldoBanca ?? 0;

  const pct = (fatto: number, tot: number) =>
    tot < 0.01 ? null : `${Math.round((fatto / tot) * 100)}%`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Analisi finanziaria</h1>
          <p className="page-caption">
            Entrate e uscite per mese di scadenza, con lo split tra saldato e da saldare
            {saldoBanca != null ? " — liquidità letta in tempo reale da Qonto" : ""}. Apri un mese
            per vedere fattura per fattura da dove viene il numero.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        {saldoBanca != null && (
          <div className="kpi">
            <div className="kpi-label">Liquidità attuale (Qonto)</div>
            <div className="kpi-value">{euro(saldoBanca)}</div>
            <div className="kpi-sub">{contiBanca}</div>
          </div>
        )}
        <div className="kpi">
          <div className="kpi-label">Entrate — incassato / da incassare</div>
          <div className="kpi-value">
            <span className="pos">{euro(totIncassato)}</span>
            <span className="muted" style={{ fontSize: 16 }}> / {euro(totDaIncassare)}</span>
          </div>
          <div className="kpi-sub">saldato il {pct(totIncassato, totIncassato + totDaIncassare) ?? "—"} del fatturato in analisi</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Uscite — pagato / da pagare</div>
          <div className="kpi-value">
            <span>{euro(totPagato)}</span>
            <span className="neg" style={{ fontSize: 16 }}> / {euro(totDaPagare)}</span>
          </div>
          <div className="kpi-sub">saldato il {pct(totPagato, totPagato + totDaPagare) ?? "—"} del dovuto ai partner</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{saldoBanca != null ? "Liquidità proiettata" : "Differenza partite aperte"}</div>
          <div className={`kpi-value ${(saldoBanca ?? 0) + totDaIncassare - totDaPagare >= 0 ? "pos" : "neg"}`}>
            {euro((saldoBanca ?? 0) + totDaIncassare - totDaPagare)}
          </div>
          <div className="kpi-sub">
            incassando e pagando tutto l&apos;aperto
            {senzaData.importo >= 0.01 ? ` — ma ${euro(senzaData.importo)} non ha una data` : ""}
          </div>
        </div>
      </div>

      {(senzaData.fatture > 0 || compensate.fatture > 0) && (
        <div className="card tight" style={{ marginBottom: 12, fontSize: 13 }}>
          {senzaData.fatture > 0 && (
            <div>
              ⚠️ <strong>{senzaData.fatture} fatture aperte non hanno la scadenza</strong> ({euro(senzaData.importo)} IVA
              inclusa)
              {senzaData.arretrate > 0
                ? `: ${senzaData.fatture - senzaData.arretrate} del ${anno} stanno nella riga «Scadenza non indicata», fuori dal calendario e senza far scattare nessuno «scaduto»; le altre ${senzaData.arretrate} sono di anni chiusi e restano nell'arretrato.`
                : ": stanno nella riga «Scadenza non indicata», fuori dal calendario e senza far scattare nessuno «scaduto»."}{" "}
              La scadenza si compila nella scheda della fattura — finché manca, questo piano vede solo il resto.{" "}
              <Link href={`/analisi/${CHIAVE_SENZA_SCADENZA}`} style={{ fontWeight: 600 }}>
                Vedile una per una →
              </Link>
            </div>
          )}
          {compensate.fatture > 0 && (
            <div style={{ marginTop: senzaData.fatture > 0 ? 6 : 0 }}>
              {compensate.fatture} fatture segnate <strong>compensate</strong> ({euro(compensate.importo)}) sono escluse dal
              «da incassare»: non entrano in banca, si chiudono compensando il dovuto al partner.
            </div>
          )}
        </div>
      )}

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scadenza</th>
                <th className="num">Incassato ✓</th>
                <th className="num">Da incassare</th>
                <th className="num">Pagato ai partner ✓</th>
                <th className="num">Da pagare</th>
                <th className="num">Entrate − uscite</th>
                <th className="num">Saldi aperti</th>
                {saldoBanca != null && <th className="num">Saldo proiettato</th>}
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => {
                const incassato = sommaVoci(r.entrate, true);
                const daIncassare = sommaVoci(r.entrate, false);
                const pagato = sommaVoci(r.uscite, true);
                const daPagare = sommaVoci(r.uscite, false);
                const diffAperta = daIncassare - daPagare; // saldi aperti: solo le partite non chiuse
                const diffTotale = incassato + daIncassare - pagato - daPagare; // tutto ciò che cade nel periodo
                cumulato += diffAperta;
                const senzaData = r.senzaScadenza;
                const scaduto = r.passato && daIncassare >= 0.01;
                const pctMese = pct(incassato + pagato, incassato + daIncassare + pagato + daPagare);
                return (
                  <tr key={r.chiave}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/analisi/${r.chiave}`} title={`Apri il dettaglio di ${r.etichetta}`}>
                        {r.etichetta}
                      </Link>
                      {scaduto && (
                        <span className="badge red" style={{ marginLeft: 8 }}>
                          <span className="dot" />scaduto
                        </span>
                      )}
                      {senzaData && (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          <span className="dot" />data mancante
                        </span>
                      )}
                      {senzaData ? (
                        <span className="muted" style={{ display: "block", fontSize: 11.5, fontWeight: 400 }}>
                          non si sa quando incassa: fuori dal calendario
                        </span>
                      ) : (
                        pctMese && (
                          <span className="muted" style={{ display: "block", fontSize: 11.5, fontWeight: 400 }}>
                            saldato {pctMese}
                          </span>
                        )
                      )}
                      <details style={{ marginTop: 4 }}>
                        <summary className="muted" style={{ cursor: "pointer", fontSize: 12, fontWeight: 400, listStyle: "none" }}>
                          {r.entrate.length} incassi · {r.uscite.length} pagamenti — anteprima
                        </summary>
                        <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 400, display: "grid", gap: 3 }}>
                          {[...r.entrate].sort((a, b) => Number(a.saldata) - Number(b.saldata) || b.importo - a.importo).map((v, i) => (
                            <div key={"e" + i} style={{ opacity: v.saldata ? 0.6 : 1 }}>
                              <span style={{ color: "var(--green)" }}>{v.saldata ? "✓" : "○"} +{euro(v.importo)}</span>{" "}
                              <Link href={`/partner/${v.partnerId}`}>{v.chi}</Link>{" "}
                              <Link href={v.href} className="muted" style={{ textDecoration: "underline", textUnderlineOffset: 2 }} title="Apri il record della fattura">
                                ({v.rif})
                              </Link>
                            </div>
                          ))}
                          {[...r.uscite].sort((a, b) => Number(a.saldata) - Number(b.saldata) || b.importo - a.importo).map((v, i) => (
                            <div key={"u" + i} style={{ opacity: v.saldata ? 0.6 : 1 }}>
                              <span style={{ color: "var(--red)" }}>{v.saldata ? "✓" : "○"} −{euro(v.importo)}</span>{" "}
                              <Link href={`/partner/${v.partnerId}`}>{v.chi}</Link>{" "}
                              <Link href={v.href} className="muted" style={{ textDecoration: "underline", textUnderlineOffset: 2 }} title="Apri il mese nella scheda partner">
                                ({v.rif})
                              </Link>
                            </div>
                          ))}
                          <div style={{ marginTop: 4 }}>
                            <Link href={`/analisi/${r.chiave}`} className="btn small secondary">
                              Apri il dettaglio completo →
                            </Link>
                          </div>
                        </div>
                      </details>
                    </td>
                    <td className="num" style={{ color: "var(--green)", opacity: 0.75 }}>{euro(incassato)}</td>
                    <td className={`num ${scaduto ? "neg" : ""}`} style={{ fontWeight: daIncassare >= 0.01 ? 600 : 400 }}>
                      {euro(daIncassare)}
                    </td>
                    <td className="num" style={{ opacity: 0.75 }}>{euro(pagato)}</td>
                    <td className="num neg" style={{ fontWeight: daPagare >= 0.01 ? 600 : 400 }}>{euro(daPagare)}</td>
                    <td className={`num ${diffTotale >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                      {diffTotale >= 0 ? "+" : ""}{euro(diffTotale)}
                    </td>
                    <td className={`num ${diffAperta >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                      {diffAperta >= 0 ? "+" : ""}{euro(diffAperta)}
                    </td>
                    {saldoBanca != null && (
                      <td className={`num ${cumulato >= 0 ? "" : "neg"}`} style={{ fontWeight: 600 }}>
                        {euro(cumulato)}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                <td>Totale</td>
                <td className="num" style={{ color: "var(--green)" }}>{euro(totIncassato)}</td>
                <td className="num">{euro(totDaIncassare)}</td>
                <td className="num">{euro(totPagato)}</td>
                <td className="num neg">{euro(totDaPagare)}</td>
                <td className={`num ${totIncassato + totDaIncassare - totPagato - totDaPagare >= 0 ? "pos" : "neg"}`}>
                  {totIncassato + totDaIncassare - totPagato - totDaPagare >= 0 ? "+" : ""}
                  {euro(totIncassato + totDaIncassare - totPagato - totDaPagare)}
                </td>
                <td className={`num ${totDaIncassare - totDaPagare >= 0 ? "pos" : "neg"}`}>
                  {totDaIncassare - totDaPagare >= 0 ? "+" : ""}{euro(totDaIncassare - totDaPagare)}
                </td>
                {saldoBanca != null && <td className="num">{euro(cumulato)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Le entrate sono collocate sul mese di <strong>scadenza</strong> delle fatture (✓ = incassata,
        ○ = aperta; il badge &laquo;scaduto&raquo; segnala mesi passati con incassi ancora aperti);
        le uscite sul mese di competenza del dovuto ai partner. <strong>Una fattura aperta senza
        scadenza non finisce su nessun mese</strong>: sta nella riga &laquo;Scadenza non
        indicata&raquo;, perché una data inventata farebbe comparire scaduti che non esistono. Fanno
        eccezione le fatture degli anni chiusi, arretrate a prescindere dal giorno. Di ogni fattura
        si conta il <strong>residuo</strong>, quindi un acconto già incassato figura fra gli incassi.
        <strong> Entrate − uscite</strong> è il netto di tutto ciò che cade nel periodo, saldato
        compreso; <strong>Saldi aperti</strong> è il netto delle sole partite ancora da chiudere —
        ed è quest&apos;ultimo, non il primo, a muovere il saldo proiettato.
        Il saldo proiettato parte dalla liquidità Qonto e somma solo le partite aperte. Le fatture
        incassate degli anni precedenti sono escluse; l&apos;arretrato non saldato è nella prima riga.
      </p>
    </>
  );
}
