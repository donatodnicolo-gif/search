"use client";

import { useState } from "react";

/**
 * Conferma narrativa in linea per le azioni distruttive (Libro UX cap.7).
 * Un click sul bottone rosso NON esegue: apre la coppia [Annulla] [verbo «nome»],
 * col NOME dell'oggetto e — dove serve — la CONSEGUENZA. Solo il passo di
 * conferma usa il rosso pieno (btn.danger-solid). L'azione vera è un server
 * action passato come prop: si esegue solo dal secondo bottone.
 */
export function ConfermaElimina({
  action,
  nome,
  etichetta = "Elimina",
  verbo = "Elimina",
  conseguenza,
  size = "small",
}: {
  action: (fd: FormData) => void | Promise<void>;
  nome: string;
  etichetta?: string;
  verbo?: string;
  conseguenza?: string;
  size?: "small" | "md";
}) {
  const [aperto, setAperto] = useState(false);
  const small = size === "small";

  if (!aperto) {
    return (
      <button
        type="button"
        className={small ? "btn small danger" : "btn danger"}
        onClick={() => setAperto(true)}
      >
        {etichetta}
      </button>
    );
  }

  return (
    <span className="conferma-elimina" role="group" aria-label={`Conferma: ${etichetta}`}>
      {conseguenza && <span className="conferma-elimina-nota">{conseguenza}</span>}
      <button
        type="button"
        className={small ? "btn small secondary" : "btn secondary"}
        onClick={() => setAperto(false)}
      >
        Annulla
      </button>
      <form action={action} style={{ display: "inline" }}>
        <button type="submit" className={small ? "btn small danger-solid" : "btn danger-solid"}>
          {verbo} «{nome}»
        </button>
      </form>
    </span>
  );
}
