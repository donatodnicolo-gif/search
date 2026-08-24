"use client";

import { useTransition } from "react";
import { impostaResponsabile } from "@/lib/azioni";

// Il menu «riporta a» sulle schede dell'organigramma: scegliere salva subito
// (niente bottone: un organigramma si monta a colpi di tendina). Le opzioni
// arrivano già filtrate dal server — mai sé stessi né i propri sottoposti,
// e la guardia vera sui cicli sta comunque nella server action.

export function RiportoSelect({
  personaId,
  valore,
  opzioni,
}: {
  personaId: string;
  valore: string;
  opzioni: { id: string; nome: string }[];
}) {
  const [inCorso, avvia] = useTransition();

  return (
    <form action={(fd) => avvia(() => impostaResponsabile(fd))} className="riporto-form">
      <input type="hidden" name="personaId" value={personaId} />
      <label>riporta a</label>
      <select
        name="responsabileId"
        defaultValue={valore}
        disabled={inCorso}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">— nessuno —</option>
        {opzioni.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
    </form>
  );
}
