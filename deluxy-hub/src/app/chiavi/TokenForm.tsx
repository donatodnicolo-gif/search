"use client";

import { useState } from "react";
import { creaToken } from "@/lib/chiavi-actions";

// Generazione del token lato browser: il valore in chiaro non passa mai dal
// server prima di essere hashato. L'admin lo copia qui una volta sola (dopo il
// salvataggio non è più recuperabile: sul DB c'è solo l'hash).

function generaToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `hub_${hex}`;
}

export function TokenForm({ progetti }: { progetti: string[] }) {
  const [token, setToken] = useState("");
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    try {
      await navigator.clipboard.writeText(token);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1500);
    } catch {
      /* la clipboard può essere negata: l'admin seleziona e copia a mano */
    }
  }

  return (
    <form action={creaToken} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "end" }}>
        <label className="campo" style={{ marginBottom: 0 }}>
          <span>A chi serve (nome)</span>
          <input name="nome" required placeholder="deluxy-scout" />
        </label>
      </div>

      <div className="campo" style={{ marginBottom: 0 }}>
        <span>Progetti leggibili (nessuna spunta = tutti)</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
          {progetti.map((p) => (
            <label
              key={p}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 13,
                padding: "7px 13px",
                border: "1px solid var(--hairline-strong)",
                borderRadius: "var(--radius-pill)",
                cursor: "pointer",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              <input type="checkbox" name="progetti" value={p} style={{ width: "auto", margin: 0 }} />
              {p}
            </label>
          ))}
        </div>
      </div>

      <input type="hidden" name="token" value={token} />

      {!token ? (
        <div>
          <button
            type="button"
            className="btn"
            onClick={() => setToken(generaToken())}
            style={{ justifyContent: "center" }}
          >
            Genera token
          </button>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--hairline-strong)",
            borderRadius: "var(--radius-m, 12px)",
            padding: 12,
            display: "grid",
            gap: 8,
            background: "var(--surface-2, #fafafa)",
          }}
        >
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            Copialo <strong>ora</strong>: dopo il salvataggio non sarà più visibile.
          </span>
          <code style={{ fontSize: 12.5, wordBreak: "break-all", userSelect: "all" }}>{token}</code>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={copia}>
              {copiato ? "Copiato ✓" : "Copia"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setToken(generaToken())}>
              Rigenera
            </button>
          </div>
        </div>
      )}

      <div>
        <button type="submit" className="btn primary" disabled={!token} style={{ justifyContent: "center" }}>
          Salva token
        </button>
      </div>
    </form>
  );
}
