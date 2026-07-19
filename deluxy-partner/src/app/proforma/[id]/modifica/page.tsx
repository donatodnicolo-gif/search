import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateProForma } from "@/lib/proforma-actions";
import { rifProForma } from "@/lib/proforma";
import { RigheProForma } from "@/components/RigheProForma";

export const dynamic = "force-dynamic";

// Modifica di una pro-forma in bozza. I documenti già inviati/fatturati/
// annullati non si toccano: prima vanno riportati in bozza dal dettaglio.
export default async function ModificaProForma({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pf = await prisma.proForma.findUnique({
    where: { id },
    include: { partner: true, righe: { orderBy: { ordine: "asc" } } },
  });
  if (!pf) notFound();
  if (pf.stato !== "bozza") redirect(`/proforma/${id}`);

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const numIt = (v: number) => String(v).replace(".", ",");

  return (
    <>
      <div className="page-head">
        <div>
          <Link href={`/proforma/${id}`} className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna al documento
          </Link>
          <h1 className="page-title">Modifica {rifProForma(pf)}</h1>
          <p className="page-caption">{pf.partner.nome} — modifica consentita finché il documento è in bozza.</p>
        </div>
      </div>

      <form action={updateProForma.bind(null, id)} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Data documento <span className="req">*</span></label>
            <input type="date" name="data" required defaultValue={iso(pf.data)} />
          </div>
          <div>
            <label className="field-label">Termine di pagamento proposto</label>
            <input type="date" name="scadenza" defaultValue={iso(pf.scadenza)} />
          </div>
          <div className="full">
            <label className="field-label">Oggetto</label>
            <input type="text" name="oggetto" defaultValue={pf.oggetto ?? ""} />
          </div>

          <RigheProForma
            iniziali={pf.righe.map((r) => ({
              descrizione: r.descrizione,
              quantita: numIt(r.quantita),
              prezzoUnitario: numIt(r.prezzoUnitario),
              aliquotaIva: numIt(r.aliquotaIva),
            }))}
          />

          <div className="full">
            <label className="field-label">Note in calce</label>
            <textarea name="note" rows={3} defaultValue={pf.note ?? ""} />
          </div>
        </div>
        <div className="form-footer">
          <button type="submit" className="btn primary">Salva modifiche</button>
        </div>
      </form>
    </>
  );
}
