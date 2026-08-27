"use client";

import { useState } from "react";

// Conferma distruttiva narrativa (Libro UX §7): un'azione che cancella o revoca
// non parte MAI al primo click. Si mostra il NOME dell'oggetto, la CONSEGUENZA,
// e solo allora un bottone ROSSO PIENO col verbo. «Annulla» a sinistra, distruttiva
// a destra (HIG). È un leaf client così può vivere anche dentro una pagina server:
// la server action passa come prop.
export function ConfermaAzione({
  action,
  campiNascosti,
  verbo,
  titolo,
  conseguenza,
  larghezza = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  campiNascosti: Record<string, string>;
  verbo: string; // es. "Elimina utente"
  titolo: string; // es. 'Elimino «Maria Rossi»?'
  conseguenza: string;
  larghezza?: boolean; // bottone iniziale a piena larghezza
}) {
  const [chiedi, setChiedi] = useState(false);

  if (!chiedi) {
    return (
      <button
        type="button"
        className="btn danger"
        style={larghezza ? { width: "100%", justifyContent: "center" } : { justifyContent: "center" }}
        onClick={() => setChiedi(true)}
      >
        {verbo}
      </button>
    );
  }

  return (
    <div className="conferma-distruttiva">
      <div className="conferma-titolo">{titolo}</div>
      <div className="conferma-conseguenza">{conseguenza}</div>
      <form action={action} className="conferma-azioni">
        {Object.entries(campiNascosti).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button type="button" className="btn" onClick={() => setChiedi(false)}>
          Annulla
        </button>
        <button type="submit" className="btn danger solid">
          {verbo}
        </button>
      </form>
    </div>
  );
}
