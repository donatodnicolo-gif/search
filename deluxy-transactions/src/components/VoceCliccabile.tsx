"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// La sorella di RigaCliccabile per gli elenchi che non sono tabelle: una voce
// di lista (<li>) che porta al dettaglio da qualunque punto, non solo dal
// riferimento in blu («la riga si apre col click», Libro UX&UI v1.6 §8).
// Stesse tre attenzioni: non ruba i clic ai comandi dentro la voce, non
// naviga mentre si sta selezionando del testo, e con Ctrl/Cmd o col tasto
// centrale apre in una scheda nuova. Il link vero resta dov'era: serve alla
// tastiera e ai lettori di schermo.
const COMANDI = "a, button, input, select, textarea, label, dialog, [data-non-apre]";

export function VoceCliccabile({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function dentroUnComando(bersaglio: EventTarget | null): boolean {
    return bersaglio instanceof Element && Boolean(bersaglio.closest(COMANDI));
  }

  return (
    <li
      className="voce-cliccabile"
      onClick={(e) => {
        if (dentroUnComando(e.target)) return;
        if (window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) {
          window.open(href, "_blank", "noopener");
          return;
        }
        router.push(href);
      }}
      onAuxClick={(e) => {
        // Tasto centrale: scheda nuova, come su un link qualsiasi.
        if (e.button !== 1 || dentroUnComando(e.target)) return;
        e.preventDefault();
        window.open(href, "_blank", "noopener");
      }}
    >
      {children}
    </li>
  );
}
