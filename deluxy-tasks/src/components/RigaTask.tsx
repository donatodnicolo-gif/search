"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COLORE_PRIORITA, ETICHETTA_PRIORITA, TINTA_PRIORITA, type Priorita } from "@/lib/priorita";
import { COLORE_STATO, ETICHETTA_STATO, STATI_CHIUSI, TINTA_STATO, type Stato } from "@/lib/stati";
import { etichettaSistema } from "@/lib/sistemi";

export type LivelloUI = {
  id: string;
  priorita: string;
  data: string | null;
  nota: string | null;
};

export type TaskUI = {
  id: string;
  sistema: string;
  utenteEmail: string;
  utenteNome: string | null;
  titolo: string;
  descrizione: string | null;
  stato: string;
  priorita: string;
  scadenza: string | null;
  livelloSceltoId: string | null;
  livelli: LivelloUI[];
  link: string | null;
  contestoEtichetta: string | null;
  attiva: boolean;
};

function dataBreve(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function scadenzaTesto(iso: string | null): { testo: string; rossa: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorno = new Date(d);
  giorno.setHours(0, 0, 0, 0);
  const diff = Math.round((giorno.getTime() - oggi.getTime()) / 86400000);
  const fmt = d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  if (diff < 0) return { testo: `Scaduta ${fmt}`, rossa: true };
  if (diff === 0) return { testo: "Oggi", rossa: true };
  if (diff === 1) return { testo: "Domani", rossa: false };
  return { testo: fmt, rossa: false };
}

export function RigaTask({ task }: { task: TaskUI }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  // Conferma inline dell'archiviazione (Libro cap.7: mai irreversibile senza conferma).
  const [confermaArchivia, setConfermaArchivia] = useState(false);
  // Un fallimento non è mai invisibile (Libro cap.6): l'errore resta sulla card.
  const [errore, setErrore] = useState<string | null>(null);
  const chiusa = (STATI_CHIUSI as readonly string[]).includes(task.stato);

  async function azione(body: Record<string, unknown>) {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/interno/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setErrore("Non sono riuscito a salvare la modifica. Riprova.");
        return;
      }
      router.refresh();
    } catch {
      setErrore("Rete assente: la modifica non è stata salvata. Riprova.");
    } finally {
      setInCorso(false);
    }
  }

  const scad = scadenzaTesto(task.scadenza);
  const stato = task.stato as Stato;
  const priorita = task.priorita as Priorita;

  return (
    <div className={`task${chiusa ? " chiusa" : ""}`}>
      <button
        className={`check${task.stato === "completata" ? " fatta" : ""}`}
        title={task.stato === "completata" ? "Riapri" : "Segna completata"}
        disabled={inCorso}
        onClick={() => azione({ stato: task.stato === "completata" ? "aperta" : "completata" })}
      >
        ✓
      </button>

      <div className="task-corpo">
        <div className="task-titolo">
          {task.link ? (
            <a href={task.link} target="_blank" rel="noreferrer">
              {task.titolo}
            </a>
          ) : (
            task.titolo
          )}
        </div>
        {task.descrizione && <div className="task-desc">{task.descrizione}</div>}
        <div className="task-meta">
          {/* Provenienza = categoria: badge NEUTRO senza dot (Libro cap.5). */}
          <span className="badge">{etichettaSistema(task.sistema)}</span>
          {/* Stato: formula piena — dot (currentColor) + tinta -soft + testo semantico. */}
          <span
            className="badge"
            style={{
              color: COLORE_STATO[stato] ?? "var(--text-tertiary)",
              background: TINTA_STATO[stato] ?? "var(--fill)",
            }}
          >
            <span className="dot" />
            {ETICHETTA_STATO[stato] ?? task.stato}
          </span>
          {(priorita === "alta" || priorita === "urgente") && (
            <span
              className="badge"
              style={{ color: COLORE_PRIORITA[priorita], background: TINTA_PRIORITA[priorita] }}
            >
              <span className="dot" />
              {ETICHETTA_PRIORITA[priorita]}
            </span>
          )}
          {scad && <span className={`scad${scad.rossa && !chiusa ? " rossa" : ""}`}>{scad.testo}</span>}
          {task.contestoEtichetta && <span className="contesto">· {task.contestoEtichetta}</span>}
        </div>

        {/* Livelli di priorità con date diverse: il team sceglie quello attivo. */}
        {task.livelli.length > 1 && (
          <div className="livelli">
            {task.livelli.map((l) => {
              const p = l.priorita as Priorita;
              const attivo = l.id === task.livelloSceltoId;
              return (
                <button
                  key={l.id}
                  className={`livello${attivo ? " attivo" : ""}`}
                  disabled={inCorso || chiusa}
                  title={l.nota ?? ETICHETTA_PRIORITA[p]}
                  onClick={() => !attivo && azione({ livelloId: l.id })}
                >
                  <span className="dot" style={{ background: COLORE_PRIORITA[p] }} />
                  {ETICHETTA_PRIORITA[p]}
                  <span className="livello-data">{dataBreve(l.data)}</span>
                  {l.nota && <span className="livello-nota">{l.nota}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="task-azioni">
        {!task.attiva ? (
          // Vista «Archiviate»: da qui si torna indietro (l'archiviazione non è più senza ritorno).
          <button className="mini" disabled={inCorso} onClick={() => azione({ attiva: true })}>
            Ripristina
          </button>
        ) : confermaArchivia ? (
          <div className="conferma">
            Archivio «{task.titolo.length > 40 ? `${task.titolo.slice(0, 40)}…` : task.titolo}»?
            Sparisce dall'elenco; la ritrovi nel filtro «Archiviate».
            <div className="conferma-azioni">
              <button className="mini" disabled={inCorso} onClick={() => setConfermaArchivia(false)}>
                Annulla
              </button>
              <button className="mini danger" disabled={inCorso} onClick={() => azione({ attiva: false })}>
                Archivia
              </button>
            </div>
          </div>
        ) : (
          <button className="mini" disabled={inCorso} onClick={() => setConfermaArchivia(true)}>
            Archivia
          </button>
        )}
        {errore && (
          <span className="campo-errore" role="alert">
            {errore}
          </span>
        )}
      </div>
    </div>
  );
}
