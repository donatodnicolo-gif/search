"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la riga porta al
// dettaglio; i click su link, bottoni, campi, sugli expander (details/summary,
// che nelle tabelle di questa app aprono le anteprime) e sulle finestre modali
// che vivono dentro una cella (RiconciliaModale) non navigano. Il link vero sul
// nome resta dov'era: serve alla tastiera e ai lettori di schermo, questo è
// solo un bersaglio più grande per il mouse. Selezionare del testo nella riga
// non naviga.
const COMANDI = "a, button, input, select, textarea, label, details, summary, dialog, [role='dialog']";

const ESTERNO = /^https?:\/\//;

export function RigaLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={className}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(COMANDI)) return;
        if (window.getSelection()?.toString()) return;
        // Un dettaglio che vive fuori dall'app (es. la fattura su Fatture in
        // Cloud) si apre in una scheda nuova, così non si perde l'elenco.
        if (ESTERNO.test(href)) window.open(href, "_blank", "noopener,noreferrer");
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
