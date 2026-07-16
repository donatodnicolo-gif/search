import { PartnerForm } from "@/components/PartnerForm";
import { createPartner } from "@/lib/actions";

export default function NuovoPartner() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuovo partner</h1>
          <p className="page-caption">Anagrafica e condizioni amministrative del partner.</p>
        </div>
      </div>
      <PartnerForm action={createPartner} submitLabel="Crea partner" />
    </>
  );
}
