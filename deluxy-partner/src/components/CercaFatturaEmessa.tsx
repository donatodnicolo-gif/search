"use client";

import { useEffect, useRef, useState } from "react";
import { cercaFattureEmesse } from "@/lib/richieste-actions";
import type { FicFatturaBreve } from "@/lib/fic";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

// Collega alla richiesta di pagamento UNA fattura emessa, cercandola fra TUTTE
// (ragione sociale, numero, importo, P.IVA) invece di scriverne il riferimento a
// mano. La scelta riempie un campo nascosto `fatturaFornitoreRif` con un
// riferimento leggibile («n. 379/2026 — TIFFANY & CO. — 1.692,31 €»), così il
// dato che parte a Transactions e resta in archivio è pulito e ritrovabile.
export function CercaFatturaEmessa({ name = "fatturaFornitoreRif" }: { name?: string }) {
  const [q, setQ] = useState("");
  const [scelta, setScelta] = useState<string>("");
  const [risultati, setRisultati] = useState<FicFatturaBreve[]>([]);
  const [aperto, setAperto] = useState(false);
  const [cerco, setCerco] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRisultati([]); return; }
    setCerco(true);
    const timer = setTimeout(async () => {
      try {
        setRisultati(await cercaFattureEmesse(t));
        setAperto(true);
      } finally {
        setCerco(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const scegli = (f: FicFatturaBreve) => {
    setScelta(`n. ${f.numero} — ${f.cliente} — ${eur.format(f.importo)}`);
    setQ("");
    setRisultati([]);
    setAperto(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input type="hidden" name={name} value={scelta} />
      {scelta ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{scelta}</span>
          <button type="button" className="btn small secondary" onClick={() => setScelta("")}>Cambia</button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => risultati.length && setAperto(true)}
            placeholder="Cerca per ragione sociale, numero, importo o P.IVA…"
            autoComplete="off"
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {cerco ? "Cerco fra le fatture emesse…" : "Cerca fra tutte le fatture emesse e scegline una."}
          </span>
          {aperto && risultati.length > 0 && (
            <div
              style={{
                position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", marginTop: 4,
                background: "var(--surface)", border: "1px solid var(--hairline-strong)",
                borderRadius: "var(--radius-m)", boxShadow: "var(--shadow-card)", overflow: "hidden",
              }}
            >
              {risultati.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => scegli(f)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "9px 12px",
                    background: "transparent", border: "none", borderBottom: "1px solid var(--hairline)",
                    cursor: "pointer", fontSize: 13.5,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>
                    n. {f.numero} · {eur.format(f.importo)}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {[f.cliente, f.pIva ? `P.IVA ${f.pIva}` : null, f.data].filter(Boolean).join(" · ")}
                  </div>
                </button>
              ))}
            </div>
          )}
          {aperto && !cerco && q.trim().length >= 2 && risultati.length === 0 && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Nessuna fattura trovata con questo criterio.
            </div>
          )}
        </>
      )}
    </div>
  );
}
