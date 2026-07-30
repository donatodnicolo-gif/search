"use client";

import { useState, useTransition } from "react";

// «Fallo pagare»: chiede a Shopify il link di pagamento dell'ordine e lo mette
// pronto da copiare.
//
// Il link NON si mostra prima di averlo chiesto e non si tiene da nessuna parte:
// dentro c'è un segreto che vale un pagamento. Si chiede, si copia, si manda —
// e se l'ordine nel frattempo è stato pagato, Shopify lo dice invece di dare un
// link che porterebbe il cliente a una pagina morta.
//
// L'app **non manda niente al cliente**: prepara il link, come le automazioni
// preparano i messaggi. A mandarlo è una persona, dal Customer Service o da dove
// preferisce.

type Esito =
  | { ok: true; url: string; daPagare: number | null; stato: string | null }
  | { ok: false; motivo: string };

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

export function LinkPagamento({
  ordineId,
  chiedi,
  compatto = false,
}: {
  ordineId: string;
  chiedi: (ordineId: string) => Promise<Esito>;
  compatto?: boolean;
}) {
  const [esito, setEsito] = useState<Esito | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [attesa, avvia] = useTransition();

  function chiedilo() {
    setCopiato(false);
    avvia(async () => setEsito(await chiedi(ordineId)));
  }

  async function copia(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
    } catch {
      // Niente permesso per gli appunti: il link resta selezionabile a mano.
      setCopiato(false);
    }
  }

  return (
    <div className={compatto ? "link-pagamento compatto" : "link-pagamento"}>
      <button className="btn btn-secondario small" type="button" onClick={chiedilo} disabled={attesa}>
        {attesa ? "Chiedo a Shopify…" : esito?.ok ? "Rifai il link" : "Link di pagamento"}
      </button>

      {esito?.ok === false && <span className="testo-guida">{esito.motivo}</span>}

      {esito?.ok && (
        <>
          {esito.daPagare != null && esito.daPagare > 0 && (
            <span className="testo-guida">da incassare {euro(esito.daPagare)}</span>
          )}
          <input className="link-campo" readOnly value={esito.url} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn small" type="button" onClick={() => copia(esito.url)}>
            {copiato ? "Copiato ✓" : "Copia"}
          </button>
          <a className="btn btn-secondario small" href={esito.url} target="_blank" rel="noopener noreferrer">
            Apri
          </a>
        </>
      )}
    </div>
  );
}
