"use client";

import { useActionState } from "react";
import { nuovaRichiestaManuale } from "@/app/actions";

export function ModuloNuovaRichiesta() {
  const [stato, azione, inCorso] = useActionState(nuovaRichiestaManuale, {} as { errore?: string; ok?: string });

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}
      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="beneficiario">Beneficiario</label>
          <input id="beneficiario" name="beneficiario" required />
        </div>
        <div className="campo-modulo">
          <label htmlFor="importo">Importo in euro</label>
          <input id="importo" name="importo" inputMode="decimal" placeholder="1.250,00" required />
        </div>
        <div className="campo-modulo">
          <label htmlFor="iban">IBAN</label>
          <input id="iban" name="iban" required spellCheck={false} autoComplete="off" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="bic">BIC (facoltativo)</label>
          <input id="bic" name="bic" spellCheck={false} autoComplete="off" />
        </div>
        <div className="campo-modulo largo">
          <label htmlFor="causale">Causale (max 140 caratteri)</label>
          <input id="causale" name="causale" maxLength={140} required />
        </div>
        <div className="campo-modulo">
          <label htmlFor="categoria">Categoria (facoltativa)</label>
          <input id="categoria" name="categoria" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="scadenza">Scadenza (facoltativa)</label>
          <input id="scadenza" name="scadenza" type="date" />
        </div>
        <div className="campo-modulo largo">
          <label htmlFor="note">Note interne</label>
          <textarea id="note" name="note" rows={3} />
        </div>
        <div className="azioni-modulo campo-modulo largo">
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Registro…" : "Registra la richiesta"}
          </button>
        </div>
      </form>
    </>
  );
}
