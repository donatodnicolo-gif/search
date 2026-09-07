"use client";

import { useEffect, useRef, useState } from "react";
import type { RigaCodaRecente } from "@/lib/coda-recente";

// Il pannello che si apre DOPO «metti in coda», sulla pagina da cui si è
// accodato (richiesta dell'utente, 07/09/2026: «non portare alla pagina
// operazioni, apri una finestra laterale»).
//
// ⚠️ Prima l'esito arrivava con un salto a /operazioni — e lì la pagina
// atterrava con lo sguardo sullo storico delle cose già fatte, non sulla riga
// appena aggiunta — oppure come una riga di testo in cima alla scheda, che si
// leggeva se si aveva la fortuna di guardare in alto. Qui si vede DOVE si è
// agito: cosa è entrato in coda, gli avvisi del guardrail, e le ultime
// richieste accanto, così un doppione si riconosce a occhio prima di
// approvarlo. Chi vuole approvare ha il bottone; chi vuole continuare resta.
//
// Canone del Libro cap. 9: ✕ sempre visibile, tre vie di chiusura (✕, scrim,
// Esc), role="dialog" + aria-modal, fuoco dentro, foglio dal basso sul
// telefono. Chiudendo, l'esito sparisce dall'indirizzo: un F5 non deve
// riaprire un pannello su un fatto vecchio.
export function PannelloCoda({
  esito,
  avvisi,
  saltate,
  righe,
  linkOperazioni,
  ambito,
}: {
  esito: string;
  avvisi?: string;
  saltate?: string;
  righe: RigaCodaRecente[];
  linkOperazioni: string;
  // «di questa campagna», «di questo gruppo», o vuoto per tutta l'app
  ambito: string;
}) {
  const [aperto, setAperto] = useState(true);
  const pannello = useRef<HTMLElement>(null);
  const chiudiRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    chiudiRef.current?.focus();
  }, []);

  function chiudi() {
    setAperto(false);
    try {
      const u = new URL(window.location.href);
      for (const k of ["esito", "avvisi", "saltate"]) u.searchParams.delete(k);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {
      // Un indirizzo che non si lascia riscrivere non è un motivo per non chiudere.
    }
  }

  useEffect(() => {
    if (!aperto) return;
    const tasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        chiudi();
        return;
      }
      // Il fuoco resta nel pannello: Tab dall'ultimo elemento torna al primo.
      if (e.key === "Tab" && pannello.current) {
        const attivabili = pannello.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (attivabili.length === 0) return;
        const primo = attivabili[0];
        const ultimo = attivabili[attivabili.length - 1];
        if (e.shiftKey && document.activeElement === primo) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primo.focus();
        }
      }
    };
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, [aperto]);

  if (!aperto) return null;

  return (
    <div className="pannello-scrim" onClick={chiudi}>
      <aside
        ref={pannello}
        className="pannello-coda"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pannello-coda-titolo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pannello-testa">
          <div>
            <div className="modale-occhiello">Operazioni</div>
            <h2 id="pannello-coda-titolo" className="modale-titolo">
              Aggiunta alla coda
            </h2>
          </div>
          <button ref={chiudiRef} type="button" className="modale-chiudi" onClick={chiudi} aria-label="Chiudi" title="Chiudi">
            ✕
          </button>
        </div>

        <div className="pannello-corpo">
          <div className="avviso-ok" role="status">
            <strong>{esito}</strong>
            {saltate && (
              <>
                {" · "}
                <b>saltate</b>: {saltate}
              </>
            )}
          </div>
          {avvisi && (
            <div className="avviso-attenzione">
              <strong>Da sapere prima di approvare:</strong> {avvisi}
            </div>
          )}
          <p className="cella-sub" style={{ whiteSpace: "normal", margin: "10px 0 16px" }}>
            Non parte niente finché non la approvi in Operazioni. Puoi continuare qui e approvare
            tutto insieme più tardi.
          </p>

          <div className="scheda-titolo">Ultime operazioni richieste{ambito ? ` ${ambito}` : ""}</div>
          {righe.length === 0 ? (
            <div className="vuoto-mini">Nessuna operazione richiesta finora.</div>
          ) : (
            <ul className="storia pannello-lista">
              {righe.map((r) => (
                <li key={r.id} className={r.appena ? "appena" : undefined}>
                  <span className="storia-data">{r.quando}</span>
                  <span className="storia-testo">
                    <span className="tag-salute" style={{ color: r.colore, marginRight: 8 }}>
                      <span className="dot" />
                      {r.statoTesto}
                    </span>
                    {r.etichetta}
                    {r.dettaglio && <span className="cella-sub"> {r.dettaglio}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pannello-piede">
          <button type="button" className="btn btn-secondario" onClick={chiudi}>
            Resta qui
          </button>
          <a className="btn" href={linkOperazioni}>
            Vai a Operazioni
          </a>
        </div>
      </aside>
    </div>
  );
}
