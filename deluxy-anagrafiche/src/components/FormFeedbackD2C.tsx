"use client";

import { useState } from "react";
import { registraFeedbackD2C } from "@/lib/azioni";
import {
  CANALI_FEEDBACK,
  ETICHETTE_CANALE,
  ETICHETTE_MOTIVO,
  MOTIVI_FEEDBACK,
} from "@/lib/feedback-d2c";

// Inserimento a mano di un feedback del cliente finale. Serve al team che li
// raccoglie a voce o su WhatsApp: le app li manderanno via API, ma la scheda
// resta il posto dove registrarne uno subito.
export function FormFeedbackD2C({ partnerId, nome }: { partnerId: string; nome: string }) {
  const [aperto, setAperto] = useState(false);
  const [voto, setVoto] = useState(0);

  if (!aperto) {
    return (
      <button
        type="button"
        className="btn btn-secondario"
        style={{ fontSize: 12.5, padding: "6px 14px" }}
        onClick={() => setAperto(true)}
        title={`Registra un feedback ricevuto su ${nome}`}
      >
        ＋ Feedback
      </button>
    );
  }

  return (
    <form
      className="form-feedback"
      action={async (fd) => {
        await registraFeedbackD2C(partnerId, fd);
        setAperto(false);
        setVoto(0);
      }}
    >
      <div className="form-feedback-riga">
        <div className="d2c-scelta" role="group" aria-label="Voto da 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={n <= voto ? "d2c-stella attiva" : "d2c-stella"}
              onClick={() => setVoto(n)}
              title={`${n} su 5`}
              aria-label={`${n} su 5`}
            >
              ★
            </button>
          ))}
        </div>
        <input type="hidden" name="voto" value={voto || ""} />
        <select name="canale" defaultValue="manuale" aria-label="Canale">
          {CANALI_FEEDBACK.map((c) => (
            <option key={c} value={c}>{ETICHETTE_CANALE[c] ?? c}</option>
          ))}
        </select>
        <input type="date" name="data" aria-label="Data del feedback" />
        <input type="text" name="ordine" placeholder="Ordine (facoltativo)" />
        <input type="text" name="cliente" placeholder="Cliente (facoltativo)" />
      </div>

      <div className="form-feedback-motivi">
        {MOTIVI_FEEDBACK.map((m) => (
          <label key={m} className="chip-motivo">
            <input type="checkbox" name="motivi" value={m} />
            <span>{ETICHETTE_MOTIVO[m]}</span>
          </label>
        ))}
      </div>

      <textarea name="commento" rows={2} placeholder="Cosa ha detto il cliente (testuale)…" />

      <div className="azioni-modulo">
        <button
          type="button"
          className="btn btn-secondario"
          onClick={() => {
            setAperto(false);
            setVoto(0);
          }}
        >
          Annulla
        </button>
        <button className="btn" type="submit" disabled={voto === 0}>
          Registra feedback
        </button>
      </div>
    </form>
  );
}
