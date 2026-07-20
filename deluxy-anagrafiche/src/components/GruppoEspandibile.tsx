"use client";

import { useState, type ReactNode } from "react";

// Riga di un'insegna madre nell'elenco: il triangolino apre e chiude le sue
// sedi, che restano righe complete (stato, interessi, azioni sono le loro).
// Le celle arrivano già renderizzate dal server: qui si gestisce solo l'apertura.
export function GruppoEspandibile({
  celle,
  sedi,
}: {
  celle: ReactNode;
  sedi: { id: string; celle: ReactNode }[];
}) {
  const [aperto, setAperto] = useState(false);

  return (
    <>
      <tr>
        <td className="cella-espandi">
          <button
            type="button"
            className={`btn-espandi${aperto ? " aperto" : ""}`}
            onClick={() => setAperto((v) => !v)}
            aria-expanded={aperto}
            title={aperto ? "Chiudi le sedi" : `Mostra le ${sedi.length} sedi`}
          >
            <span className="freccia-espandi">▸</span>
            <span className="conta-sedi">{sedi.length}</span>
          </button>
        </td>
        {celle}
      </tr>
      {aperto &&
        sedi.map((s) => (
          <tr key={s.id} className="riga-sede">
            <td className="cella-espandi" />
            {s.celle}
          </tr>
        ))}
    </>
  );
}
