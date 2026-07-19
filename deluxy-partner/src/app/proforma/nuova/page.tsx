import { prisma } from "@/lib/db";
import { createProForma } from "@/lib/proforma-actions";
import { RigheProForma } from "@/components/RigheProForma";

export const dynamic = "force-dynamic";

// Creazione di una pro-forma ad hoc: partner, date, oggetto e righe libere.
// Il numero progressivo (PF n/anno) viene assegnato al salvataggio.
export default async function NuovaProForma({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  const sp = await searchParams;
  const partners = await prisma.partner.findMany({ where: { attivo: true }, orderBy: { nome: "asc" } });
  const oggi = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuova pro-forma</h1>
          <p className="page-caption">
            Documento non fiscale da inviare al partner: il numero PF viene assegnato al salvataggio.
          </p>
        </div>
      </div>

      <form action={createProForma} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Partner <span className="req">*</span></label>
            <select name="partnerId" required defaultValue={sp.partnerId ?? ""}>
              <option value="" disabled>Seleziona partner…</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Data documento <span className="req">*</span></label>
            <input type="date" name="data" required defaultValue={oggi} />
          </div>
          <div>
            <label className="field-label">Termine di pagamento proposto</label>
            <input type="date" name="scadenza" />
          </div>
          <div className="full">
            <label className="field-label">Oggetto</label>
            <input type="text" name="oggetto" placeholder="es. Servizi di consegna evento Fondazione Prada" />
          </div>

          <RigheProForma />

          <div className="full">
            <label className="field-label">Note in calce (condizioni, coordinate bancarie…)</label>
            <textarea
              name="note"
              rows={3}
              placeholder="es. Pagamento a mezzo bonifico su IBAN IT00… — la fattura definitiva sarà emessa al saldo."
            />
          </div>
        </div>
        <div className="form-footer">
          <button type="submit" className="btn primary">Crea pro-forma</button>
        </div>
      </form>
    </>
  );
}
