import type { Partner } from "@prisma/client";

// Form anagrafica partner (usato da /partner/nuovo e /partner/[id]/modifica)
export function PartnerForm({
  partner,
  action,
  submitLabel,
}: {
  partner?: Partner | null;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const p = partner;
  return (
    <form action={action} className="card">
      <div className="form-grid">
        <div className="full">
          <label className="field-label">Nome / insegna <span className="req">*</span></label>
          <input type="text" name="nome" required defaultValue={p?.nome ?? ""} placeholder="Es. PASTICCERIA ROSSI (ROSSI SRL)" />
        </div>
        <div>
          <label className="field-label">Ragione sociale</label>
          <input type="text" name="ragioneSociale" defaultValue={p?.ragioneSociale ?? ""} />
        </div>
        <div>
          <label className="field-label">Categoria</label>
          <input type="text" name="categoria" defaultValue={p?.categoria ?? ""} placeholder="Pasticceria, Fiori, Boutique…" />
        </div>
        <div>
          <label className="field-label">Città / area servita</label>
          <input type="text" name="citta" defaultValue={p?.citta ?? ""} />
        </div>
        <div>
          <label className="field-label">Servizi (tipologia di cliente)</label>
          <input type="text" name="servizi" defaultValue={p?.servizi ?? ""} placeholder="Vendor, Consegne, Magazzino…" />
        </div>
        <div>
          <label className="field-label">Cliente per l&apos;anno</label>
          <select name="clienteAnno" defaultValue={p?.clienteAnno ?? "Nuovo"}>
            <option value="P.P.">P.P. (pari perimetro)</option>
            <option value="Nuovo">Nuovo</option>
            <option value="Dismesso">Dismesso</option>
          </select>
        </div>
        <div>
          <label className="field-label">Fee su vendite (%)</label>
          <input type="number" name="feePercent" step="0.1" min="0" max="100" defaultValue={p?.feePercent ?? ""} />
        </div>
        <div>
          <label className="field-label">GG pagamento fatture (0 = vista fattura)</label>
          <input type="number" name="ggPagamento" step="1" min="0" defaultValue={p?.ggPagamento ?? 0} />
        </div>
        <div>
          <label className="field-label">Debiti 2025 (€)</label>
          <input type="number" name="debiti2025" step="0.01" defaultValue={p?.debiti2025 ?? 0} />
        </div>
        <div>
          <label className="field-label">Crediti 2025 (€)</label>
          <input type="number" name="crediti2025" step="0.01" defaultValue={p?.crediti2025 ?? 0} />
        </div>
        <div>
          <label className="field-label">Piano di rientro debito</label>
          <input type="text" name="pdrDebito" defaultValue={p?.pdrDebito ?? ""} />
        </div>
        <div>
          <label className="field-label">IBAN (per bonifici SEPA)</label>
          <input type="text" name="iban" defaultValue={p?.iban ?? ""} placeholder="IT00 X000 0000 0000 0000 0000 000" />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input type="email" name="email" defaultValue={p?.email ?? ""} />
        </div>
        <div>
          <label className="field-label">Telefono</label>
          <input type="text" name="telefono" defaultValue={p?.telefono ?? ""} />
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="compensazione" name="compensazione" defaultChecked={p?.compensazione ?? false} />
          <label htmlFor="compensazione">Compensazione crediti/incassi</label>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="commissioniADetrazione" name="commissioniADetrazione" defaultChecked={p?.commissioniADetrazione ?? false} />
          <label htmlFor="commissioniADetrazione">Commissioni a detrazione</label>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="addebitoDiretto" name="addebitoDiretto" defaultChecked={p?.addebitoDiretto ?? false} />
          <label htmlFor="addebitoDiretto">Addebito diretto approvato</label>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="cartaCreditoApp" name="cartaCreditoApp" defaultChecked={p?.cartaCreditoApp ?? false} />
          <label htmlFor="cartaCreditoApp">Carta di credito in APP</label>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="attivo" name="attivo" defaultChecked={p?.attivo ?? true} />
          <label htmlFor="attivo">Partner attivo</label>
        </div>
        <div className="full">
          <label className="field-label">Note</label>
          <textarea name="note" rows={3} defaultValue={p?.note ?? ""} />
        </div>
      </div>
      <div className="form-footer">
        <button type="submit" className="btn primary">{submitLabel}</button>
      </div>
    </form>
  );
}
