"use client";

import { useActionState } from "react";
import { caricaAllegatoManuale } from "@/app/actions";

// Carica un allegato sulla richiesta: la prova del pagamento (ricevuta del
// bonifico, screenshot del portale) o un documento a corredo. Il ruolo lo
// decide la pagina: «prova» quando la richiesta è pagata o in chiusura.

export function ModuloAllegato({ richiestaId, ruolo }: { richiestaId: string; ruolo: "prova" | "richiesta" }) {
  const [stato, azione, inCorso] = useActionState(caricaAllegatoManuale, {} as { errore?: string; ok?: string });

  return (
    <form action={azione} className="modulo" style={{ marginTop: 10 }}>
      <input type="hidden" name="richiestaId" value={richiestaId} />
      <input type="hidden" name="ruolo" value={ruolo} />
      <div className="campo-modulo largo">
        <label htmlFor={`file-${ruolo}`}>
          {ruolo === "prova" ? "Allega la prova del pagamento (immagine o PDF, max 1,5 MB)" : "Allega un documento (immagine o PDF, max 1,5 MB)"}
        </label>
        <input id={`file-${ruolo}`} name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" required />
      </div>
      <div className="azioni-modulo campo-modulo">
        <button className="btn secondario" type="submit" disabled={inCorso}>
          {inCorso ? "Carico…" : "Carica"}
        </button>
      </div>
      {stato?.errore && <div className="avviso-errore campo-modulo largo">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok campo-modulo largo">{stato.ok}</div>}
    </form>
  );
}
