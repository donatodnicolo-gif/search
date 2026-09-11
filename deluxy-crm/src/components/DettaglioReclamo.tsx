"use client";

import { useEffect, useState } from "react";
import Modale from "./Modale";
import { gravitaReclamo, statoReclamo, type DettaglioReclamo as Dati } from "@/lib/reclami";

// Il dettaglio di un reclamo, in finestra (Libro §9): che cosa è successo, di
// chi è la colpa, che cosa si è deciso di fare e il filo di chi ci ha lavorato.
// Sola lettura: il reclamo si lavora nel Customer Service, e da qui ci si va
// con un bottone — due posti dove cambiare lo stesso stato sarebbero due verità.
//
// Il contenuto si legge da /api/interno/reclamo SOLO all'apertura: l'elenco
// porta gli id, non le storie.

type Props = {
  id: string;
  titolo: string;
  sotto?: string;
  /** L'indirizzo del Customer Service, per il bottone «Apri nel Customer Service». */
  baseCS: string;
  className?: string;
  bottone: React.ReactNode;
};

export default function DettaglioReclamo({ id, titolo, sotto, baseCS, className = "riga-apri", bottone }: Props) {
  return (
    <Modale bottone={bottone} titolo={titolo} sotto={sotto} className={className} stretta>
      <Contenuto id={id} baseCS={baseCS} />
    </Modale>
  );
}

function quando(iso: string, conOra = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(conOra ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function Contenuto({ id, baseCS }: { id: string; baseCS: string }) {
  const [d, setD] = useState<Dati | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/interno/reclamo?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (res) => {
        const corpo = (await res.json()) as Dati & { errore?: string };
        if (!vivo) return;
        if (!res.ok || !corpo.reclamo) setErrore(corpo.errore ?? `Errore ${res.status}`);
        else setD(corpo);
      })
      .catch(() => vivo && setErrore("Rete assente: riprova."));
    return () => {
      vivo = false;
    };
  }, [id]);

  if (errore) return <div className="modale-azioni"><div className="errore-card">{errore}</div></div>;
  if (!d) return <div className="modale-azioni"><p className="terziario piccolo">Leggo dal Customer Service…</p></div>;

  const r = d.reclamo;
  const st = statoReclamo(r.stato, d.etichette);
  const gr = gravitaReclamo(r.gravita, d.etichette);

  return (
    <div className="modale-azioni" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span className="badge colorato" style={{ ["--badge-colore" as string]: st.colore }}>
            <span className="dot" />
            {st.nome}
          </span>
          <span className="badge colorato" style={{ ["--badge-colore" as string]: gr.colore }}>
            <span className="dot" />
            {gr.nome}
          </span>
          {r.domandeAperte > 0 ? (
            <span className="chip">
              {r.domandeAperte} {r.domandeAperte === 1 ? "domanda" : "domande"} senza risposta
            </span>
          ) : null}
        </div>
        <p className="secondario piccolo" style={{ margin: 0 }}>
          Aperto il {quando(r.creatoIl)}
          {r.ordineNumero ? ` · ordine ${r.ordineNumero}` : ""}
          {r.negozioNome ? ` · ${r.negozioNome}` : ""}
          {r.risoltoIl ? ` · risolto il ${quando(r.risoltoIl)}` : ""}
        </p>
      </div>

      <div>
        <div className="card-titolo" style={{ fontSize: 13, marginBottom: 4 }}>Che cosa è successo</div>
        <p style={{ margin: 0 }}>{r.casistica || "Casistica non indicata"}</p>
        {r.descrizione ? (
          <p className="secondario piccolo" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{r.descrizione}</p>
        ) : null}
        {r.prodotti.length ? (
          <p className="secondario piccolo" style={{ marginTop: 6 }}>
            Sui prodotti: {r.prodotti.join(" · ")}
          </p>
        ) : null}
      </div>

      <div>
        <div className="card-titolo" style={{ fontSize: 13, marginBottom: 4 }}>Di chi è la colpa</div>
        <p style={{ margin: 0 }}>
          {r.colpaNome || (r.colpaTipo === "nessuno" || !r.colpaTipo ? "Da attribuire" : r.colpaTipo)}
        </p>
      </div>

      {r.azioni.length ? (
        <div>
          <div className="card-titolo" style={{ fontSize: 13, marginBottom: 4 }}>Che cosa si fa</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {r.azioni.map((a, i) => (
              <li key={i} className="secondario piccolo">{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.esito ? (
        <div>
          <div className="card-titolo" style={{ fontSize: 13, marginBottom: 4 }}>Com&apos;è andata</div>
          <p className="secondario piccolo" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.esito}</p>
        </div>
      ) : null}

      {d.messaggi.length ? (
        <div>
          <div className="card-titolo" style={{ fontSize: 13, marginBottom: 4 }}>Chi ci ha lavorato</div>
          <div className="timeline">
            {d.messaggi.map((m) => (
              <div className="timeline-voce" key={m.id}>
                <div className="timeline-corpo">
                  <div className="timeline-titolo" style={{ whiteSpace: "pre-wrap" }}>
                    {m.domanda ? "❓ " : ""}
                    {m.testo}
                  </div>
                  <div className="timeline-quando">
                    {m.autoreNome || "—"} · {quando(m.creatoIl, true)}
                    {m.senzaRisposta ? " · aspetta una risposta" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="form-piede" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span className="terziario piccolo">Il reclamo si lavora nel Customer Service: lì vive.</span>
        <a className="btn mini" href={`${baseCS}${r.link}`} target="_blank" rel="noreferrer">
          Apri nel Customer Service
        </a>
      </div>
    </div>
  );
}
