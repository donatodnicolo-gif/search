"use client";

import { useActionState } from "react";
import { entra } from "@/app/actions";

// Email + password. Il messaggio d'errore è sempre lo stesso a prescindere da
// cosa è sbagliato: non deve servire a capire se un'email esiste.
// ⚠️ Il codice a 6 cifre all'ACCESSO è stato tolto su decisione dell'utente
// (29/08/2026); resta su firme, chiusure e impostazioni sensibili.
export function ModuloAccesso({ da }: { da: string }) {
  const [stato, azione, inCorso] = useActionState(entra, {} as { errore?: string });

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      <form action={azione} className="accesso-modulo">
        <input type="hidden" name="da" value={da} />
        <input type="email" name="email" placeholder="Email" autoComplete="username" required autoFocus />
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          required
        />
        <button className="btn" type="submit" disabled={inCorso} style={{ width: "100%", padding: 11 }}>
          {inCorso ? "Verifica…" : "Entra"}
        </button>
      </form>
    </>
  );
}
