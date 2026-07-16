import { prisma } from "@/lib/db";
import { createVendita } from "@/lib/actions";
import { ANNO_CORRENTE } from "@/lib/queries";
import { MESI } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function NuovaVendita({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  const sp = await searchParams;
  const partners = await prisma.partner.findMany({
    where: { attivo: true },
    orderBy: { nome: "asc" },
  });
  const meseCorrente = new Date().getMonth() + 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuova vendita come vendor</h1>
          <p className="page-caption">
            Vendita fatta da Deluxy per conto del partner. Commissione e dovuto sono calcolati
            automaticamente dalla fee del partner.
          </p>
        </div>
      </div>

      <form action={createVendita} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Partner <span className="req">*</span></label>
            <select name="partnerId" required defaultValue={sp.partnerId ?? ""}>
              <option value="" disabled>Seleziona partner…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.feePercent != null ? ` — fee ${p.feePercent}%` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Incasso lordo € <span className="req">*</span></label>
            <input type="number" name="incassoLordo" required step="0.01" min="0" placeholder="0,00" />
          </div>
          <div>
            <label className="field-label">Mese di competenza <span className="req">*</span></label>
            <select name="mese" required defaultValue={meseCorrente}>
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Anno <span className="req">*</span></label>
            <input type="number" name="anno" required defaultValue={ANNO_CORRENTE} step="1" />
          </div>
          <div>
            <label className="field-label">Data vendita</label>
            <input type="date" name="data" />
          </div>
          <div>
            <label className="field-label">Fee % (vuota = fee del partner)</label>
            <input type="number" name="feePercent" step="0.1" min="0" max="100" placeholder="dal profilo partner" />
          </div>
          <div className="full">
            <label className="field-label">Descrizione</label>
            <input type="text" name="descrizione" placeholder="es. Ordine n. 1234 — bouquet peonie" />
          </div>
        </div>
        <div className="form-footer">
          <button type="submit" className="btn primary">Registra vendita</button>
        </div>
      </form>
    </>
  );
}
