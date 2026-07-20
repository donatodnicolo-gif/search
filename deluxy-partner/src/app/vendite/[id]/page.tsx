import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/format";
import { nomeMese, MESI, commissione, dovutoVendita } from "@/lib/calc";
import { updateVendita, deleteVendita } from "@/lib/actions";

export const dynamic = "force-dynamic";

// Scheda della singola vendita come vendor: modifica di incasso, fee, periodo.
export default async function VenditaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvato?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const vendita = await prisma.venditaVendor.findUnique({
    where: { id },
    include: { partner: true },
  });
  if (!vendita) notFound();

  const action = updateVendita.bind(null, id);
  const dataIso = vendita.data ? vendita.data.toISOString().slice(0, 10) : "";

  return (
    <>
      <div className="page-head">
        <div>
          <Link href={`/partner/${vendita.partnerId}#mese-${vendita.mese}`} className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna alla scheda partner
          </Link>
          <h1 className="page-title">Vendita come vendor</h1>
          <p className="page-caption">
            <Link href={`/partner/${vendita.partnerId}`} style={{ color: "var(--blue)" }}>{vendita.partner.nome}</Link>
            {" "}· {nomeMese(vendita.mese)} {vendita.anno}
          </p>
        </div>
        <div className="page-actions">
          <form action={deleteVendita.bind(null, id)}>
            <button className="btn danger" type="submit" title="Elimina questa vendita">Elimina</button>
          </form>
        </div>
      </div>

      {sp.salvato && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Vendita aggiornata</span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Incasso lordo</div>
          <div className="kpi-value">{euro(vendita.incassoLordo)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Commissione Deluxy (fee {vendita.feePercent}%)</div>
          <div className="kpi-value pos">{euro(commissione(vendita))}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dovuto al partner</div>
          <div className="kpi-value">{euro(dovutoVendita(vendita))}</div>
          <div className="kpi-sub">incasso meno commissione IVATA</div>
        </div>
      </div>

      {vendita.feePercent !== (vendita.partner.feePercent ?? 0) && (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--gold-soft)", border: "1px solid var(--hairline)" }}>
          <span style={{ fontSize: 13.5 }}>
            La fee di questa vendita ({vendita.feePercent}%) è diversa dalla fee attuale del partner
            ({vendita.partner.feePercent ?? 0}%). Aggiornala qui sotto, oppure usa «Riallinea fee vendite»
            nella scheda partner per applicarla a tutte le vendite {vendita.anno}.
          </span>
        </div>
      )}

      <h2 className="section-title">Modifica record</h2>
      <form action={action} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Incasso lordo € <span className="req">*</span></label>
            <input type="number" name="incassoLordo" required step="0.01" min="0" defaultValue={vendita.incassoLordo} />
          </div>
          <div>
            <label className="field-label">Fee % <span className="req">*</span></label>
            <input type="number" name="feePercent" required step="0.1" min="0" max="100" defaultValue={vendita.feePercent} />
          </div>
          <div>
            <label className="field-label">Mese di competenza <span className="req">*</span></label>
            <select name="mese" required defaultValue={vendita.mese}>
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Anno <span className="req">*</span></label>
            <input type="number" name="anno" required step="1" defaultValue={vendita.anno} />
          </div>
          <div>
            <label className="field-label">Data vendita</label>
            <input type="date" name="data" defaultValue={dataIso} />
          </div>
          <div className="full">
            <label className="field-label">Descrizione</label>
            <input type="text" name="descrizione" defaultValue={vendita.descrizione ?? ""} />
          </div>
        </div>
        <div className="form-footer">
          <button type="submit" className="btn primary">Salva modifiche</button>
        </div>
      </form>
    </>
  );
}
