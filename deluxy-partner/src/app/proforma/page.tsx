import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { totaliProForma, rifProForma, STATI_PF } from "@/lib/proforma";
import { ThSort, ordina } from "@/components/ThSort";

export const dynamic = "force-dynamic";

export default async function ProFormaListPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; stato?: string; partnerId?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? parseInt(sp.anno) : ANNO_CORRENTE;

  const [partners, proformeRaw] = await Promise.all([
    prisma.partner.findMany({ orderBy: { nome: "asc" } }),
    prisma.proForma.findMany({
      where: {
        anno,
        ...(sp.stato ? { stato: sp.stato } : {}),
        ...(sp.partnerId ? { partnerId: sp.partnerId } : {}),
      },
      include: { partner: true, righe: { orderBy: { ordine: "asc" } } },
      orderBy: [{ numero: "desc" }],
    }),
  ]);

  let proforme = proformeRaw.map((p) => ({ ...p, totali: totaliProForma(p.righe) }));

  type P = (typeof proforme)[number];
  const campi: Record<string, (p: P) => string | number | Date | null> = {
    numero: (p) => p.numero,
    partner: (p) => p.partner.nome,
    data: (p) => p.data,
    scadenza: (p) => p.scadenza,
    totale: (p) => p.totali.totale,
    stato: (p) => p.stato,
  };
  if (sp.sort && campi[sp.sort]) proforme = ordina(proforme, campi[sp.sort], sp.dir);

  const attive = proforme.filter((p) => p.stato !== "annullata");
  const inAttesa = proforme.filter((p) => p.stato === "inviata");
  const fatturate = proforme.filter((p) => p.stato === "fatturata");

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Pro-forma</h1>
          <p className="page-caption">
            Fatture pro-forma da inviare ai partner: alla conferma diventano fattura, altrimenti si annullano.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/proforma/nuova" className="btn primary">+ Nuova pro-forma</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Emesse nel {anno}</div>
          <div className="kpi-value">{euro(attive.reduce((a, p) => a + p.totali.totale, 0))}</div>
          <div className="kpi-sub">{attive.length} pro-forma (escluse annullate)</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Inviate, in attesa di esito</div>
          <div className={`kpi-value ${inAttesa.length > 0 ? "neg" : ""}`}>
            {euro(inAttesa.reduce((a, p) => a + p.totali.totale, 0))}
          </div>
          <div className="kpi-sub">{inAttesa.length} da confermare o annullare</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Andate a fattura</div>
          <div className="kpi-value pos">{euro(fatturate.reduce((a, p) => a + p.totali.totale, 0))}</div>
          <div className="kpi-sub">{fatturate.length} confermate</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {Object.entries(STATI_PF).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select name="partnerId" defaultValue={sp.partnerId ?? ""}>
            <option value="">Tutti i partner</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input type="hidden" name="anno" value={anno} />
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {proforme.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessuna pro-forma</div>
            <div className="empty-text">
              Crea la prima con &laquo;+ Nuova pro-forma&raquo;: la prepari, la invii al partner e ne segui l&apos;esito da qui.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <ThSort label="N°" campo="numero" sp={sp} path="/proforma" />
                  <ThSort label="Partner" campo="partner" sp={sp} path="/proforma" />
                  <ThSort label="Data" campo="data" sp={sp} path="/proforma" />
                  <th>Oggetto</th>
                  <ThSort label="Scadenza" campo="scadenza" sp={sp} path="/proforma" />
                  <ThSort label="Totale doc." campo="totale" sp={sp} path="/proforma" num />
                  <ThSort label="Stato" campo="stato" sp={sp} path="/proforma" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {proforme.map((p) => {
                  const st = STATI_PF[p.stato] ?? STATI_PF.bozza;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/proforma/${p.id}`} style={{ color: "var(--blue)", fontWeight: 500 }}>
                          {rifProForma(p)}
                        </Link>
                      </td>
                      <td><Link href={`/partner/${p.partnerId}`} style={{ fontWeight: 500 }}>{p.partner.nome}</Link></td>
                      <td>{dataIt(p.data)}</td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.oggetto ?? "—"}
                      </td>
                      <td>{dataIt(p.scadenza)}</td>
                      <td className="num">{euro(p.totali.totale)}</td>
                      <td>
                        <span className={`badge ${st.badge}`}>
                          <span className="dot" />
                          {st.label}
                          {p.stato === "fatturata" && p.fatturaNumero ? ` n. ${p.fatturaNumero}` : ""}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link href={`/proforma/${p.id}`} className="btn small secondary">Apri</Link>
                      </td>
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
