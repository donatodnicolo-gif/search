import { avviaSyncDrive } from "@/lib/azioni";

// Bottone "Sincronizza": rilegge la cartella Drive e aggiorna l'indice dei
// documenti. Da mettere accanto alle azioni principali delle pagine.
export function BottoneSync({ etichetta = "Sincronizza" }: { etichetta?: string }) {
  return (
    <form action={avviaSyncDrive}>
      <button
        className="btn btn-secondario"
        type="submit"
        title="Rilegge la cartella Drive ADV DELUXY SRL e aggiorna l'indice dei documenti"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5" />
          <path d="M4 4v4.5h4.5" />
          <path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5" />
          <path d="M20 20v-4.5h-4.5" />
        </svg>
        {etichetta}
      </button>
    </form>
  );
}
