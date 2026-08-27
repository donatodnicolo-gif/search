"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function BottoneElimina({ nome }: { nome: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn danger-solid"
      disabled={pending}
      style={{ flex: 1, justifyContent: "center" }}
    >
      {pending ? "Elimino…" : `Elimina ${nome}`}
    </button>
  );
}

/**
 * Conferma narrativa dell'eliminazione utente (Libro UX cap.7, D2):
 * prima un solo bottone; al click compare la conferma col NOME dell'utente
 * e le CONSEGUENZE, con «Annulla» e il rosso pieno col verbo.
 * Componente client "leaf": riceve la server action come prop.
 */
export function ConfermaElimina({
  id,
  nome,
  action,
}: {
  id: string;
  nome: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const [aperta, setAperta] = useState(false);

  if (!aperta) {
    return (
      <button
        type="button"
        className="btn danger"
        style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
        onClick={() => setAperta(true)}
      >
        Elimina utente
      </button>
    );
  }

  return (
    <div className="conferma-elimina">
      <p>
        Elimino <strong>{nome}</strong>? Perde subito l&apos;accesso al portale e le
        app abilitate. Non si può annullare.
      </p>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => setAperta(false)}
          >
            Annulla
          </button>
          <BottoneElimina nome={nome} />
        </div>
      </form>
    </div>
  );
}
