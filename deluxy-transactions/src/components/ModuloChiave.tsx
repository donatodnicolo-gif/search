"use client";

import { useActionState } from "react";
import { creaChiaveApi } from "@/app/actions";

// Chiave e segreto si vedono una volta sola. Dopo restano solo l'hash della
// chiave e il segreto cifrato: se si perdono, se ne crea un'altra e si revoca
// questa. Non c'è modo di rileggerli, ed è voluto.
export function ModuloChiave() {
  const [stato, azione, inCorso] = useActionState(
    creaChiaveApi,
    {} as { errore?: string; chiave?: string; segreto?: string; nome?: string },
  );

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.chiave && (
        <div className="avviso-ok">
          Chiave creata per <strong>{stato.nome}</strong>. Copiala adesso: non si rivede più.
          <code className="chiave-mostrata">TRANSACTIONS_API_KEY={stato.chiave}</code>
          <code className="chiave-mostrata">TRANSACTIONS_HMAC_SECRET={stato.segreto}</code>
          Mettile nella cassaforte del Hub sotto il progetto dell&apos;app che le userà.
        </div>
      )}
      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="k-nome">Nome dell&apos;app</label>
          <input id="k-nome" name="nome" placeholder="deluxy-messaging" required />
        </div>
        <div className="campo-modulo">
          <label htmlFor="k-ip">IP consentiti (separati da virgola)</label>
          <input id="k-ip" name="ipConsentiti" placeholder="vuoto = tutti" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="k-tetto">Tetto per richiesta (€)</label>
          <input id="k-tetto" name="tettoRichiesta" inputMode="decimal" placeholder="vuoto = nessun tetto" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="k-tetto-g">Tetto giornaliero (€)</label>
          <input id="k-tetto-g" name="tettoGiornaliero" inputMode="decimal" placeholder="vuoto = nessun tetto" />
        </div>
        <div className="azioni-modulo campo-modulo largo">
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Creo…" : "Crea la chiave"}
          </button>
        </div>
      </form>
    </>
  );
}
