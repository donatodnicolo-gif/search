"use client";

import { useFormStatus } from "react-dom";

// L'AI ci mette decine di secondi (più lotti, uno dopo l'altro): senza questo
// il bottone resterebbe identico al clic e verrebbe premuto una seconda volta,
// facendo ripartire tutto da capo.
export function BottoneAI() {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn primary"
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title="L'AI di Budgets propone una categoria per le controparti ancora senza. Non tocca quelle già assegnate e lascia stare quelle su cui non è sicura."
    >
      {pending ? "✦ L'AI sta classificando…" : "✦ Proponi con l'AI"}
    </button>
  );
}
