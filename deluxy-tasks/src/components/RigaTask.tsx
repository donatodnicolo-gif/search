"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COLORE_PRIORITA, ETICHETTA_PRIORITA, type Priorita } from "@/lib/priorita";
import { COLORE_STATO, ETICHETTA_STATO, STATI_CHIUSI, type Stato } from "@/lib/stati";
import { coloreSistema, etichettaSistema } from "@/lib/sistemi";

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
  const chiusa = (STATI_CHIUSI as readonly string[]).includes(task.stato);

  async function azione(body: Record<string, unknown>) {
    setInCorso(true);
    try {
      await fetch(`/api/interno/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
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
          <span className="badge">
            <span className="dot" style={{ background: coloreSistema(task.sistema) }} />
            {etichettaSistema(task.sistema)}
          </span>
          <span className="badge">
            <span className="dot" style={{ background: COLORE_STATO[stato] ?? "var(--text-tertiary)" }} />
            {ETICHETTA_STATO[stato] ?? task.stato}
          </span>
          {(priorita === "alta" || priorita === "urgente") && (
            <span className="badge">
              <span className="dot" style={{ background: COLORE_PRIORITA[priorita] }} />
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
        <button className="mini" disabled={inCorso} onClick={() => azione({ attiva: false })}>
          Archivia
        </button>
      </div>
    </div>
  );
}
