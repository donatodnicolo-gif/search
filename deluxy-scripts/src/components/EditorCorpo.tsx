"use client";

import { useState } from "react";
import { VARIABILI_COMUNI } from "@/lib/variabili";

// Il campo dove si scrive il testo. Mentre si digita segnala i segnaposto
// {{COSÌ}} trovati, distinguendo quelli già dichiarati come variabile da quelli
// nuovi (che vengono creati da soli al salvataggio). Sotto, le variabili che
// ricorrono in tutti i testi: un clic e finiscono nel punto in cui stai
// scrivendo, così l'azienda le chiama sempre allo stesso modo.
const SEGNAPOSTO = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function EditorCorpo({
  valoreIniziale,
  dichiarate,
}: {
  valoreIniziale: string;
  dichiarate: string[];
}) {
  const [corpo, setCorpo] = useState(valoreIniziale);
  const [campo, setCampo] = useState<HTMLTextAreaElement | null>(null);
  const gia = new Set(dichiarate);
  const trovate = [...new Set([...corpo.matchAll(SEGNAPOSTO)].map((m) => m[1].toUpperCase()))];
  const nuove = trovate.filter((c) => !gia.has(c));

  // Inserisce {{CHIAVE}} dove sta il cursore (o in fondo, se il campo non è a fuoco).
  function inserisci(chiave: string) {
    const testo = `{{${chiave}}}`;
    if (!campo) {
      setCorpo(corpo + testo);
      return;
    }
    const da = campo.selectionStart ?? corpo.length;
    const a = campo.selectionEnd ?? corpo.length;
    const nuovo = corpo.slice(0, da) + testo + corpo.slice(a);
    setCorpo(nuovo);
    requestAnimationFrame(() => {
      campo.focus();
      campo.setSelectionRange(da + testo.length, da + testo.length);
    });
  }

  return (
    <>
      <textarea
        name="corpo"
        className="editor-testo"
        ref={setCampo}
        value={corpo}
        onChange={(e) => setCorpo(e.target.value)}
        placeholder={
          "Gentile {{NOME_CLIENTE}},\n\ngrazie per averci scritto…\n\nUn caro saluto,\n{{FIRMA}}"
        }
      />
      <div className="chip-riga" style={{ marginTop: 10 }}>
        <span className="campo-aiuto">Aggiungi una variabile:</span>
        {VARIABILI_COMUNI.map((c) => (
          <button type="button" key={c} className="chip chip-bottone" onClick={() => inserisci(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="chip-riga" style={{ marginTop: 8 }}>
        {trovate.length === 0 ? (
          <span className="campo-aiuto">
            Nel testo non c&apos;è ancora nessuna variabile. Si scrivono così:{" "}
            <code className="inline">{"{{NOME_CLIENTE}}"}</code>
          </span>
        ) : (
          <>
            <span className="campo-aiuto">Nel testo:</span>
            {trovate.map((c) => (
              <span
                key={c}
                className={gia.has(c) ? "chip muto" : "chip"}
                title={gia.has(c) ? "già dichiarata" : "nuova: verrà creata al salvataggio"}
              >
                {c}
              </span>
            ))}
          </>
        )}
      </div>
      {nuove.length > 0 && (
        <p className="campo-aiuto" style={{ marginTop: 6 }}>
          {nuove.length === 1 ? "Una variabile nuova verrà creata" : `${nuove.length} variabili nuove verranno create`} al
          salvataggio: qui sotto puoi dargli un valore fisso o lasciarle da compilare di volta in volta.
        </p>
      )}
    </>
  );
}
