"use client";

import { useEffect, useRef, useState } from "react";
import { cercaBeneficiari } from "@/lib/richieste-actions";
import type { BeneficiarioRegistro } from "@/lib/anagrafiche";

// Scelta del beneficiario per la richiesta di pagamento: RICERCA fra i fornitori
// del registro Anagrafiche (non una tendina) OPPURE scrittura libera.
//
// Perché non una tendina: l'elenco dei soli partner FINANCE con IBAN erano 17;
// i fornitori del registro sono molti di più e non ce li avevo tutti qui. Si
// cerca per nome, si sceglie, e beneficiario + IBAN si riempiono da soli (con
// l'intestatario del conto quando c'è — è il nome che la banca verifica contro
// l'IBAN). Restano modificabili a mano: la ricerca aiuta, non obbliga.
export function SceltaBeneficiario({
  nomeBeneficiario = "beneficiario",
  nomeIban = "iban",
}: {
  nomeBeneficiario?: string;
  nomeIban?: string;
}) {
  const [q, setQ] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [iban, setIban] = useState("");
  const [risultati, setRisultati] = useState<BeneficiarioRegistro[]>([]);
  const [aperto, setAperto] = useState(false);
  const [cerco, setCerco] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // ricerca con debounce: non una chiamata per tasto
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setRisultati([]);
      return;
    }
    setCerco(true);
    const timer = setTimeout(async () => {
      try {
        const r = await cercaBeneficiari(t);
        setRisultati(r);
        setAperto(true);
      } finally {
        setCerco(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  // chiudi la tendina dei risultati cliccando fuori
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const scegli = (b: BeneficiarioRegistro) => {
    setBeneficiario(b.intestatarioConto?.trim() || b.ragioneSociale?.trim() || b.nome);
    setIban((b.iban ?? "").replace(/\s+/g, "").toUpperCase());
    setQ("");
    setRisultati([]);
    setAperto(false);
  };

  return (
    <>
      <div className="full" ref={boxRef} style={{ position: "relative" }}>
        <label className="field-label">Cerca il beneficiario tra i fornitori (Anagrafiche)</label>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => risultati.length && setAperto(true)}
          placeholder="Scrivi il nome del fornitore…"
          autoComplete="off"
        />
        <span className="muted" style={{ fontSize: 12 }}>
          {cerco ? "Cerco nel registro…" : "Scegline uno e beneficiario + IBAN si riempiono. Oppure scrivili a mano qui sotto."}
        </span>
        {aperto && risultati.length > 0 && (
          <div
            style={{
              position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", marginTop: 4,
              background: "var(--surface)", border: "1px solid var(--hairline-strong)",
              borderRadius: "var(--radius-m)", boxShadow: "var(--shadow-card)", overflow: "hidden",
            }}
          >
            {risultati.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => scegli(b)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "9px 12px",
                  background: "transparent", border: "none", borderBottom: "1px solid var(--hairline)",
                  cursor: "pointer", fontSize: 13.5,
                }}
              >
                <div style={{ fontWeight: 500 }}>{b.ragioneSociale?.trim() || b.nome}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {[b.citta, b.pIva ? `P.IVA ${b.pIva}` : null, b.iban ? "IBAN in anagrafica" : "senza IBAN"].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}
        {aperto && !cerco && q.trim().length >= 2 && risultati.length === 0 && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Nessun fornitore trovato: scrivi beneficiario e IBAN a mano qui sotto.
          </div>
        )}
      </div>
      <div>
        <label className="field-label">Beneficiario</label>
        <input
          type="text"
          name={nomeBeneficiario}
          value={beneficiario}
          onChange={(e) => setBeneficiario(e.target.value)}
          placeholder="A chi va pagato"
        />
      </div>
      <div>
        <label className="field-label">IBAN</label>
        <input
          type="text"
          name={nomeIban}
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="IT60 X054 2811 1010 0000 0123 456"
        />
      </div>
    </>
  );
}
