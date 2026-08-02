"use client";

import { useFormStatus } from "react-dom";

// Il bottone che sa di stare lavorando.
//
// La sync del Drive dura una ventina di secondi: senza un segnale, chi la
// lancia vede una pagina immobile e conclude che il bottone è rotto — poi lo
// preme di nuovo, e parte una seconda corsa sopra la prima. Qui il bottone si
// disabilita, cambia parola e gira: costa niente e toglie il dubbio.
export function BottoneSyncAzione({ etichetta = "Sincronizza" }: { etichetta?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="btn btn-secondario"
      type="submit"
      disabled={pending}
      title={
        pending
          ? "Sto rileggendo la cartella Drive: ci vogliono una ventina di secondi"
          : "Rilegge la cartella Drive ADV DELUXY SRL e aggiorna l'indice dei documenti"
      }
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={pending ? "gira" : undefined}
      >
        <path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5" />
        <path d="M4 4v4.5h4.5" />
        <path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5" />
        <path d="M20 20v-4.5h-4.5" />
      </svg>
      {pending ? "Sincronizzo…" : etichetta}
    </button>
  );
}
