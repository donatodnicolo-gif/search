"use client";

import { useState } from "react";

// Editor delle righe della pro-forma: aggiunta/rimozione righe e totali live.
// I valori viaggiano nel form come campi ripetuti (rigaDescrizione, rigaQuantita,
// rigaPrezzo, rigaIva), letti in ordine dalla server action.

type Riga = {
  descrizione: string;
  quantita: string;
  prezzoUnitario: string;
  aliquotaIva: string;
};

const RIGA_VUOTA: Riga = { descrizione: "", quantita: "1", prezzoUnitario: "", aliquotaIva: "22" };

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const parse = (v: string) => {
  const x = parseFloat(v.replace(",", "."));
  return isNaN(x) ? 0 : x;
};

export function RigheProForma({ iniziali }: { iniziali?: Riga[] }) {
  const [righe, setRighe] = useState<Riga[]>(
    iniziali && iniziali.length > 0 ? iniziali : [{ ...RIGA_VUOTA }]
  );

  const set = (i: number, k: keyof Riga, v: string) =>
    setRighe((r) => r.map((riga, j) => (j === i ? { ...riga, [k]: v } : riga)));

  const imponibile = righe.reduce((a, r) => a + parse(r.quantita) * parse(r.prezzoUnitario), 0);
  const iva = righe.reduce(
    (a, r) => a + (parse(r.quantita) * parse(r.prezzoUnitario) * parse(r.aliquotaIva)) / 100,
    0
  );

  return (
    <div className="full">
      <label className="field-label">Righe del documento <span className="req">*</span></label>
      <div className="righe-editor">
        <div className="righe-head">
          <span>Descrizione</span>
          <span className="num">Q.tà</span>
          <span className="num">Prezzo unit. €</span>
          <span className="num">IVA %</span>
          <span className="num">Importo</span>
          <span />
        </div>
        {righe.map((r, i) => (
          <div className="righe-row" key={i}>
            <input
              type="text"
              name="rigaDescrizione"
              value={r.descrizione}
              onChange={(e) => set(i, "descrizione", e.target.value)}
              placeholder="es. Consegne guanti bianchi — Giugno 2026"
            />
            <input
              type="text"
              inputMode="decimal"
              name="rigaQuantita"
              value={r.quantita}
              onChange={(e) => set(i, "quantita", e.target.value)}
              className="num"
            />
            <input
              type="text"
              inputMode="decimal"
              name="rigaPrezzo"
              value={r.prezzoUnitario}
              onChange={(e) => set(i, "prezzoUnitario", e.target.value)}
              placeholder="0,00"
              className="num"
            />
            <input
              type="text"
              inputMode="decimal"
              name="rigaIva"
              value={r.aliquotaIva}
              onChange={(e) => set(i, "aliquotaIva", e.target.value)}
              className="num"
            />
            <span className="num righe-importo">
              {eur.format(parse(r.quantita) * parse(r.prezzoUnitario))}
            </span>
            <button
              type="button"
              className="btn small danger"
              onClick={() => setRighe((x) => x.filter((_, j) => j !== i))}
              disabled={righe.length === 1}
              title="Rimuovi riga"
            >
              ×
            </button>
          </div>
        ))}
        <div className="righe-footer">
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setRighe((r) => [...r, { ...RIGA_VUOTA }])}
          >
            + Aggiungi riga
          </button>
          <span className="righe-totali">
            Imponibile <strong>{eur.format(imponibile)}</strong> · IVA <strong>{eur.format(iva)}</strong> ·
            Totale <strong>{eur.format(imponibile + iva)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
