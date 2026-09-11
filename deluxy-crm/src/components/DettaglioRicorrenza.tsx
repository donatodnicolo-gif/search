"use client";

import { useEffect, useState } from "react";
import Modale from "./Modale";
import { modificaRicorrenza } from "@/lib/actions";
import type { RicorrenzaCliente } from "@/lib/orders";
import { dataBreve, dataProspettica, giornoMese, quandoLeggibile, tipoRicorrenza, TIPI_RICORRENZA } from "@/lib/etichette";

// Il dettaglio di una ricorrenza, in finestra (Libro §9): CHI, QUANDO e
// soprattutto COME L'ABBIAMO DEDOTTA — da quali ordini di quali anni, e da
// quale frase del biglietto è venuto il tipo (parole, AI o una persona). Con
// la correzione in loco, che scrive in Orders (casa della ricorrenza).
//
// Il contenuto si legge da /api/interno/ricorrenza SOLO all'apertura: la
// pagina porta per ogni voce due stringhe (id e cliente), non il dettaglio.

type Props = {
  id: string;
  cliente: string;
  /** Titolo della finestra (nome del cliente, → per chi). */
  titolo: string;
  sotto?: string;
  torna: string;
  className?: string;
  bottone: React.ReactNode;
};

export default function DettaglioRicorrenza({ id, cliente, titolo, sotto, torna, className = "riga-apri", bottone }: Props) {
  return (
    <Modale bottone={bottone} titolo={titolo} sotto={sotto} className={className} stretta>
      <Contenuto id={id} cliente={cliente} torna={torna} />
    </Modale>
  );
}

function Contenuto({ id, cliente, torna }: { id: string; cliente: string; torna: string }) {
  const [r, setR] = useState<RicorrenzaCliente | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/interno/ricorrenza?id=${encodeURIComponent(id)}&cliente=${encodeURIComponent(cliente)}`, { cache: "no-store" })
      .then(async (res) => {
        const d = (await res.json()) as { ricorrenza?: RicorrenzaCliente; errore?: string };
        if (!vivo) return;
        if (!res.ok || !d.ricorrenza) setErrore(d.errore ?? `Errore ${res.status}`);
        else setR(d.ricorrenza);
      })
      .catch(() => vivo && setErrore("Rete assente: riprova."));
    return () => {
      vivo = false;
    };
  }, [id, cliente]);

  if (errore) return <div className="modale-azioni"><div className="errore-card">{errore}</div></div>;
  if (!r) return <div className="modale-azioni"><p className="terziario piccolo">Leggo da Orders…</p></div>;

  const t = tipoRicorrenza(r.tipo);
  const quando = dataProspettica(r.fraGiorni);
  const daChi =
    r.tipoDa === "manuale"
      ? "scritta a mano da una persona"
      : r.tipoDa === "parole"
        ? "letta dalle parole del biglietto"
        : r.tipoDa === "ai"
          ? "letta dall'AI nel biglietto"
          : "nessuno l'ha ancora detta: da precisare";

  return (
    <div className="modale-azioni" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="card-titolo" style={{ fontSize: 13, marginBottom: 6 }}>Quando e per chi</div>
        <p className="piccolo" style={{ margin: 0, lineHeight: 1.55 }}>
          <strong>{dataBreve(quando)}</strong> ({quandoLeggibile(r.fraGiorni)}) · per <strong>{r.destinatario || "il cliente"}</strong>
          {r.citta ? ` · ${r.citta}` : ""}
        </p>
      </div>

      <div>
        <div className="card-titolo" style={{ fontSize: 13, marginBottom: 6 }}>L&apos;occasione</div>
        <span className="badge colorato" style={{ ["--badge-colore" as string]: t.colore }}>
          <span className="dot" />
          {r.titolo || t.nome}
        </span>
        <span className="secondario piccolo" style={{ marginLeft: 8 }}>{daChi}</span>
        {r.prova ? (
          <p className="piccolo" style={{ marginTop: 8, lineHeight: 1.5 }}>
            Dal biglietto: <q style={{ fontStyle: "italic" }}>{r.prova}</q>
          </p>
        ) : null}
        {r.motivoTipo ? <p className="terziario piccolo" style={{ marginTop: 4 }}>{r.motivoTipo}</p> : null}
        {r.delicato ? <p className="piccolo" style={{ marginTop: 6, color: "var(--red)" }}>Ricorrenza delicata: niente messaggi di festa.</p> : null}
      </div>

      <div>
        <div className="card-titolo" style={{ fontSize: 13, marginBottom: 6 }}>Come l&apos;abbiamo dedotta</div>
        <p className="piccolo" style={{ lineHeight: 1.55, margin: 0 }}>
          {r.origine === "manuale"
            ? "Aggiunta a mano nel registro."
            : `Dagli ordini: ${r.destinatario ? `${r.destinatario} ha ricevuto` : "ha ordinato"} qualcosa il ${giornoMese(r.giorno, r.mese)} ${r.ricorrenze === 1 ? "una volta" : `${r.ricorrenze} volte`} (${r.primoAnno === r.ultimoAnno ? r.primoAnno : `${r.primoAnno}–${r.ultimoAnno}`}).`}
          {r.ordini.length ? ` Ordini: ${r.ordini.join(", ")}.` : ""}
          {r.ultimaSpesa ? ` Ultima spesa ${r.ultimaSpesa.toFixed(2).replace(".", ",")} €.` : ""}
        </p>
        <p className="terziario piccolo" style={{ marginTop: 6 }}>
          Stato: {r.stato === "confermato" ? "confermata da una persona" : r.stato === "da-confermare" ? "da confermare (l'ha trovata l'app)" : r.stato}
          {r.note ? ` · nota: ${r.note}` : ""}
        </p>
      </div>

      <form action={modificaRicorrenza}>
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="torna" value={torna} />
        <div className="card-titolo" style={{ fontSize: 13, marginBottom: 6 }}>Correggi (si scrive in Orders)</div>
        <div className="form-riga">
          <div className="campo" style={{ marginBottom: 8 }}>
            <label>Occasione</label>
            <select name="tipo" defaultValue={r.tipo}>
              {Object.entries(TIPI_RICORRENZA).map(([chiave, x]) => (
                <option key={chiave} value={chiave}>{x.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo" style={{ marginBottom: 8 }}>
            <label>Per chi <span className="aiuto">(vuoto = il cliente)</span></label>
            <input type="text" name="destinatario" defaultValue={r.destinatario} />
          </div>
        </div>
        <div className="campo" style={{ marginBottom: 8 }}>
          <label>Come la chiamiamo</label>
          <input type="text" name="titolo" defaultValue={r.titolo} placeholder={`es. ${t.nome} di ${r.destinatario || r.clienteNome}`} />
        </div>
        <div className="form-piede" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ display: "flex", gap: 8 }}>
            <a className="btn ghost mini" href={`/clienti/${r.cliente}`}>Apri la scheda</a>
            {!r.delicato ? (
              <a className="btn ghost mini" href={`/mail/componi?cliente=${encodeURIComponent(r.cliente)}&occasione=${encodeURIComponent(r.titolo || t.nome)}`}>
                Fai gli auguri
              </a>
            ) : null}
          </span>
          <button className="btn mini" type="submit">Salva in Orders</button>
        </div>
      </form>
    </div>
  );
}
