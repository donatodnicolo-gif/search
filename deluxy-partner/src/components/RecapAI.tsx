"use client";

import { useState } from "react";

// Sezione "Recap AI": genera l'analisi chiamando l'API OpenAI (server) e la
// mostra qui. In alternativa permette di copiare il prompt / aprire ChatGPT.
export function RecapAI({ partnerId, prompt }: { partnerId: string; prompt: string }) {
  const [aperto, setAperto] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recap, setRecap] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function copia() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      setAperto(true);
    }
  }

  async function genera() {
    setLoading(true);
    setErrore(null);
    setRecap(null);
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId }),
      });
      const data = await res.json();
      if (!res.ok) setErrore(data.error ?? "Errore nella generazione del recap.");
      else setRecap(data.recap);
    } catch (e) {
      setErrore(`Errore di rete: ${(e as Error).message}`);
    } finally {
      setLoading(false);
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
              Analisi da esperto di finance su crediti, debiti e andamento mensile del partner.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn primary small" type="button" onClick={genera} disabled={loading}>
            {loading ? "Sto analizzando…" : recap ? "Rigenera recap" : "Genera recap AI"}
          </button>
          <button className="btn secondary small" type="button" onClick={() => setAperto((v) => !v)}>
            {aperto ? "Nascondi dati inviati" : "Vedi dati inviati"}
          </button>
          <button className="btn secondary small" type="button" onClick={copia}>
            {copiato ? "Copiato ✓" : "Copia prompt"}
          </button>
        </div>
      </div>

      {loading && (
        <p style={{ marginTop: 14, fontSize: 13.5, color: "var(--text-secondary)" }}>
          Sto chiedendo l&apos;analisi al modello… può richiedere qualche secondo.
        </p>
      )}

      {errore && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: "var(--radius-m)",
            background: "rgba(215,0,21,0.06)",
            border: "1px solid rgba(215,0,21,0.15)",
            color: "var(--red)",
            fontSize: 13.5,
          }}
        >
          {errore}
        </div>
      )}

      {recap && (
        <div
          style={{
            marginTop: 14,
            padding: "18px 20px",
            borderRadius: "var(--radius-l)",
            background: "var(--bg)",
            border: "1px solid var(--hairline)",
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {recap}
          <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Generato da AI — verifica sempre i numeri prima di decisioni operative.
          </div>
        </div>
      )}

      {aperto && (
        <textarea
          readOnly
          value={prompt}
          onFocus={(e) => e.currentTarget.select()}
          rows={14}
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
