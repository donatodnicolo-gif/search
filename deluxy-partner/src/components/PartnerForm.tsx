import type { Partner } from "@prisma/client";
import type { Anagrafica } from "@/lib/anagrafiche";

// Form anagrafica partner (usato da /partner/nuovo e /partner/[id]/modifica)
export function PartnerForm({
  partner,
  action,
  submitLabel,
  anagrafica,
}: {
  partner?: Partner | null;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  // Record del registro Anagrafiche (fonte di verità dei dati anagrafici). Quando
  // presente, i campi anagrafici (ragione sociale, IBAN, email, telefono, contatto
  // amministrativo) sono precompilati da qui; al salvataggio tornano nel registro.
  anagrafica?: Anagrafica | null;
}) {
  const p = partner;
  const fin = anagrafica?.datiFinanziari;
  // ragione sociale: sola lettura dal registro; gli altri anagrafici: editabili
  // ma precompilati dal registro (fallback alla cache locale).
  const ragioneSociale = anagrafica?.ragioneSociale ?? p?.ragioneSociale ?? "";
  const ibanReg = fin?.iban ?? p?.iban ?? "";
  const emailReg = anagrafica?.email ?? p?.email ?? "";
  const telefonoReg = anagrafica?.telefono ?? p?.telefono ?? "";
  const ammNomeReg = fin?.amministrazioneNome ?? p?.ammNome ?? "";
  const ammEmailReg = fin?.amministrazioneEmail ?? p?.ammEmail ?? "";
  const ammTelefonoReg = fin?.amministrazioneTelefono ?? p?.ammTelefono ?? "";
  const collegato = Boolean(anagrafica);
  return (
    <form action={action} className="card">
      <div className="form-grid">
        <div className="full">
          <label className="field-label">Nome / insegna <span className="req">*</span></label>
          <input type="text" name="nome" required defaultValue={p?.nome ?? ""} placeholder="Es. PASTICCERIA ROSSI (ROSSI SRL)" />
        </div>
        <div>
          <label className="field-label">
            Ragione sociale{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>· dal registro</span>
          </label>
          <input
            type="text"
            value={ragioneSociale}
            readOnly
            disabled
            placeholder="dal registro Anagrafiche (dopo la riconciliazione)"
            title="La denominazione legale è centralizzata nel registro Anagrafiche e si modifica lì, non qui."
            style={{ background: "var(--bg)", color: "var(--text-secondary)", cursor: "not-allowed" }}
          />
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
          <label className="field-label">
            IBAN (per bonifici SEPA){collegato && <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · nel registro</span>}
          </label>
          <input type="text" name="iban" defaultValue={ibanReg} placeholder="IT00 X000 0000 0000 0000 0000 000" />
        </div>
        <div>
          <label className="field-label">
            Email{collegato && <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · nel registro</span>}
          </label>
          <input type="email" name="email" defaultValue={emailReg} />
        </div>
        <div>
          <label className="field-label">
            Telefono{collegato && <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · nel registro</span>}
          </label>
          <input type="text" name="telefono" defaultValue={telefonoReg} />
        </div>

        <div className="full" style={{ marginTop: 4 }}>
          <div className="field-label" style={{ fontWeight: 600, color: "var(--text)" }}>
            Contatto amministrativo
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            Chi si occupa dei pagamenti: è il destinatario predefinito di solleciti e pro-forma.
            {collegato
              ? " Nome, email e telefono sono precompilati dal registro Anagrafiche e, al salvataggio, vi tornano scritti."
              : " Dalla scheda partner puoi importarlo dal registro Anagrafiche."}
          </p>
        </div>
        <div>
          <label className="field-label">
            Nome referente{collegato && <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · nel registro</span>}
          </label>
          <input type="text" name="ammNome" defaultValue={ammNomeReg} placeholder="es. Maria Rossi" />
        </div>
        <div>
          <label className="field-label">Ruolo</label>
          <input type="text" name="ammRuolo" defaultValue={p?.ammRuolo ?? ""} placeholder="es. Amministrazione" />
        </div>
        <div>
          <label className="field-label">
            Email amministrazione{collegato && <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · nel registro</span>}
          </label>
          <input type="email" name="ammEmail" defaultValue={ammEmailReg} placeholder="amministrazione@…" />
        </div>
        <div>
          <label className="field-label">
            Telefono amministrazione{collegato && <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · nel registro</span>}
          </label>
          <input type="text" name="ammTelefono" defaultValue={ammTelefonoReg} />
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
