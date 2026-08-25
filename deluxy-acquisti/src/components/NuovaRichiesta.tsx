"use client";

import { useState } from "react";
import { Modale } from "./Modale";
import { CampiIo, useIo } from "./Identita";
import { creaRichiesta } from "@/lib/actions";
import { CATEGORIE, PRIORITA, VALUTE } from "@/lib/vocab";

export function NuovaRichiesta({ onClose }: { onClose: () => void }) {
  const [io] = useIo();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function invia(fd: FormData) {
    setInCorso(true);
    setErrore(null);
    try {
      await creaRichiesta(fd);
      onClose();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nel salvataggio.");
      setInCorso(false);
    }
  }

  return (
    <Modale
      titolo="Nuova richiesta di acquisto"
      sottotitolo="Descrivi cosa serve. Un responsabile la approverà prima dell'ordine."
      onClose={onClose}
    >
      <form action={invia}>
        <CampiIo io={io} />
        <div className="campo">
          <label>Cosa serve *</label>
          <input name="titolo" required autoFocus placeholder="Es. 500 scatole regalo bordeaux" />
        </div>
        <div className="campo">
          <label>Dettagli</label>
          <textarea name="descrizione" placeholder="Specifiche, quantità, motivo…" />
        </div>
        <div className="riga">
          <div className="campo">
            <label>Categoria</label>
            <select name="categoria" defaultValue="">
              <option value="">—</option>
              {CATEGORIE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Fornitore suggerito</label>
            <input name="fornitoreSuggerito" placeholder="Facoltativo" />
          </div>
        </div>
        <div className="riga-3">
          <div className="campo">
            <label>Importo stimato</label>
            <input name="importoStimato" inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="campo">
            <label>Valuta</label>
            <select name="valuta" defaultValue="EUR">
              {VALUTE.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Priorità</label>
            <select name="priorita" defaultValue="media">
              {PRIORITA.map((p) => (
                <option key={p.codice} value={p.codice}>
                  {p.etichetta}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="campo">
          <label>Serve entro</label>
          <input name="dataNecessita" type="date" />
        </div>
        {errore && <p className="errore">{errore}</p>}
        <div className="modal-azioni">
          <button type="button" className="btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn" disabled={inCorso}>
            {inCorso ? "Invio…" : "Invia richiesta"}
          </button>
        </div>
      </form>
    </Modale>
  );
}
