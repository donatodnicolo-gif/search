"use client";

import { useActionState } from "react";
import { salvaImpostazioni } from "@/app/actions";

type Valori = {
  sogliaDoppiaFirma: string;
  tettoAssoluto: string;
  sogliaRischioDoppiaFirma: string;
  colpiAlMinuto: string;
  minutiFirma: string;
  soloBeneficiariVerificati: boolean;
  ordinanteNome: string;
  ordinanteIban: string;
  ordinanteBic: string;
  pagatoreEmail: string;
  minutiCodicePagamento: string;
  minutiSbloccoPagamento: string;
};

export function ModuloImpostazioni({ valori }: { valori: Valori }) {
  const [stato, azione, inCorso] = useActionState(salvaImpostazioni, {} as { errore?: string; ok?: string });

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}
      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="i-soglia">Soglia della doppia firma (€)</label>
          <input id="i-soglia" name="sogliaDoppiaFirma" defaultValue={valori.sogliaDoppiaFirma} inputMode="decimal" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-tetto">Tetto assoluto (€)</label>
          <input id="i-tetto" name="tettoAssoluto" defaultValue={valori.tettoAssoluto} inputMode="decimal" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-rischio">Punteggio di rischio che impone la doppia firma (0-100)</label>
          <input id="i-rischio" name="sogliaRischioDoppiaFirma" defaultValue={valori.sogliaRischioDoppiaFirma} inputMode="numeric" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-colpi">Richieste API al minuto per chiave</label>
          <input id="i-colpi" name="colpiAlMinuto" defaultValue={valori.colpiAlMinuto} inputMode="numeric" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-minuti">Tolleranza dell&apos;orologio sulle firme API (minuti)</label>
          <input id="i-minuti" name="minutiFirma" defaultValue={valori.minutiFirma} inputMode="numeric" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-verificati">Solo beneficiari verificati</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, textTransform: "none", letterSpacing: 0 }}>
            <input
              id="i-verificati"
              type="checkbox"
              name="soloBeneficiariVerificati"
              defaultChecked={valori.soloBeneficiariVerificati}
            />
            alza il rischio se le coordinate non sono in rubrica come verificate
          </label>
        </div>

        <div className="campo-modulo largo">
          <label htmlFor="i-ord-nome">Ordinante — ragione sociale (per le distinte SEPA)</label>
          <input id="i-ord-nome" name="ordinanteNome" defaultValue={valori.ordinanteNome} />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-ord-iban">Ordinante — IBAN aziendale</label>
          <input id="i-ord-iban" name="ordinanteIban" defaultValue={valori.ordinanteIban} spellCheck={false} />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-ord-bic">Ordinante — BIC</label>
          <input id="i-ord-bic" name="ordinanteBic" defaultValue={valori.ordinanteBic} spellCheck={false} />
        </div>

        <div className="campo-modulo largo">
          <label htmlFor="i-pagatore">Pagatore — l&apos;unica persona che può far uscire denaro</label>
          <input id="i-pagatore" name="pagatoreEmail" defaultValue={valori.pagatoreEmail} spellCheck={false} />
          <p className="firma-nota">
            Deve essere l&apos;email di un operatore attivo. Riceve lì il codice di pagamento e lo usa insieme al PIN:
            cambiare questo campo sposta il potere di pagare a un&apos;altra persona, e resta scritto nel registro.
          </p>
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-min-codice">Validità del codice di pagamento (minuti)</label>
          <input id="i-min-codice" name="minutiCodicePagamento" defaultValue={valori.minutiCodicePagamento} inputMode="numeric" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-min-sblocco">Finestra di sblocco dopo il codice (minuti)</label>
          <input id="i-min-sblocco" name="minutiSbloccoPagamento" defaultValue={valori.minutiSbloccoPagamento} inputMode="numeric" />
        </div>

        <div className="azioni-modulo campo-modulo largo">

          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Salvo…" : "Salva"}
          </button>
        </div>
      </form>
    </>
  );
}
