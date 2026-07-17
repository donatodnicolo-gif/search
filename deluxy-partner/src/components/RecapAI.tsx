"use client";

import { useState } from "react";

// Sezione "Recap AI": mostra un prompt precompilato con tutta la situazione del
// partner, lo copia negli appunti e apre ChatGPT. Nessun dato viene inviato
// automaticamente: e' l'utente a incollare il testo in ChatGPT.
export function RecapAI({ prompt }: { prompt: string }) {
  const [aperto, setAperto] = useState(false);
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      setAperto(true);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="empty-icon" style={{ margin: 0, width: 38, height: 38, fontSize: 18 }}>✦</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Recap AI della situazione</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Manda crediti, debiti e andamento mensile a ChatGPT per un&apos;analisi da esperto di finance.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn secondary small" type="button" onClick={() => setAperto((v) => !v)}>
            {aperto ? "Nascondi testo" : "Mostra testo"}
          </button>
          <button className="btn secondary small" type="button" onClick={copia}>
            {copiato ? "Copiato ✓" : "Copia prompt"}
          </button>
          <a
            className="btn primary small"
            href="https://chatgpt.com/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={copia}
          >
            Copia e apri ChatGPT
          </a>
        </div>
      </div>

      {aperto && (
        <textarea
          readOnly
          value={prompt}
          onFocus={(e) => e.currentTarget.select()}
          rows={16}
          style={{
            marginTop: 14,
            width: "100%",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12.5,
            lineHeight: 1.5,
            resize: "vertical",
          }}
        />
      )}
    </div>
  );
}
