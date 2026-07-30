"use client";

import { useState, useTransition } from "react";

// Una riga dell'elenco dei link creati: mostra il link (chiedendolo a Shopify
// sul momento), aggiorna lo stato, annulla.
//
// Il link non arriva dal nostro database: contiene un segreto e una bozza pagata
// o cancellata non deve continuare a mostrare un indirizzo morto. Si chiede, si
// copia, si manda.

type Stato =
  | { ok: true; stato: string; url: string | null; ordineNumero: string | null; totale: number }
  | { ok: false; motivo: string };

export function RigaLinkIncasso({
  linkId,
  pagato,
  aggiorna,
  annulla,
}: {
  linkId: string;
  pagato: boolean;
  aggiorna: (id: string) => Promise<Stato>;
  annulla: (id: string) => Promise<{ ok: boolean; motivo?: string }>;
}) {
  const [stato, setStato] = useState<Stato | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [attesa, avvia] = useTransition();

  function chiedi() {
    setMessaggio(null);
    setCopiato(false);
    avvia(async () => setStato(await aggiorna(linkId)));
  }

  function annullalo() {
    avvia(async () => {
      const esito = await annulla(linkId);
      setMessaggio(esito.ok ? "Annullato." : (esito.motivo ?? "Non riuscito."));
      if (esito.ok) setStato(null);
    });
  }

  async function copia(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
    } catch {
      setCopiato(false);
    }
  }

  return (
    <div className="link-pagamento compatto">
      <button className="btn btn-secondario small" type="button" onClick={chiedi} disabled={attesa}>
        {attesa ? "…" : "Mostra il link"}
      </button>
      {!pagato && (
        <button className="btn btn-secondario small" type="button" onClick={annullalo} disabled={attesa}>
          Annulla
        </button>
      )}
      {messaggio && <span className="testo-guida">{messaggio}</span>}
      {stato?.ok === false && <span className="testo-guida">{stato.motivo}</span>}
      {stato?.ok && stato.url && (
        <>
          <input className="link-campo" readOnly value={stato.url} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn small" type="button" onClick={() => copia(stato.url!)}>
            {copiato ? "Copiato ✓" : "Copia"}
          </button>
        </>
      )}
      {stato?.ok && !stato.url && <span className="testo-guida">Shopify non dà più un link per questa bozza.</span>}
    </div>
  );
}
