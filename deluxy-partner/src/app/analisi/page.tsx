import Link from "next/link";
import { prisma } from "@/lib/db";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { ivato, nomeMese } from "@/lib/calc";
import { qontoConfigurato, qontoOrganizzazione } from "@/lib/qonto";

export const dynamic = "force-dynamic";

// ANALISI FINANZIARIA — vista per SCADENZA con split saldato / da saldare.
// Entrate = fatture servizi (IVATE) sul mese di scadenza, divise tra incassate
// e da incassare; uscite = dovuti ai partner per competenza, divisi tra pagati
// e da pagare. Il saldo proiettato parte dalla liquidità reale Qonto e somma
// solo le partite ancora aperte.

type Voce = { chi: string; partnerId: string; rif: string; importo: number; saldata: boolean };
type Bucket = {
  chiave: string;
  etichetta: string;
  passato: boolean;
  entrate: Voce[];
  uscite: Voce[];
};

export default async function AnalisiPage() {
  const anno = ANNO_CORRENTE;
  const oggi = new Date();
  const meseCorrente = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1));
  const inizioAnno = new Date(Date.UTC(anno, 0, 1));

  const [fatture, tutti] = await Promise.all([
    // tutte le fatture con importo: le saldate degli anni passati non servono,
    // le aperte sì (sono arretrato da incassare)
    prisma.fatturaServizio.findMany({
      where: { imponibile: { gt: 0 }, OR: [{ anno }, { pagata: false }] },
      include: { partner: true },
    }),
    riepilogoTutti(anno),
  ]);

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

  // ---- bucket per mese di scadenza ----
  const buckets = new Map<string, Bucket>();
  const bucket = (d: Date): Bucket => {
    const inizio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const precedente = inizio < inizioAnno;
    const chiave = precedente
      ? "0-precedenti"
      : `${inizio.getUTCFullYear()}-${String(inizio.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(chiave)) {
      buckets.set(chiave, {
        chiave,
        etichetta: precedente
          ? `${anno - 1} e precedenti`
          : `${nomeMese(inizio.getUTCMonth() + 1)} ${inizio.getUTCFullYear()}`,
        passato: inizio < meseCorrente,
        entrate: [],
        uscite: [],
      });
    }
    return buckets.get(chiave)!;
  };

  // ENTRATE per scadenza (fallback: fine mese di competenza), split saldato/no
  for (const f of fatture) {
    const rifData = f.scadenza ?? new Date(Date.UTC(f.anno, f.mese - 1, 28));
    bucket(rifData).entrate.push({
      chi: f.partner.nome,
      partnerId: f.partnerId,
      rif: `fatt. ${f.numero ?? "s.n."}${f.scadenza ? ` · scad. ${dataIt(f.scadenza)}` : ` · ${nomeMese(f.mese)} ${f.anno}`}${f.pagata && f.dataPagamento ? ` · incassata ${dataIt(f.dataPagamento)}` : ""}`,
      importo: ivato(f),
      saldata: f.pagata,
    });
  }

  // USCITE per competenza, split pagato/da pagare
  for (const t of tutti) {
    for (const m of t.mesi) {
      const r = m.riepilogo;
      const dataComp = new Date(Date.UTC(anno, m.mese - 1, 28));
      if (r.bonificoInviato >= 0.01) {
        bucket(dataComp).uscite.push({
          chi: t.partner.nome,
          partnerId: t.partner.id,
          rif: `dovuto ${nomeMese(m.mese)} ${anno}`,
          importo: r.bonificoInviato,
          saldata: true,
        });
      }
      if (r.daBonificare >= 0.01) {
        bucket(dataComp).uscite.push({
          chi: t.partner.nome,
          partnerId: t.partner.id,
          rif: `dovuto ${nomeMese(m.mese)} ${anno}`,
          importo: r.daBonificare,
          saldata: false,
        });
      }
    }
  }

  const righe = [...buckets.values()].sort((a, b) => a.chiave.localeCompare(b.chiave));
  const somma = (v: Voce[], saldata: boolean) =>
    v.filter((x) => x.saldata === saldata).reduce((a, x) => a + x.importo, 0);

  const totIncassato = righe.reduce((a, r) => a + somma(r.entrate, true), 0);
  const totDaIncassare = righe.reduce((a, r) => a + somma(r.entrate, false), 0);
  const totPagato = righe.reduce((a, r) => a + somma(r.uscite, true), 0);
  const totDaPagare = righe.reduce((a, r) => a + somma(r.uscite, false), 0);
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
            {saldoBanca != null ? " — liquidità letta in tempo reale da Qonto" : ""}.
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
          <div className="kpi-sub">incassando e pagando tutto l&apos;aperto</div>
        </div>
      </div>

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
                <th className="num">Differenza aperta</th>
                {saldoBanca != null && <th className="num">Saldo proiettato</th>}
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => {
                const incassato = somma(r.entrate, true);
                const daIncassare = somma(r.entrate, false);
                const pagato = somma(r.uscite, true);
                const daPagare = somma(r.uscite, false);
                const diffAperta = daIncassare - daPagare;
                cumulato += diffAperta;
                const scaduto = r.passato && daIncassare >= 0.01;
                const pctMese = pct(incassato + pagato, incassato + daIncassare + pagato + daPagare);
                return (
                  <tr key={r.chiave}>
                    <td style={{ fontWeight: 600 }}>
                      {r.etichetta}
                      {scaduto && (
                        <span className="badge red" style={{ marginLeft: 8 }}>
                          <span className="dot" />scaduto
                        </span>
                      )}
                      {pctMese && (
                        <span className="muted" style={{ display: "block", fontSize: 11.5, fontWeight: 400 }}>
                          saldato {pctMese}
                        </span>
                      )}
                      <details style={{ marginTop: 4 }}>
                        <summary className="muted" style={{ cursor: "pointer", fontSize: 12, fontWeight: 400, listStyle: "none" }}>
                          {r.entrate.length} incassi · {r.uscite.length} pagamenti — dettaglio
                        </summary>
                        <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 400, display: "grid", gap: 3 }}>
                          {[...r.entrate].sort((a, b) => Number(a.saldata) - Number(b.saldata) || b.importo - a.importo).map((v, i) => (
                            <div key={"e" + i} style={{ opacity: v.saldata ? 0.6 : 1 }}>
                              <span style={{ color: "var(--green)" }}>{v.saldata ? "✓" : "○"} +{euro(v.importo)}</span>{" "}
                              <Link href={`/partner/${v.partnerId}`}>{v.chi}</Link>{" "}
                              <span className="muted">({v.rif})</span>
                            </div>
                          ))}
                          {[...r.uscite].sort((a, b) => Number(a.saldata) - Number(b.saldata) || b.importo - a.importo).map((v, i) => (
                            <div key={"u" + i} style={{ opacity: v.saldata ? 0.6 : 1 }}>
                              <span style={{ color: "var(--red)" }}>{v.saldata ? "✓" : "○"} −{euro(v.importo)}</span>{" "}
                              <Link href={`/partner/${v.partnerId}`}>{v.chi}</Link>{" "}
                              <span className="muted">({v.rif})</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td className="num" style={{ color: "var(--green)", opacity: 0.75 }}>{euro(incassato)}</td>
                    <td className={`num ${scaduto ? "neg" : ""}`} style={{ fontWeight: daIncassare >= 0.01 ? 600 : 400 }}>
                      {euro(daIncassare)}
                    </td>
                    <td className="num" style={{ opacity: 0.75 }}>{euro(pagato)}</td>
                    <td className="num neg" style={{ fontWeight: daPagare >= 0.01 ? 600 : 400 }}>{euro(daPagare)}</td>
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
        le uscite sul mese di competenza del dovuto ai partner. Il saldo proiettato parte dalla
        liquidità Qonto e somma solo le partite aperte. Le fatture incassate degli anni precedenti
        sono escluse; l&apos;arretrato non saldato è nella prima riga.
      </p>
    </>
  );
}
