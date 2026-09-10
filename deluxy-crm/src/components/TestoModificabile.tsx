"use client";

import { useState } from "react";

// Un testo che si modifica «in visualizzazione»: accanto c'è la matitina, al
// click il paragrafo diventa un textarea con Salva/Annulla, e il salvataggio è
// un normale form verso la server action (passata dal server come `action`).
// Niente stato remoto qui dentro: dopo il redirect la pagina si rilegge.
export default function TestoModificabile({
  testo,
  vuoto,
  action,
  campi,
  nomeCampo = "testo",
  etichettaSalva = "Salva",
  righe = 3,
  segnaposto,
}: {
  testo: string | null;
  /** Cosa si legge quando non c'è ancora niente. */
  vuoto: string;
  action: (fd: FormData) => Promise<void>;
  /** Campi nascosti del form (chiave del cliente, torna…). */
  campi: Record<string, string>;
  nomeCampo?: string;
  etichettaSalva?: string;
  righe?: number;
  segnaposto?: string;
}) {
  const [inModifica, setInModifica] = useState(false);

  if (!inModifica) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0, flex: 1, whiteSpace: "pre-wrap" }} className={testo ? undefined : "terziario"}>
          {testo || vuoto}
        </p>
        <button
          type="button"
          className="btn ghost mini"
          onClick={() => setInModifica(true)}
          aria-label={testo ? "Modifica il testo" : "Scrivi il testo"}
          title={testo ? "Modifica" : "Scrivi"}
          style={{ flex: "0 0 auto" }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
            <path d="M13.5 6.5l3 3" />
          </svg>
          <span style={{ marginLeft: 6 }}>{testo ? "Modifica" : "Scrivi"}</span>
        </button>
      </div>
    );
  }

  return (
    <form action={action}>
      {Object.entries(campi).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="campo" style={{ marginBottom: 8 }}>
        <textarea name={nomeCampo} rows={righe} defaultValue={testo ?? ""} placeholder={segnaposto} autoFocus style={{ minHeight: 70 }} />
      </div>
      <div className="form-piede" style={{ justifyContent: "space-between" }}>
        <button type="button" className="link-quieto" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13 }} onClick={() => setInModifica(false)}>
          Annulla
        </button>
        <button className="btn mini" type="submit">{etichettaSalva}</button>
      </div>
    </form>
  );
}
