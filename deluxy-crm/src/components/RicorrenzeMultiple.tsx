"use client";

import { useState } from "react";

// Più ricorrenze in un colpo solo, dalla scheda del cliente: il compleanno
// suo, quello della moglie, l'anniversario… Ogni riga è una ricorrenza con il
// suo tipo; il form le manda tutte insieme (campi indicizzati r0_*, r1_*…) e
// l'action le PROPONE a Orders una per una, perché il registro è suo.
//
// Client component solo per aggiungere/togliere righe: i dati viaggiano in un
// normale form POST verso la server action.

type Tipo = { chiave: string; nome: string };

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

const MAX_RIGHE = 10;

export default function RicorrenzeMultiple({ tipi }: { tipi: Tipo[] }) {
  // Chiavi stabili per riga: togliendo la seconda, la terza non perde i valori.
  const [righe, setRighe] = useState<number[]>([0]);
  const [prossima, setProssima] = useState(1);

  return (
    <>
      <input type="hidden" name="righe" value={righe.join(",")} />
      {righe.map((k, i) => (
        <fieldset key={k} className="riga-ricorrenza">
          <legend>
            Ricorrenza {i + 1}
            {righe.length > 1 ? (
              <button
                type="button"
                className="link-quieto"
                style={{ background: "none", border: 0, padding: 0, marginLeft: 10, cursor: "pointer", fontSize: 12 }}
                onClick={() => setRighe((r) => r.filter((x) => x !== k))}
              >
                togli
              </button>
            ) : null}
          </legend>
          <div className="form-riga">
            <div className="campo">
              <label>Giorno <span className="ob">*</span></label>
              <input type="number" name={`r${k}_giorno`} min={1} max={31} required />
            </div>
            <div className="campo">
              <label>Mese <span className="ob">*</span></label>
              <select name={`r${k}_mese`} required defaultValue="">
                <option value="" disabled>—</option>
                {MESI.map((m, j) => (
                  <option key={m} value={j + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Tipo</label>
              <select name={`r${k}_tipo`} defaultValue="compleanno">
                {tipi.map((t) => (
                  <option key={t.chiave} value={t.chiave}>{t.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-riga">
            <div className="campo">
              <label>Per chi <span className="aiuto">(vuoto = il cliente)</span></label>
              <input type="text" name={`r${k}_destinatario`} placeholder="es. la moglie, Anna" />
            </div>
            <div className="campo">
              <label>Come la chiamiamo</label>
              <input type="text" name={`r${k}_titolo`} placeholder="es. Compleanno di Anna" />
            </div>
          </div>
          <div className="campo">
            <label>Note</label>
            <input type="text" name={`r${k}_note`} placeholder="es. preferisce le peonie" />
          </div>
        </fieldset>
      ))}
      <div className="form-piede" style={{ justifyContent: "space-between" }}>
        <button
          type="button"
          className="btn ghost mini"
          disabled={righe.length >= MAX_RIGHE}
          onClick={() => {
            setRighe((r) => [...r, prossima]);
            setProssima((n) => n + 1);
          }}
        >
          + Un&apos;altra ricorrenza
        </button>
        <button className="btn" type="submit">
          {righe.length > 1 ? `Salva ${righe.length} ricorrenze nel registro` : "Salva nel registro"}
        </button>
      </div>
    </>
  );
}
