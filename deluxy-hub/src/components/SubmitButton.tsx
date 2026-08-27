"use client";

import { useFormStatus } from "react-dom";

/**
 * Bottone di submit che si disabilita durante l'invio (Libro UX cap.6:
 * «il doppio invio è un bug», D3). Va usato DENTRO un <form action={…}>:
 * useFormStatus legge lo stato del form genitore.
 */
export function SubmitButton({
  children,
  pendingText = "Attendere…",
  className = "btn primary",
  style,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} style={style} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
