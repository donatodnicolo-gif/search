"use client";

import { useFormStatus } from "react-dom";

// Bottone di invio che dice che sta lavorando, e nel frattempo NON si lascia
// premere di nuovo.
//
// Serve dove l'azione parla con un'altra app e ci mette secondi: emettere una
// fattura su Fatture in Cloud sono più chiamate in fila (metodi di pagamento,
// dati del cliente, aliquote, creazione). Senza questo il bottone resta
// identico a prima del clic, sembra che non sia successo niente — e si preme
// una seconda volta. Su una fattura vuol dire due documenti e due numeri di
// protocollo: un danno che poi si sistema solo in contabilità.
export function BottoneInvio({
  children,
  inCorso,
  className = "btn primary",
  title,
}: {
  children: React.ReactNode;
  /** Testo mostrato mentre l'azione gira. Se manca, si aggiunge solo l'attesa. */
  inCorso?: string;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      aria-disabled={pending}
      title={title}
      style={pending ? { opacity: 0.75, cursor: "progress" } : undefined}
    >
      {pending ? inCorso ?? "Attendi…" : children}
    </button>
  );
}
