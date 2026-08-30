"use client";

import { useFormStatus } from "react-dom";

// Il bottone che manda un form a una server action, con i tre stati visibili
// che il Libro §7 (dodicesima legge, «nessun click muto») pretende: in corso,
// riuscito, fallito. Prima della correzione «Crea la persona» restava identico
// fino a 4 secondi — dietro c'è la proposta a Budgets con timeout 4000 ms — e
// l'utente ri-cliccava.
//
// `conferma` è facoltativa e serve all'irreversibile (una mail non si ritira):
// il testo può contenere segnaposto `{nomeCampo}`, sostituiti col valore VERO
// che sta nel form in quel momento — così la domanda nomina il destinatario e
// il mese, invece di chiedere un generico «sei sicuro?».
export function BottoneInvio({
  etichetta,
  inCorso,
  classe = "btn",
  conferma,
  disabilitato = false,
}: {
  etichetta: string;
  inCorso: string;
  classe?: string;
  conferma?: string;
  disabilitato?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={classe}
      disabled={pending || disabilitato}
      aria-busy={pending || undefined}
      onClick={(e) => {
        if (!conferma) return;
        const form = e.currentTarget.form;
        if (!form) return;
        const dati = new FormData(form);
        const testo = conferma.replace(/\{(\w+)\}/g, (intero, campo) => {
          const valore = dati.get(campo);
          return typeof valore === "string" && valore ? valore : intero;
        });
        if (!window.confirm(testo)) e.preventDefault();
      }}
    >
      {pending ? inCorso : etichetta}
    </button>
  );
}
