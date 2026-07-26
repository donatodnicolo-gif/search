"use client";

import { useActionState } from "react";
import { aggiungiBeneficiario } from "@/app/actions";

export function ModuloBeneficiario() {
  const [stato, azione, inCorso] = useActionState(aggiungiBeneficiario, {} as { errore?: string; ok?: string });

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}
      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="b-nome">Nome</label>
          <input id="b-nome" name="nome" required />
        </div>
        <div className="campo-modulo">
          <label htmlFor="b-iban">IBAN</label>
          <input id="b-iban" name="iban" required spellCheck={false} autoComplete="off" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="b-bic">BIC (facoltativo)</label>
          <input id="b-bic" name="bic" spellCheck={false} autoComplete="off" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="b-note">Note</label>
          <input id="b-note" name="note" placeholder="Come sono state confermate le coordinate" />
        </div>
        <div className="azioni-modulo campo-modulo largo">
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Salvo…" : "Aggiungi come verificato"}
          </button>
        </div>
      </form>
    </>
  );
}
