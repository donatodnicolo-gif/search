"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// L'unica cosa che di una persona si scrive in Budgets dal 06/09/2026: a
// quale maison attribuire il suo costo (vuoto = struttura) e una nota. Tutto
// il resto — contratto, compenso, squadra, date — abita in Personale.
// Agganciato per id di Personale; una riga per anno (PUT /api/dipendenti).

type MaisonOpt = { id: string; nome: string };

export function OrganicoEditor({
  year,
  personaleId,
  nome,
  maisonId,
  maisonNome,
  note,
  maisons,
}: {
  year: number;
  personaleId: string;
  nome: string;
  maisonId: string | null;
  maisonNome: string | null;
  note: string | null;
  maisons: MaisonOpt[];
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState({ maisonId: maisonId ?? "", note: note ?? "" });
  const [salvo, setSalvo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    setSalvo(true);
    setErrore(null);
    const res = await fetch("/api/dipendenti", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        personaleId,
        nome,
        maisonId: form.maisonId || null,
        note: form.note.trim() || null,
      }),
    });
    setSalvo(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setErrore(body?.error ?? "Salvataggio non riuscito, riprovare.");
      return;
    }
    setAperto(false);
    router.refresh();
  }

  if (!aperto) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className={maisonNome ? undefined : "muted"}>{maisonNome ?? "struttura"}</span>
        {note && <span className="muted" style={{ fontSize: 12 }} title={note}>· {note.length > 24 ? `${note.slice(0, 24)}…` : note}</span>}
        <button className="btn secondary small" onClick={() => setAperto(true)}>Modifica</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
      <select
        value={form.maisonId}
        onChange={(e) => setForm({ ...form, maisonId: e.target.value })}
        aria-label={`Maison a cui attribuire il costo di ${nome}`}
      >
        <option value="">Struttura (nessuna maison)</option>
        {maisons.map((m) => (
          <option key={m.id} value={m.id}>{m.nome}</option>
        ))}
      </select>
      <input
        type="text"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        placeholder="Nota di budget (facoltativa)"
        aria-label={`Nota di budget per ${nome}`}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button className="btn primary small" onClick={salva} disabled={salvo}>
          {salvo ? "Salvo…" : "Salva"}
        </button>
        <button
          className="btn secondary small"
          onClick={() => {
            setForm({ maisonId: maisonId ?? "", note: note ?? "" });
            setErrore(null);
            setAperto(false);
          }}
        >
          Annulla
        </button>
        {errore && <span style={{ color: "var(--red)", fontSize: 12 }}>{errore}</span>}
      </div>
    </div>
  );
}
