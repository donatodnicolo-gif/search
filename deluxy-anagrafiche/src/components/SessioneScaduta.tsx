"use client";

import { useEffect, useState } from "react";

// QUANDO LA SESSIONE MUORE MENTRE L'APP È APERTA.
// Libro UX&UI v1.4 §7 (sistema del Customer Service): il poller dei pallini
// gira su ogni pagina, quindi è LUI che se ne accorge — e questa fascia lo
// dice una volta per tutte le schermate, invece di lasciare che ogni elenco
// si svuoti in silenzio.
//
// ⚠️ Fissa in cima e senza «chiudi»: un avviso che si può scacciare, su
// un'app che da quel momento non funziona più, si scaccia. Il salto al login
// lo decide chi guarda (potrebbe avere un modulo a metà in un'altra scheda).

/** Il nome dell'evento: lo manda il poller dei pallini quando se ne accorge. */
export const EVENTO_SESSIONE_SCADUTA = "deluxy:sessione-scaduta";

/**
 * Fa comparire la fascia. È un evento e non un import diretto del componente:
 * chi se ne accorge (il poller) non deve sapere dove sta la fascia.
 */
export function avvisaSessioneScaduta(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_SESSIONE_SCADUTA));
}

export function SessioneScaduta() {
  const [scaduta, setScaduta] = useState(false);

  useEffect(() => {
    const su = () => setScaduta(true);
    window.addEventListener(EVENTO_SESSIONE_SCADUTA, su);
    return () => window.removeEventListener(EVENTO_SESSIONE_SCADUTA, su);
  }, []);

  if (!scaduta) return null;

  return (
    <div className="sessione-scaduta" role="alert">
      <span>
        <strong>Sessione scaduta.</strong> Da adesso gli elenchi restano vuoti finché non
        rientri — non è che i dati non ci sono.
      </span>
      {/* ⚠️ `window.location` e non un link client: si vuole un caricamento
          VERO, che passi dal middleware e getti via lo stato di una pagina che
          ormai parla con un'app che non la riconosce più. */}
      <button type="button" onClick={() => (window.location.href = "/login")}>
        Rientra
      </button>
    </div>
  );
}
