"use client";

import { useState } from "react";

// Data di emissione + scadenza con i termini di pagamento come bottoni:
// "Vista fattura" (= stesso giorno), 30/60/90 gg e fine mese successivo.
// La scadenza resta comunque modificabile a mano nel campo data.

const TERMINI: { label: string; giorni: number | "fineMeseSucc" }[] = [
  { label: "Vista fattura", giorni: 0 },
  { label: "30 gg", giorni: 30 },
  { label: "60 gg", giorni: 60 },
  { label: "90 gg", giorni: 90 },
  { label: "Fine mese succ.", giorni: "fineMeseSucc" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function ScadenzaRapida({
  emissioneIniziale = "",
  scadenzaIniziale = "",
}: {
  emissioneIniziale?: string;
  scadenzaIniziale?: string;
}) {
  const [emissione, setEmissione] = useState(emissioneIniziale);
  const [scadenza, setScadenza] = useState(scadenzaIniziale);
  const [scelto, setScelto] = useState<string | null>(null);

  function applica(t: (typeof TERMINI)[number]) {
    const base = emissione ? new Date(emissione + "T00:00:00.000Z") : new Date();
    if (!emissione) setEmissione(iso(base));
    let d: Date;
    if (t.giorni === "fineMeseSucc") {
      // ultimo giorno del mese successivo a quello di emissione
      d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 2, 0));
    } else {
      d = new Date(base.getTime() + t.giorni * 86400000);
    }
    setScadenza(iso(d));
    setScelto(t.label);
  }

  return (
    <>
      <div>
        <label className="field-label">Data emissione</label>
        <input
          type="date"
          name="emissione"
          value={emissione}
          onChange={(e) => {
            setEmissione(e.target.value);
            setScelto(null);
          }}
        />
      </div>
      <div>
        <label className="field-label">
          Scadenza <span className="muted">(vuota = automatica da GG pagamento del partner)</span>
        </label>
        <input
          type="date"
          name="scadenza"
          value={scadenza}
          onChange={(e) => {
            setScadenza(e.target.value);
            setScelto(null);
          }}
        />
        <div className="termini">
          {TERMINI.map((t) => (
            <button
              key={t.label}
              type="button"
              className={`btn small ${scelto === t.label ? "primary" : "secondary"}`}
              onClick={() => applica(t)}
              title={`Scadenza a ${t.label.toLowerCase()} dalla data di emissione`}
            >
              {t.label}
            </button>
          ))}
          {scadenza && (
            <button
              type="button"
              className="btn small secondary"
              onClick={() => {
                setScadenza("");
                setScelto(null);
              }}
              title="Torna alla scadenza automatica dai giorni di pagamento del partner"
            >
              Azzera
            </button>
          )}
        </div>
      </div>
    </>
  );
}
