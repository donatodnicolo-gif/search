"use client";

import { useState, type CSSProperties } from "react";
import { useIo } from "./Identita";
import { decidiRichiesta, convertiRichiesta } from "@/lib/actions";
import { PRIORITA, STATI_RICHIESTA, formattaData, formattaImporto, voce } from "@/lib/vocab";
import type { RichiestaDTO } from "@/lib/tipi";

export function CardRichiesta({ r }: { r: RichiestaDTO }) {
  const [io] = useIo();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const st = voce(STATI_RICHIESTA, r.stato);
  const pr = voce(PRIORITA, r.priorita);

  async function decidi(esito: "approvata" | "rifiutata") {
    let nota = "";
    if (esito === "rifiutata") {
      nota = window.prompt("Motivo del rifiuto (facoltativo):") ?? "";
    }
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("esito", esito);
    fd.set("nota", nota);
    fd.set("ioNome", io.nome);
    fd.set("ioEmail", io.email);
    esegui(() => decidiRichiesta(fd));
  }

  async function converti() {
    if (!window.confirm("Creare un acquisto da questa richiesta?")) return;
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("ioNome", io.nome);
    fd.set("ioEmail", io.email);
    esegui(() => convertiRichiesta(fd));
  }

  async function esegui(fn: () => Promise<void>) {
    setInCorso(true);
    setErrore(null);
    try {
      await fn();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Operazione non riuscita.");
      setInCorso(false);
    }
  }

  return (
    <div className="card">
      <div className="card-testa">
        <div className="card-corpo">
          <div className="card-titolo">
            <span className="card-num">#{r.numero}</span> {r.titolo}
          </div>
          {r.descrizione && <div className="card-desc">{r.descrizione}</div>}
          <div className="card-meta">
            <span className="badge tinta" style={{ "--c": st.colore } as CSSProperties}>
              <span className="dot" /> {st.etichetta}
            </span>
            <span className="badge tinta" style={{ "--c": pr.colore } as CSSProperties}>
              <span className="dot" /> {pr.etichetta}
            </span>
            {r.categoria && <span className="badge">{r.categoria}</span>}
            {r.fornitoreSuggerito && <span className="muted">Fornitore: {r.fornitoreSuggerito}</span>}
            <span className="muted">
              da {r.richiedenteNome || r.richiedenteEmail} · {formattaData(r.creataIl)}
            </span>
            {r.dataNecessita && <span className="muted">serve entro {formattaData(r.dataNecessita)}</span>}
          </div>
          {r.stato !== "inviata" && (r.approvatoreNome || r.notaDecisione) && (
            <div className="muted" style={{ marginTop: 6 }}>
              {st.etichetta.toLowerCase()} da {r.approvatoreNome || "—"}
              {r.notaDecisione ? ` · "${r.notaDecisione}"` : ""}
            </div>
          )}
        </div>
        {r.importoStimato != null && (
          <div className="card-importo">
            {formattaImporto(r.importoStimato, r.valuta)}
            <small>stimato</small>
          </div>
        )}
      </div>

      <div className="card-azioni">
        {r.stato === "inviata" && (
          <>
            <button className="btn verde piccolo" disabled={inCorso} onClick={() => decidi("approvata")}>
              Approva
            </button>
            <button className="btn rosso piccolo" disabled={inCorso} onClick={() => decidi("rifiutata")}>
              Rifiuta
            </button>
          </>
        )}
        {r.stato === "approvata" && (
          <button className="btn piccolo" disabled={inCorso} onClick={converti}>
            Converti in acquisto
          </button>
        )}
        {r.stato === "convertita" && <span className="muted">→ acquisto creato</span>}
        {errore && <span className="errore" style={{ marginTop: 0 }}>{errore}</span>}
      </div>
    </div>
  );
}
