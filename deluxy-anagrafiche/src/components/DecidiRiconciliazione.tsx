"use client";

import { useState, useTransition } from "react";
import {
  accettaRiconciliazione,
  riapriRiconciliazione,
  rifiutaRiconciliazione,
} from "@/lib/azioni";

// I due bottoni della decisione. Le etichette dicono **cosa succede**, non
// «accetta»/«rifiuta»: davanti a due indirizzi, «accetta» non fa capire quale
// dei due resta scritto nel registro.
export function DecidiRiconciliazione({
  id,
  stato,
  decisoIl,
}: {
  id: string;
  stato: string;
  decisoIl: string | null;
}) {
  const [inCorso, avvia] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  function esegui(azione: () => Promise<void>) {
    setErrore(null);
    avvia(async () => {
      try {
        await azione();
      } catch (e) {
        // L'errore si vede: una decisione che sembra presa e non lo è vale meno
        // di nessuna decisione.
        setErrore((e as Error).message || "Non è stato possibile salvare la scelta.");
      }
    });
  }

  if (stato !== "aperta") {
    return (
      <div className="riconc-azioni">
        <span className={`riconc-esito ${stato}`}>
          {stato === "accettata" ? "Aggiornato col tracker" : "Tenuto il registro"}
          {decisoIl ? ` · ${decisoIl}` : ""}
        </span>
        <button
          type="button"
          className="btn btn-secondario"
          disabled={inCorso}
          onClick={() => esegui(() => riapriRiconciliazione(id))}
        >
          Ci ripenso
        </button>
        {errore && <span className="riconc-errore">{errore}</span>}
      </div>
    );
  }

  return (
    <div className="riconc-azioni">
      <button
        type="button"
        className="btn btn-secondario"
        disabled={inCorso}
        onClick={() => esegui(() => rifiutaRiconciliazione(id))}
      >
        Tieni il registro
      </button>
      <button
        type="button"
        className="btn"
        disabled={inCorso}
        onClick={() => esegui(() => accettaRiconciliazione(id))}
      >
        Usa il valore del tracker
      </button>
      {errore && <span className="riconc-errore">{errore}</span>}
    </div>
  );
}
