"use client";

import { useFormStatus } from "react-dom";

// Il bottone di un form LUNGO (AI, letture da Orders a pagine): appena si
// preme si disabilita e dice cosa sta succedendo. Prima non c'era niente: chi
// costruiva una lista vedeva il bottone restare uguale per 30-60 secondi e
// pensava «non fa nulla» (segnalazione dell'utente del 10/09/2026; Libro UX
// §5: ogni azione ha uno stato «in corso»).
export default function BottoneInvio({
  children,
  inCorso,
  className = "btn",
}: {
  children: React.ReactNode;
  inCorso: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? inCorso : children}
    </button>
  );
}
