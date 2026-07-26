"use client";

import { useActionState } from "react";
import { collegaBanca, scollegaBanca } from "@/app/actions";

// Le chiavi della banca si incollano qui, dentro l'app: nessuno le manda per
// chat o per email. Finiscono sul database cifrate AES-256-GCM e non si
// rileggono più — si sostituiscono.
export function ModuloBanca({
  collegato,
  da,
  login,
  contoId,
}: {
  collegato: boolean;
  da: "app" | "ambiente" | null;
  login: string;
  contoId: string;
}) {
  const [stato, azione, inCorso] = useActionState(collegaBanca, {} as { errore?: string; ok?: string });

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}

      {collegato && (
        <p className="firma-nota">
          Collegata con il login <strong>{login}</strong>
          {contoId ? ` sul conto ${contoId}` : " sul conto principale"} — chiavi prese{" "}
          {da === "app" ? "da questa pagina" : "dalle variabili d'ambiente di Vercel"}. Per cambiarle, incollane di
          nuove qui sotto.
        </p>
      )}

      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="q-login">Login Qonto (il valore prima dei due punti)</label>
          <input id="q-login" name="login" defaultValue={da === "app" ? login : ""} spellCheck={false} autoComplete="off" required />
        </div>
        <div className="campo-modulo">
          <label htmlFor="q-segreto">Chiave segreta</label>
          <input
            id="q-segreto"
            name="segreto"
            type="password"
            spellCheck={false}
            autoComplete="off"
            placeholder={collegato ? "•••••••• (già impostata)" : ""}
            required
          />
        </div>
        <div className="campo-modulo largo">
          <label htmlFor="q-conto">Conto da usare (facoltativo)</label>
          <input
            id="q-conto"
            name="contoId"
            defaultValue={da === "app" ? contoId : ""}
            spellCheck={false}
            placeholder="vuoto = il conto principale"
          />
        </div>
        <div className="azioni-modulo campo-modulo largo" style={{ display: "flex", gap: 10 }}>
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Provo…" : collegato ? "Sostituisci le chiavi" : "Collega la banca"}
          </button>
        </div>
      </form>

      {collegato && da === "app" && (
        <form action={scollegaBanca} style={{ marginTop: 10 }}>
          <button
            className="btn btn-secondario"
            type="submit"
            onClick={(e) => {
              if (!confirm("Scollego la banca e spengo il pagamento dei bonifici. Confermi?")) e.preventDefault();
            }}
          >
            Scollega la banca
          </button>
        </form>
      )}

      <p className="firma-nota">
        La chiave si genera in Qonto: <strong>Integrazioni e partnership → Chiave API</strong>. Prima di salvare provo a
        chiedere l&apos;elenco dei conti: se Qonto non accetta le chiavi, non le salvo. Collegare la banca non fa
        partire nessun bonifico — per quello serve l&apos;interruttore qui sopra, più codice e PIN a ogni pagamento.
      </p>
    </>
  );
}
