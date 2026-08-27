import type { Partner } from "@prisma/client";
import type { Anagrafica } from "@/lib/anagrafiche";
import { BottoneInvio } from "@/components/BottoneInvio";
import { SceltaGruppo } from "@/components/SceltaGruppo";
import type { SuggerimentoGruppo } from "@/lib/gruppi";

// Form anagrafica partner (usato da /partner/nuovo e /partner/[id]/modifica)
export function PartnerForm({
  partner,
  action,
  submitLabel,
  anagrafica,
  gruppi,
}: {
  partner?: Partner | null;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  // Record del registro Anagrafiche (fonte di verità dei dati anagrafici). Quando
  // presente, i campi anagrafici (ragione sociale, IBAN, email, telefono, contatto
  // amministrativo) sono precompilati da qui; al salvataggio tornano nel registro.
  anagrafica?: Anagrafica | null;
  // Gruppi da suggerire nel campo «Gruppo di pagamento»: quelli gia in uso e
  // le insegne che si ripetono. Farli riscrivere a mano significa ritrovarsi
  // «CHANEL» e «Chanel» come due gruppi diversi.
  gruppi?: SuggerimentoGruppo[];
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
  // Dati FISCALI: vivono nel registro, ma si modificano anche da qui — al
  // salvataggio ci tornano scritti. Prima erano in sola lettura e per
  // correggere un codice SDI bisognava cambiare app.
  const pIvaReg = anagrafica?.pIva ?? "";
  const cfReg = anagrafica?.codiceFiscale ?? "";
  const sdiReg = fin?.codiceSdi ?? "";
  const pecReg = fin?.pec ?? "";
  const indirizzoReg = anagrafica?.indirizzo ?? "";
  const cittaFattReg = anagrafica?.citta ?? "";
  const provinciaReg = anagrafica?.provincia ?? "";
  return (
    <form action={action} className="card">
      {/* Form lungo (~30 campi): diviso in sezioni con titolo (Libro UX cap. 4)
          così i dati commerciali, fiscali, del contatto e le opzioni non sono
          una parete unica di input. */}
      <section className="form-section">
        <h2 className="section-title" style={{ marginTop: 0 }}>Anagrafica e condizioni</h2>
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
          <label className="field-label">Gruppo di pagamento</label>
          <SceltaGruppo
            name="gruppo"
            valore={p?.gruppo ?? ""}
            suggerimenti={gruppi ?? []}
            nomePartner={p?.nome}
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
        </div>
      </section>

      <section className="form-section">
        <h2 className="section-title">Dati fiscali e di fatturazione</h2>
        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
          Sono quelli che finiscono sulla fattura elettronica. Si salvano nel registro <strong>Anagrafiche</strong>,
          che resta la fonte unica: modificandoli qui, li vedranno anche le altre app.
        </p>
        <div className="form-grid">
        <div>
          <label className="field-label">Partita IVA</label>
          <input type="text" name="pIva" defaultValue={pIvaReg} placeholder="es. 12514031009" />
        </div>
        <div>
          <label className="field-label">Codice fiscale</label>
          <input type="text" name="codiceFiscale" defaultValue={cfReg} />
        </div>
        <div>
          <label className="field-label">Codice destinatario (SDI)</label>
          <input type="text" name="codiceSdi" defaultValue={sdiReg} placeholder="7 caratteri, es. M5UXCR1" maxLength={7} style={{ textTransform: "uppercase" }} />
        </div>
        <div>
          <label className="field-label">PEC</label>
          <input type="email" name="pec" defaultValue={pecReg} placeholder="alternativa al codice SDI" />
        </div>
        <div className="full">
          <label className="field-label">Indirizzo di fatturazione</label>
          <input type="text" name="indirizzoFatt" defaultValue={indirizzoReg} placeholder="Via e numero civico, CAP, città" />
        </div>
        <div>
          <label className="field-label">Città (fatturazione)</label>
          <input type="text" name="cittaFatt" defaultValue={cittaFattReg} />
        </div>
        <div>
          <label className="field-label">Provincia</label>
          <input type="text" name="provinciaFatt" defaultValue={provinciaReg} placeholder="RM" maxLength={2} style={{ textTransform: "uppercase" }} />
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

        </div>
      </section>

      <section className="form-section">
        <h2 className="section-title">Contatto amministrativo</h2>
        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
          Chi si occupa dei pagamenti: è il destinatario predefinito di solleciti e pro-forma.
          {collegato
            ? " Nome, email e telefono sono precompilati dal registro Anagrafiche e, al salvataggio, vi tornano scritti."
            : " Dalla scheda partner puoi importarlo dal registro Anagrafiche."}
        </p>
        <div className="form-grid">
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
        </div>
      </section>

      <section className="form-section">
        <h2 className="section-title">Opzioni e note</h2>
        <div className="form-grid">
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
      </section>
      <div className="form-footer">
        <BottoneInvio inCorso="Salvo e aggiorno il registro…">{submitLabel}</BottoneInvio>
      </div>
    </form>
  );
}
