"use client";

import { useState } from "react";

// Termini di pagamento predefiniti per la scadenza fattura. Alla scelta calcola
// la data di scadenza dalla data documento; "FM" = fine mese (ultimo giorno del
// mese in cui cade la scadenza). Resta modificabile a mano ("Personalizzata").
const TERMINI = [
  { label: "Vista fattura (alla data documento)", giorni: 0, fineMese: false },
  { label: "+30 giorni", giorni: 30, fineMese: false },
  { label: "+30 giorni fine mese", giorni: 30, fineMese: true },
  { label: "+60 giorni", giorni: 60, fineMese: false },
  { label: "+60 giorni fine mese", giorni: 60, fineMese: true },
  { label: "+90 giorni", giorni: 90, fineMese: false },
  { label: "+90 giorni fine mese", giorni: 90, fineMese: true },
];

function formatta(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}

function calcola(dataDoc: string, giorni: number, fineMese: boolean): string {
  const base = dataDoc ? new Date(dataDoc + "T00:00:00") : new Date();
  base.setDate(base.getDate() + giorni);
  if (fineMese) base.setMonth(base.getMonth() + 1, 0); // ultimo giorno del mese
  return formatta(base);
}

export function TerminiPagamento({ oggi }: { oggi: string }) {
  const [scadenza, setScadenza] = useState("");
  const [termine, setTermine] = useState("");

  function applica(v: string) {
    setTermine(v);
    if (v === "" || v === "custom") return;
    const t = TERMINI[parseInt(v)];
    const dataInput = document.querySelector<HTMLInputElement>('input[name="data"]');
    const dataDoc = dataInput?.value || oggi;
    setScadenza(calcola(dataDoc, t.giorni, t.fineMese));
  }

  return (
    <>
      <div>
        <label className="field-label">Termini di pagamento</label>
        <select value={termine} onChange={(e) => applica(e.target.value)}>
          <option value="">— scegli un termine —</option>
          {TERMINI.map((t, i) => (
            <option key={t.label} value={i}>{t.label}</option>
          ))}
          <option value="custom">Personalizzata (scegli la data)</option>
        </select>
      </div>
      <div>
        <label className="field-label">Scadenza pagamento</label>
        <input
          type="date"
          name="scadenza"
          value={scadenza}
          onChange={(e) => { setScadenza(e.target.value); setTermine("custom"); }}
        />
      </div>
    </>
  );
}
