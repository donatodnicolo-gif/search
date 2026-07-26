"use client";

import { useActionState } from "react";
import { creaOperatore } from "@/app/actions";

export function ModuloOperatore() {
  const [stato, azione, inCorso] = useActionState(
    creaOperatore,
    {} as { errore?: string; ok?: string; segretoTotp?: string; email?: string },
  );

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.segretoTotp && (
        <div className="avviso-ok">
          {stato.ok} Fai inserire questo segreto nell&apos;app di autenticazione (Google Authenticator, 1Password…). Si
          vede una volta sola.
          <code className="chiave-mostrata">{stato.segretoTotp}</code>
          <span style={{ fontSize: 12.5 }}>
            In alternativa: otpauth://totp/Deluxy%20Transactions:{stato.email}?secret={stato.segretoTotp}&amp;issuer=Deluxy
          </span>
        </div>
      )}
      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="o-nome">Nome e cognome</label>
          <input id="o-nome" name="nome" required />
        </div>
        <div className="campo-modulo">
          <label htmlFor="o-email">Email</label>
          <input id="o-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="o-password">Password iniziale (almeno 12 caratteri)</label>
          <input id="o-password" name="password" type="password" minLength={12} required autoComplete="new-password" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="o-ruolo">Ruolo</label>
          <select id="o-ruolo" name="ruolo" defaultValue="approvatore">
            <option value="approvatore">approvatore — può firmare</option>
            <option value="admin">admin — firma e amministra</option>
            <option value="osservatore">osservatore — legge soltanto</option>
          </select>
        </div>
        <div className="campo-modulo">
          <label htmlFor="o-tetto">Tetto personale di approvazione (€)</label>
          <input id="o-tetto" name="tetto" inputMode="decimal" placeholder="vuoto = nessun tetto personale" />
        </div>
        <div className="azioni-modulo campo-modulo largo">
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Creo…" : "Crea l'operatore"}
          </button>
        </div>
      </form>
    </>
  );
}
