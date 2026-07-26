"use client";

import { useMemo, useState } from "react";

// Il riquadro «Prendi lo script pronto». Si sceglie per quale app lo si vuole:
// il testo mostrato è già composto con i valori di quell'app. I segreti (token,
// password) non stanno nel database: si incollano qui, restano nel browser e
// finiscono solo nel testo che si copia.

export type VersioneApp = {
  chiave: string;
  nome: string;
  corpo: string; // già composto con i valori dell'app
  segreti: { chiave: string; etichetta: string | null }[];
  mancanti: string[]; // variabili obbligatorie senza valore (segreti esclusi)
};

export function CopiaScript({ versioni }: { versioni: VersioneApp[] }) {
  const [scelta, setScelta] = useState(versioni[0]?.chiave ?? "");
  const [segreti, setSegreti] = useState<Record<string, string>>({});
  const [copiato, setCopiato] = useState(false);

  const versione = versioni.find((v) => v.chiave === scelta) ?? versioni[0];

  const testo = useMemo(() => {
    if (!versione) return "";
    let out = versione.corpo;
    for (const s of versione.segreti) {
      const valore = segreti[`${versione.chiave}:${s.chiave}`];
      if (valore) out = out.split(`{{${s.chiave}}}`).join(valore);
    }
    return out;
  }, [versione, segreti]);

  if (!versione) return null;

  async function copia() {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      setCopiato(false);
    }
  }

  return (
    <div className="scheda">
      <div className="copia-testa">
        <div className="scheda-titolo" style={{ margin: 0 }}>Script pronto da copiare</div>
        <div className="copia-scelte">
          <select value={scelta} onChange={(e) => setScelta(e.target.value)} aria-label="Per quale app">
            {versioni.map((v) => (
              <option key={v.chiave} value={v.chiave}>{v.nome}</option>
            ))}
          </select>
          <button type="button" className="btn" onClick={copia}>
            {copiato ? "Copiato" : "Copia"}
          </button>
        </div>
      </div>

      {versione.segreti.length > 0 && (
        <div className="valori-app" style={{ marginTop: 0, paddingTop: 0, borderTop: "none", marginBottom: 14 }}>
          {versione.segreti.map((s) => (
            <div className="valore-campo" key={s.chiave}>
              <label htmlFor={`seg-${versione.chiave}-${s.chiave}`}>{s.chiave}</label>
              <input
                id={`seg-${versione.chiave}-${s.chiave}`}
                type="password"
                autoComplete="off"
                placeholder={s.etichetta ?? "incolla qui il segreto"}
                value={segreti[`${versione.chiave}:${s.chiave}`] ?? ""}
                onChange={(e) =>
                  setSegreti((v) => ({ ...v, [`${versione.chiave}:${s.chiave}`]: e.target.value }))
                }
              />
              <span className="campo-aiuto">non viene salvato: resta in questa pagina</span>
            </div>
          ))}
        </div>
      )}

      {versione.mancanti.length > 0 && (
        <div className="avviso-attenzione">
          Senza valore per {versione.mancanti.join(", ")}: nel testo restano i segnaposto.
        </div>
      )}

      <pre className="codice">{testo || "// (script vuoto)"}</pre>
    </div>
  );
}
