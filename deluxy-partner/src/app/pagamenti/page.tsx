import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { ordinanteSepa } from "@/lib/sepa";
import { STATI_PAG } from "@/lib/pagamenti";

export const dynamic = "force-dynamic";

export default async function PagamentiDirettiPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string }>;
}) {
  const sp = await searchParams;
  const [pagamenti, ordinante] = await Promise.all([
    prisma.pagamentoDiretto.findMany({
      where: sp.stato ? { stato: sp.stato } : {},
      orderBy: [{ createdAt: "desc" }],
    }),
    ordinanteSepa(),
  ]);

  const daPagare = pagamenti.filter((p) => p.stato === "predisposto");
  const totaleDaPagare = daPagare.reduce((a, p) => a + p.importo, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Pagamenti diretti</h1>
          <p className="page-caption">
            Bonifici ai fornitori: foto dei dati bancari → l&apos;AI li legge → file SEPA da autorizzare in banca.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/pagamenti/nuova" className="btn primary">+ Nuovo pagamento</Link>
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--fill)", borderStyle: "dashed" }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          🔒 L&apos;app <strong>non esegue pagamenti</strong>: predispone il bonifico e genera il file SEPA, che
          <strong> autorizzi tu</strong> in Qonto o nell&apos;home banking. Nessun addebito parte in automatico.
        </span>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Da pagare (predisposti)</div>
          <div className={`kpi-value ${daPagare.length ? "neg" : "pos"}`}>{euro(totaleDaPagare)}</div>
          <div className="kpi-sub">{daPagare.length} bonifici pronti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pagati</div>
          <div className="kpi-value">{pagamenti.filter((p) => p.stato === "pagato").length}</div>
          <div className="kpi-sub">{euro(pagamenti.filter((p) => p.stato === "pagato").reduce((a, p) => a + p.importo, 0))} totali</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Conto ordinante SEPA</div>
          <div className="kpi-value" style={{ fontSize: 15, fontWeight: 600 }}>
            {ordinante ? ordinante.nome : <span className="neg">non impostato</span>}
          </div>
          <div className="kpi-sub">
            {ordinante
              ? "pronto per generare i file SEPA"
              : <Link href="/impostazioni" style={{ color: "var(--blue)" }}>impostalo in Impostazioni</Link>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {Object.entries(STATI_PAG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {pagamenti.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun pagamento</div>
            <div className="empty-text">
              Crea il primo con &laquo;+ Nuovo pagamento&raquo;: carichi la foto dei dati bancari e l&apos;AI compila il bonifico.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Beneficiario</th><th>IBAN</th><th className="num">Importo</th>
                  <th>Causale</th><th>Creato</th><th>Stato</th><th></th>
                </tr>
              </thead>
              <tbody>
                {pagamenti.map((p) => {
                  const st = STATI_PAG[p.stato] ?? STATI_PAG.predisposto;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/pagamenti/${p.id}`} style={{ fontWeight: 500, color: "var(--blue)" }}>
                          {p.beneficiario}
                        </Link>
                        {p.fornitore && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{p.fornitore}</div>}
                      </td>
                      <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
                        {p.iban.replace(/(.{4})/g, "$1 ").trim()}
                        {!p.ibanValido && <span className="badge red" style={{ marginLeft: 6 }}><span className="dot" />?</span>}
                      </td>
                      <td className="num">{euro(p.importo)}</td>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.causale ?? "—"}</td>
                      <td>{dataIt(p.createdAt)}</td>
                      <td><span className={`badge ${st.badge}`}><span className="dot" />{st.label}</span></td>
                      <td><Link href={`/pagamenti/${p.id}`} className="btn small secondary">Apri</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
