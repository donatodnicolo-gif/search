"use client";

import { useState } from "react";

/**
 * I due campi del **nostro** SEO, col conteggio che si aggiorna **mentre si
 * scrive** (chiesto dall'utente): il numero fermo all'ultimo salvataggio
 * costringeva a salvare per sapere se si era oltre il limite — cioè a scoprirlo
 * dopo, quando serviva prima.
 *
 * Solo i campi e i contatori sono client: il form, il Salva e le azioni restano
 * server. I `name` sono gli stessi di prima — la FormData non cambia.
 */
export function CampiSeo({
  titolo,
  descrizione,
  limiteTitolo,
  limiteDescrizione,
}: {
  titolo: string | null;
  descrizione: string | null;
  limiteTitolo: number;
  limiteDescrizione: number;
}) {
  const [t, setT] = useState(titolo ?? "");
  const [d, setD] = useState(descrizione ?? "");
  const oltre = t.length > limiteTitolo || d.length > limiteDescrizione;

  const conta = (n: number, limite: number) => (
    <span style={n > limite ? { color: "var(--orange)", fontWeight: 600 } : undefined}>
      {n}/{limite}
    </span>
  );

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        name="seoTitolo"
        value={t}
        onChange={(e) => setT(e.currentTarget.value)}
        placeholder={`Titolo (consigliati max ${limiteTitolo} caratteri)`}
        maxLength={200}
      />
      <textarea
        name="seoDescrizione"
        value={d}
        onChange={(e) => setD(e.currentTarget.value)}
        placeholder={`Descrizione (consigliati max ${limiteDescrizione} caratteri)`}
        rows={4}
        maxLength={600}
      />
      <p className="page-sub" style={{ margin: 0 }}>
        Titolo {conta(t.length, limiteTitolo)} · descrizione {conta(d.length, limiteDescrizione)}
        {oltre && <> — oltre il limite Google taglia: non è un errore, ma quella parte non si legge.</>}
      </p>
    </div>
  );
}
