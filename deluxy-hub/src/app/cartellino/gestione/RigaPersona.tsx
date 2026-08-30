"use client";

import { useId, useState } from "react";

// Una riga della tabella «Le timbrature di tutti», con il suo dettaglio.
// Libro UX&UI §8 (v1.6): quando un record HA un dettaglio, il click in un punto
// QUALSIASI della riga lo apre — non solo un comando piccolo in fondo (prima era
// il solo «Timbrature», e la riga sembrava morta). Le guardie della regola:
// - le azioni dentro la riga non fanno partire l'apertura (`closest` su a/button
//   /input/select/label): il bottone ha il suo click e non lo si esegue due volte;
// - la riga cliccabile si DICHIARA (cursor pointer + hover), e chi non ha niente
//   da mostrare non finge: niente pointer, niente hover, nessun bottone;
// - resta un comando vero da tastiera: il bottone in fondo, con `aria-expanded`
//   e `aria-controls`, che è la forma accessibile di un dettaglio a scomparsa.
//   La <tr> non è un secondo punto di tabulazione: sarebbe un doppione muto.
export function RigaPersona({
  nome,
  email,
  ore,
  notaOre,
  giorniTimbrati,
  giorniAssenza,
  haDettaglio,
  children,
}: {
  nome: string;
  email: string;
  ore: string;
  notaOre?: string | null;
  giorniTimbrati: number;
  giorniAssenza: number;
  haDettaglio: boolean;
  children: React.ReactNode;
}) {
  const [aperta, setAperta] = useState(false);
  const idDettaglio = useId();

  function suClickRiga(e: React.MouseEvent<HTMLTableRowElement>) {
    if (!haDettaglio) return;
    const bersaglio = e.target as HTMLElement;
    if (bersaglio.closest("a,button,input,select,label")) return;
    setAperta((v) => !v);
  }

  return (
    <>
      <tr
        className={`riga-persona${haDettaglio ? " apribile" : ""}${aperta ? " aperta" : ""}`}
        onClick={suClickRiga}
      >
        <td>
          <div style={{ fontWeight: 500 }}>{nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{email}</div>
        </td>
        <td style={{ fontVariantNumeric: "tabular-nums" }}>
          {ore}
          {notaOre && <span className="nota-riga">{notaOre}</span>}
        </td>
        <td>{giorniTimbrati || "—"}</td>
        <td>{giorniAssenza || "—"}</td>
        <td style={{ textAlign: "right" }}>
          {haDettaglio ? (
            <button
              type="button"
              className="btn ghost"
              aria-expanded={aperta}
              aria-controls={idDettaglio}
              onClick={() => setAperta((v) => !v)}
            >
              <span className={`chevron${aperta ? " giu" : ""}`} aria-hidden="true" />
              {aperta ? "Chiudi" : "Timbrature"}
            </button>
          ) : (
            // Chi non ha né timbrature né assenze non ha un dettaglio da aprire:
            // la cella lo dice invece di offrire un comando che apre il vuoto.
            <span className="nota-riga">nessun dato</span>
          )}
        </td>
      </tr>
      {aperta && (
        <tr className="riga-dettaglio">
          {/* Il dettaglio sta sotto, a tutta larghezza: nell'ultima colonna era
              un riquadro stretto accanto ai numeri. */}
          <td colSpan={5} id={idDettaglio}>
            {children}
          </td>
        </tr>
      )}
    </>
  );
}
