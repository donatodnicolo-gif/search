"use client";

import { useState, type CSSProperties } from "react";
import { useIo } from "./Identita";
import { aggiornaStatoAcquisto, eliminaMovimento } from "@/lib/actions";
import { RegistraMovimento } from "./RegistraMovimento";
import {
  STATI_ACQUISTO,
  STATI_MOVIMENTO,
  TIPI_MOVIMENTO,
  formattaData,
  formattaImporto,
  voce,
} from "@/lib/vocab";
import type { AcquistoDTO } from "@/lib/tipi";

export function CardAcquisto({ a }: { a: AcquistoDTO }) {
  const [io] = useIo();
  const [movOpen, setMovOpen] = useState(false);
  const st = voce(STATI_ACQUISTO, a.stato);
  const residuo = Math.max(0, a.totale - a.pagato);
  const perc = a.totale > 0 ? Math.min(100, Math.round((a.pagato / a.totale) * 100)) : 0;

  async function cambiaStato(stato: string) {
    const fd = new FormData();
    fd.set("id", a.id);
    fd.set("stato", stato);
    await aggiornaStatoAcquisto(fd);
  }

  async function elimina(id: string) {
    if (!window.confirm("Eliminare questo movimento?")) return;
    const fd = new FormData();
    fd.set("id", id);
    await eliminaMovimento(fd);
  }

  return (
    <div className="card">
      <div className="card-testa">
        <div className="card-corpo">
          <div className="card-titolo">
            <span className="card-num">#{a.numero}</span> {a.descrizione}
          </div>
          <div className="card-desc">{a.fornitoreNome}{a.numeroFattura ? ` · fattura ${a.numeroFattura}` : ""}</div>
          <div className="card-meta">
            <span className="badge tinta" style={{ "--c": st.colore } as CSSProperties}>
              <span className="dot" /> {st.etichetta}
            </span>
            {a.categoria && <span className="badge">{a.categoria}</span>}
            <span className="muted">ordine {formattaData(a.dataOrdine)}</span>
            {a.dataFattura && <span className="muted">fattura {formattaData(a.dataFattura)}</span>}
          </div>
        </div>
        <div className="card-importo">
          {formattaImporto(a.totale, a.valuta)}
          <small>
            pagato {formattaImporto(a.pagato, a.valuta)}
            {residuo > 0.005 ? ` · resta ${formattaImporto(residuo, a.valuta)}` : ""}
          </small>
        </div>
      </div>

      <div className="paybar">
        <span style={{ width: `${perc}%` }} />
      </div>

      {a.movimenti.length > 0 && (
        <div className="movimenti">
          {a.movimenti.map((m) => {
            const tp = voce(TIPI_MOVIMENTO, m.tipo);
            const ms = voce(STATI_MOVIMENTO, m.stato);
            const segno = ["nota_credito", "rimborso"].includes(m.tipo) ? -1 : 1;
            return (
              <div className="mov" key={m.id}>
                <span className="badge">
                  <span className="dot" style={{ background: tp.colore }} /> {tp.etichetta}
                </span>
                {m.stato !== "eseguito" && (
                  <span className="badge">
                    <span className="dot" style={{ background: ms.colore }} /> {ms.etichetta}
                  </span>
                )}
                <span className="muted">
                  {formattaData(m.data)}
                  {m.metodo ? ` · ${m.metodo}` : ""}
                  {m.riferimento ? ` · ${m.riferimento}` : ""}
                </span>
                <span className="mov-imp" style={segno < 0 ? { color: "var(--red)" } : undefined}>
                  {segno < 0 ? "−" : ""}
                  {formattaImporto(m.importo, m.valuta)}
                </span>
                <button className="mini" title="Elimina" onClick={() => elimina(m.id)}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="card-azioni">
        {residuo > 0.005 && a.stato !== "annullato" && (
          <button className="btn piccolo" onClick={() => setMovOpen(true)}>
            + Movimento
          </button>
        )}
        {a.stato === "ordinato" && (
          <button className="btn ghost piccolo" onClick={() => cambiaStato("ricevuto")}>
            Segna ricevuto
          </button>
        )}
        {a.stato !== "annullato" && a.stato !== "pagato" && (
          <button className="btn ghost piccolo" onClick={() => cambiaStato("annullato")}>
            Annulla
          </button>
        )}
        <span className="muted" style={{ marginLeft: "auto" }}>
          {io.nome ? "" : "Imposta il tuo nome in alto per firmare i movimenti"}
        </span>
      </div>

      {movOpen && <RegistraMovimento acquisto={a} onClose={() => setMovOpen(false)} />}
    </div>
  );
}
