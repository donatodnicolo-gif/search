"use client";

import { useState } from "react";
import { Modale } from "./Modale";
import { CampiIo, useIo } from "./Identita";
import { registraMovimento } from "@/lib/actions";
import { METODI_PAGAMENTO, STATI_MOVIMENTO, TIPI_MOVIMENTO, formattaImporto } from "@/lib/vocab";
import type { AcquistoDTO } from "@/lib/tipi";

export function RegistraMovimento({ acquisto, onClose }: { acquisto: AcquistoDTO; onClose: () => void }) {
  const [io] = useIo();
  const [stato, setStato] = useState("eseguito");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const residuo = Math.max(0, acquisto.totale - acquisto.pagato);

  async function invia(fd: FormData) {
    setInCorso(true);
    setErrore(null);
    try {
      await registraMovimento(fd);
      onClose();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nel salvataggio.");
      setInCorso(false);
    }
  }

  return (
    <Modale
      titolo="Registra movimento"
      sottotitolo={`${acquisto.fornitoreNome} · ${acquisto.descrizione} — residuo ${formattaImporto(residuo, acquisto.valuta)}`}
      onClose={onClose}
    >
      <form action={invia}>
        <CampiIo io={io} />
        <input type="hidden" name="acquistoId" value={acquisto.id} />
        <div className="riga">
          <div className="campo">
            <label>Tipo</label>
            <select name="tipo" defaultValue={residuo > 0 && acquisto.pagato > 0 ? "saldo" : "pagamento"}>
              {TIPI_MOVIMENTO.map((t) => (
                <option key={t.codice} value={t.codice}>
                  {t.etichetta}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Importo *</label>
            <input name="importo" inputMode="decimal" required defaultValue={residuo > 0 ? residuo.toFixed(2) : ""} placeholder="0,00" />
          </div>
        </div>
        <div className="riga">
          <div className="campo">
            <label>Stato</label>
            <select name="stato" value={stato} onChange={(e) => setStato(e.target.value)}>
              {STATI_MOVIMENTO.map((s) => (
                <option key={s.codice} value={s.codice}>
                  {s.etichetta}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Metodo</label>
            <select name="metodo" defaultValue="bonifico">
              {METODI_PAGAMENTO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="riga">
          <div className="campo">
            <label>{stato === "previsto" ? "Data prevista" : "Data valuta"}</label>
            <input name="data" type="date" />
          </div>
          <div className="campo">
            <label>Scadenza (se previsto)</label>
            <input name="scadenza" type="date" />
          </div>
        </div>
        <div className="campo">
          <label>Riferimento (CRO/IBAN/nota)</label>
          <input name="riferimento" placeholder="Facoltativo" />
        </div>
        <div className="campo">
          <label>Note</label>
          <textarea name="note" />
        </div>
        {errore && <p className="errore">{errore}</p>}
        <div className="modal-azioni">
          <button type="button" className="btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn" disabled={inCorso}>
            {inCorso ? "Salvo…" : "Registra movimento"}
          </button>
        </div>
      </form>
    </Modale>
  );
}
