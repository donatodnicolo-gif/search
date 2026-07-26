"use client";

import { useFormStatus } from "react-dom";

// Bottone «Aggiorna ordini» con feedback immediato, come quello di Qonto.
// Lo scarico dal registro Deluxy Orders è paginato e su 90 giorni ci mette
// parecchi secondi: senza questo il bottone resta identico a prima del clic e
// non si capisce se è partito — si finisce per premerlo di nuovo. L'esito
// (quanti ordini, o l'errore) arriva dal banner della pagina al termine.
export function BottoneAggiornaOrdini({ attivo }: { attivo: boolean }) {
  const { pending } = useFormStatus();
  if (!attivo) {
    return (
      <button
        className="btn primary"
        type="button"
        disabled
        title="Manca ORDERS_API_KEY: senza la chiave del registro Deluxy Orders non c'è niente da scaricare"
      >
        ⇅ Aggiorna ordini
      </button>
    );
  }
  return (
    <button
      className="btn primary"
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title="Scarica gli ordini degli ultimi 90 giorni dal registro Deluxy Orders"
    >
      {pending ? "⇅ Aggiornamento in corso…" : "⇅ Aggiorna ordini"}
    </button>
  );
}
