"use client";

import { useState } from "react";

// Il campo dove si scrive lo script. Mentre si digita segnala i segnaposto
// {{COSÌ}} trovati nel testo, distinguendo quelli già dichiarati come variabile
// da quelli nuovi (che vengono creati da soli al salvataggio).
const SEGNAPOSTO = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function EditorCorpo({
  valoreIniziale,
  dichiarate,
}: {
  valoreIniziale: string;
  dichiarate: string[];
}) {
  const [corpo, setCorpo] = useState(valoreIniziale);
  const gia = new Set(dichiarate);
  const trovate = [...new Set([...corpo.matchAll(SEGNAPOSTO)].map((m) => m[1].toUpperCase()))];
  const nuove = trovate.filter((c) => !gia.has(c));

  return (
    <>
      <textarea
        name="corpo"
        className="editor-codice"
        spellCheck={false}
        value={corpo}
        onChange={(e) => setCorpo(e.target.value)}
        placeholder={"// Scrivi qui lo script.\n// Dove serve un valore, mettici una variabile: {{URL_APP}}"}
      />
      <div className="chip-riga" style={{ marginTop: 10 }}>
        {trovate.length === 0 ? (
          <span className="campo-aiuto">
            Nessuna variabile nel testo. Si scrivono così: <code className="inline">{"{{NOME_VARIABILE}}"}</code>
          </span>
        ) : (
          <>
            <span className="campo-aiuto">Variabili nel testo:</span>
            {trovate.map((c) => (
              <span key={c} className={gia.has(c) ? "chip muto" : "chip"} title={gia.has(c) ? "già dichiarata" : "nuova: verrà creata al salvataggio"}>
                {c}
              </span>
            ))}
          </>
        )}
      </div>
      {nuove.length > 0 && (
        <p className="campo-aiuto" style={{ marginTop: 6 }}>
          {nuove.length === 1 ? "Una variabile nuova verrà creata" : `${nuove.length} variabili nuove verranno create`} al
          salvataggio, come testo obbligatorio: tipo e valore si impostano qui sotto.
        </p>
      )}
    </>
  );
}
