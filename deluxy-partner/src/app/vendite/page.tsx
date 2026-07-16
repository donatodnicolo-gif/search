import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt, pctIt } from "@/lib/format";
import { nomeMese, MESI, commissione, dovutoVendita } from "@/lib/calc";
import { deleteVendita } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function VenditePage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; mese?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? parseInt(sp.anno) : ANNO_CORRENTE;
  const mese = sp.mese ? parseInt(sp.mese) : undefined;

  const vendite = await prisma.venditaVendor.findMany({
    where: { anno, ...(mese ? { mese } : {}) },
    include: { partner: true },
    orderBy: [{ mese: "desc" }, { partner: { nome: "asc" } }],
  });

  const totIncasso = vendite.reduce((a, v) => a + v.incassoLordo, 0);
  const totComm = vendite.reduce((a, v) => a + commissione(v), 0);
  const totDovuto = vendite.reduce((a, v) => a + dovutoVendita(v), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Vendite come vendor</h1>
          <p className="page-caption">
            Vendite fatte da Deluxy per conto dei partner: incassi, commissioni e dovuto.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/vendite/nuova" className="btn primary">+ Nuova vendita</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Incasso vendite (periodo)</div>
          <div className="kpi-value">{euro(totIncasso)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Commissioni Deluxy (netto IVA)</div>
          <div className="kpi-value pos">{euro(totComm)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dovuto ai partner</div>
          <div className="kpi-value">{euro(totDovuto)}</div>
          <div className="kpi-sub">incassi meno commissioni IVATE</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="mese" defaultValue={sp.mese ?? ""}>
            <option value="">Tutto l&apos;anno</option>
            {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="hidden" name="anno" value={anno} />
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {vendite.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessuna vendita</div>
            <div className="empty-text">Registra la prima vendita come vendor per questo periodo.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Mese</th>
                  <th>Descrizione</th>
                  <th className="num">Incasso</th>
                  <th className="num">Fee</th>
                  <th className="num">Commissione</th>
                  <th className="num">Dovuto al partner</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vendite.map((v) => (
                  <tr key={v.id}>
                    <td><Link href={`/partner/${v.partnerId}`} style={{ fontWeight: 500 }}>{v.partner.nome}</Link></td>
                    <td>{nomeMese(v.mese)}{v.data ? ` · ${dataIt(v.data)}` : ""}</td>
                    <td className="muted">{v.descrizione ?? "—"}</td>
                    <td className="num">{euro(v.incassoLordo)}</td>
                    <td className="num">{pctIt(v.feePercent)}</td>
                    <td className="num pos">{euro(commissione(v))}</td>
                    <td className="num">{euro(dovutoVendita(v))}</td>
                    <td>
                      <form action={deleteVendita.bind(null, v.id)}>
                        <button className="btn small danger" type="submit">Elimina</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
