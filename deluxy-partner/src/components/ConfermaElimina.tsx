"use client";

import { useState } from "react";

// Conferma narrativa in linea per le azioni distruttive (Libro UX cap. 7).
// Finance muove denaro: nessuna cancellazione deve partire al primo click.
// Il bottone vive DENTRO un <form action={serverAction}>: al primo click non
// invia, ma apre in linea la conferma col NOME dell'oggetto + la CONSEGUENZA,
// e solo il bottone rosso col verbo (type=submit) fa partire la server action.
// Sintomo storico: 12 «Elimina/Svuota/Rimuovi» a click nudo su fatture,
// vendite, pro-forma, transazioni, tariffe, ordini (27/08/2026).
export function ConfermaElimina({
  verbo = "Elimina",
  oggetto,
  conseguenza,
  className = "btn small danger",
  title,
}: {
  // Verbo dell'azione, stampato sul bottone e in testa alla domanda.
  verbo?: string;
  // Nome dell'oggetto: «questa fattura», «lo storico richieste», «la tariffa di…».
  oggetto: string;
  // Cosa succede dopo: «si perde dal registro», «i movimenti futuri torneranno da riconoscere».
  conseguenza: string;
  className?: string;
  title?: string;
}) {
  const [aperto, setAperto] = useState(false);

  if (!aperto) {
    return (
      <button type="button" className={className} title={title} onClick={() => setAperto(true)}>
        {verbo}
      </button>
    );
  }

  return (
    <span className="conferma-elimina" role="group" aria-label={`Conferma: ${verbo.toLowerCase()} ${oggetto}`}>
      <span className="conferma-elimina-testo">
        {verbo} {oggetto}? {conseguenza}
      </span>
      <span className="conferma-elimina-azioni">
        <button type="submit" className="btn small danger-solid">
          {verbo}
        </button>
        <button type="button" className="btn small secondary" onClick={() => setAperto(false)}>
          Annulla
        </button>
      </span>
    </span>
  );
}
