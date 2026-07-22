"use client";

import { useFormStatus } from "react-dom";

// Bottone di sync Qonto con feedback immediato: mentre la server action gira,
// diventa "Sincronizzazione in corso…" e si disabilita, così l'utente vede che è
// partita anche se lo scarico impiega qualche secondo. L'esito (nuovi movimenti o
// errore) arriva dal banner della pagina al termine.
export function BottoneSincronizzaQonto() {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn primary"
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title="Scarica subito i movimenti recenti dal conto Qonto"
    >
      {pending ? "⇅ Sincronizzazione in corso…" : "⇅ Sincronizza da Qonto"}
    </button>
  );
}
