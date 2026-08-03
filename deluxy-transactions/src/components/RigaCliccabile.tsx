"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// Una riga di tabella che si apre da qualunque punto, non solo dal riferimento
// in blu. In un elenco di pagamenti si punta l'importo o il beneficiario, non
// il codice a sinistra: il bersaglio giusto è tutta la riga.
//
// Tre cose che deve NON fare, e sono il motivo per cui non è un semplice
// `onClick={vai}`:
//
//  • non rubare i clic ai comandi che stanno dentro la riga (tasti, link,
//    campi, e la finestrella di chiusura, che vive dentro una cella e i cui
//    clic risalirebbero fin qui: si aprirebbe il dettaglio con la finestra
//    aperta sopra);
//  • non navigare quando si stava solo **selezionando del testo** — copiare un
//    IBAN dalla riga è una cosa che si fa, e finire su un'altra pagina a metà
//    selezione è la reazione sbagliata;
//  • non impedire di aprire in una scheda nuova: con Ctrl/Cmd o col tasto
//    centrale la riga si comporta come un link.
//
// Il link vero sul riferimento resta dov'era: è quello che serve alla tastiera
// e ai lettori di schermo, questo è solo un bersaglio più grande per il mouse.
const COMANDI = "a, button, input, select, textarea, label, dialog, [data-non-apre]";

export function RigaCliccabile({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function dentroUnComando(bersaglio: EventTarget | null): boolean {
    return bersaglio instanceof Element && Boolean(bersaglio.closest(COMANDI));
  }

  return (
    <tr
      className="riga-cliccabile"
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
    </tr>
  );
}
