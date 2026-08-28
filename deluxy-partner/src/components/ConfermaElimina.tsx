"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

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
  classeConferma = "btn small danger-solid",
  title,
  trigger,
  inCorso,
}: {
  // Verbo dell'azione, stampato sul bottone e in testa alla domanda.
  verbo?: string;
  // Nome dell'oggetto: «questa fattura», «lo storico richieste», «la tariffa di…».
  oggetto: string;
  // Cosa succede dopo: «si perde dal registro», «i movimenti futuri torneranno da riconoscere».
  conseguenza: string;
  className?: string;
  // Colore del bottone di conferma (il secondo click). Rosso pieno per le
  // cancellazioni; per un'azione COSTRUTTIVA (es. «crea») si passa un primario.
  classeConferma?: string;
  title?: string;
  // Contenuto del bottone chiuso: se assente si mostra il verbo. In un elenco
  // conviene un'icona (cestino) al posto della parola, ma la domanda di conferma
  // resta narrativa col nome dell'oggetto.
  trigger?: ReactNode;
  // Testo mentre l'azione gira (server action, spesso con una chiamata a
  // un'altra app: il registro Anagrafiche ci mette secondi). Nessun click muto.
  inCorso?: string;
}) {
  const [aperto, setAperto] = useState(false);

  if (!aperto) {
    return (
      <button
        type="button"
        className={className}
        title={title ?? `${verbo} ${oggetto}`}
        aria-label={`${verbo} ${oggetto}`}
        onClick={() => setAperto(true)}
      >
        {trigger ?? verbo}
      </button>
    );
  }

  return (
    <span className="conferma-elimina" role="group" aria-label={`Conferma: ${verbo.toLowerCase()} ${oggetto}`}>
      <span className="conferma-elimina-testo">
        {verbo} {oggetto}? {conseguenza}
      </span>
      <AzioniConferma verbo={verbo} classeConferma={classeConferma} inCorso={inCorso} annulla={() => setAperto(false)} />
    </span>
  );
}

// Il click di conferma è un submit di server action che spesso redirige o parla
// col registro: mentre gira, il bottone lo DICE e si blocca, e «Annulla»
// sparisce (non si annulla a metà). `useFormStatus` vede il form genitore.
function AzioniConferma({
  verbo,
  classeConferma,
  inCorso,
  annulla,
}: {
  verbo: string;
  classeConferma: string;
  inCorso?: string;
  annulla: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <span className="conferma-elimina-azioni">
      <button
        type="submit"
        className={classeConferma}
        disabled={pending}
        aria-busy={pending}
        style={pending ? { opacity: 0.75, cursor: "progress" } : undefined}
      >
        {pending ? inCorso ?? "Attendo…" : verbo}
      </button>
      {!pending && (
        <button type="button" className="btn small secondary" onClick={annulla}>
          Annulla
        </button>
      )}
    </span>
  );
}
