"use client";

import { useEffect, useRef, useState } from "react";
import { cercaFattureEmesse } from "@/lib/richieste-actions";
import type { FicFatturaBreve } from "@/lib/fic";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

// Riferimento della fattura collegata alla richiesta di pagamento.
//
// È un campo di TESTO LIBERO — quello che scrivi è il riferimento — con una
// mano in più: mentre digiti, se il testo combacia con una fattura EMESSA
// (ragione sociale, numero, importo, P.IVA) compaiono i suggerimenti e con un
// clic lo riempi in forma pulita.
//
// ⚠️ Le fatture dei FORNITORI (fatture d'acquisto) NON sono cercabili: la
// connessione a Fatture in Cloud non ha il permesso di leggerle (risponde
// «No permission»). Per quelle il riferimento si scrive a mano — ed è il motivo
// per cui il campo resta a testo libero invece di una tendina chiusa.
export function CercaFatturaEmessa({ name = "fatturaFornitoreRif" }: { name?: string }) {
  const [valore, setValore] = useState("");
  const [risultati, setRisultati] = useState<FicFatturaBreve[]>([]);
  const [aperto, setAperto] = useState(false);
  const [cerco, setCerco] = useState(false);
  const scelto = useRef(false); // dopo un clic non riaprire i suggerimenti
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scelto.current) { scelto.current = false; return; }
    const t = valore.trim();
    if (t.length < 2) { setRisultati([]); setAperto(false); return; }
    setCerco(true);
    const timer = setTimeout(async () => {
      try {
        const r = await cercaFattureEmesse(t);
        setRisultati(r);
        setAperto(r.length > 0);
      } finally {
        setCerco(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [valore]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const scegli = (f: FicFatturaBreve) => {
    scelto.current = true;
    setValore(`n. ${f.numero} — ${f.cliente} — ${eur.format(f.importo)} (IVA incl.)`);
    setRisultati([]);
    setAperto(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        type="text"
        name={name}
        value={valore}
        onChange={(e) => setValore(e.target.value)}
        onFocus={() => risultati.length && setAperto(true)}
        placeholder="es. 44/2026 del 12/08 — o cerca un cliente per collegarne una emessa"
        autoComplete="off"
      />
      <span className="muted" style={{ fontSize: 12 }}>
        {cerco
          ? "Cerco fra le fatture emesse…"
          : "Scrivi il riferimento; se digiti un cliente compaiono le fatture emesse da collegare."}
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
              <div style={{ fontWeight: 500 }}>n. {f.numero} · {eur.format(f.importo)} <span className="muted" style={{ fontWeight: 400 }}>IVA incl.</span></div>
              <div className="muted" style={{ fontSize: 12 }}>
                {[f.cliente, f.pIva ? `P.IVA ${f.pIva}` : null, f.data].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
