"use client";

import { useActionState } from "react";
import { impostaPin } from "@/app/actions";

// Il PIN se lo mette la persona, con la propria password e il proprio secondo
// fattore. Un amministratore non lo può impostare per conto di un altro: se
// potesse, non sarebbe un terzo fattore, sarebbe una formalità.
export function ModuloPin({ richiedeCodice, giaImpostato }: { richiedeCodice: boolean; giaImpostato: boolean }) {
  const [stato, azione, inCorso] = useActionState(impostaPin, {} as { errore?: string; ok?: string });

  return (
    <form action={azione}>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}

      <div className="campo-modulo">
        <label htmlFor="password">La tua password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      {richiedeCodice && (
        <div className="campo-modulo">
          <label htmlFor="codice">Codice a 6 cifre</label>
          <input
            id="codice"
            className="firma-codice"
            name="codice"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            required
          />
        </div>
      )}

      <div className="firma-riga">
        <div className="campo-modulo">
          <label htmlFor="pin">{giaImpostato ? "Nuovo PIN" : "PIN"} (6–12 cifre)</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" maxLength={12} autoComplete="off" required />
        </div>
        <div className="campo-modulo">
          <label htmlFor="ripeti">Ripeti il PIN</label>
          <input id="ripeti" name="ripeti" type="password" inputMode="numeric" maxLength={12} autoComplete="off" required />
        </div>
        <button className="btn" type="submit" disabled={inCorso}>
          {inCorso ? "Salvo…" : giaImpostato ? "Cambia il PIN" : "Imposta il PIN"}
        </button>
      </div>

      <p className="firma-nota">
        Il PIN non è recuperabile: sul database c&apos;è solo la sua impronta PBKDF2. Se lo dimentichi si rifà da qui,
        con password e codice a 6 cifre.
      </p>
    </form>
  );
}
