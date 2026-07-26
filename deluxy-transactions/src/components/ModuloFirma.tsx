"use client";

import { useActionState, useState } from "react";
import { decidiRichiesta } from "@/app/actions";

// Il momento della decisione. Tre cose lo rendono difficile da sbagliare:
//  • il codice a 6 cifre va inserito ogni volta (non basta la sessione aperta);
//  • approvare chiede una conferma esplicita con l'importo scritto sopra;
//  • rifiutare e sospendere vogliono un motivo, che finisce nel registro.
export function ModuloFirma({
  id,
  richiedeCodice,
  importo,
}: {
  id: string;
  richiedeCodice: boolean;
  importo: string;
}) {
  const [stato, azione, inCorso] = useActionState(decidiRichiesta, {} as { errore?: string; ok?: string });
  const [azioneScelta, setAzioneScelta] = useState<"approvata" | "rifiutata" | "sospesa">("approvata");

  return (
    <div className="firma">
      <div className="firma-testa">
        <div className="firma-titolo">La tua decisione</div>
      </div>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}

      <form action={azione}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="azione" value={azioneScelta} />

        <div className="selettore-stato" style={{ marginBottom: 14 }}>
          {(
            [
              ["approvata", "Approva"],
              ["rifiutata", "Rifiuta"],
              ["sospesa", "Sospendi"],
            ] as const
          ).map(([valore, etichetta]) => (
            <button
              key={valore}
              type="button"
              className={`stato-pill${azioneScelta === valore ? " attuale" : ""}`}
              onClick={() => setAzioneScelta(valore)}
            >
              <span className="stato-label">{etichetta}</span>
            </button>
          ))}
        </div>

        <div className="firma-riga">
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
          <div className="campo-modulo" style={{ flex: "1 1 260px" }}>
            <label htmlFor="motivo">Motivo {azioneScelta === "approvata" ? "(facoltativo)" : ""}</label>
            <input id="motivo" name="motivo" required={azioneScelta !== "approvata"} />
          </div>
          <button
            className={`btn${azioneScelta === "rifiutata" ? " btn-rifiuta" : ""}`}
            type="submit"
            disabled={inCorso}
            onClick={(e) => {
              if (azioneScelta !== "approvata") return;
              if (!confirm(`Confermi il pagamento di ${importo}?`)) e.preventDefault();
            }}
          >
            {inCorso ? "Registro…" : azioneScelta === "approvata" ? `Firma ${importo}` : "Registra"}
          </button>
        </div>

        <p className="firma-nota">
          La firma resta nel registro con il tuo nome, l&apos;ora e l&apos;indirizzo IP. Approvare non manda denaro: la
          richiesta entra in una distinta che una persona carica in banca.
        </p>
      </form>
    </div>
  );
}
