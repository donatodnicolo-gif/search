"use client";

// **Le sezioni di una categoria, nell'ordine in cui il cliente vedrà le tab.**
//
// L'ordine non è un dettaglio estetico: `componiDescrizioneHtml` scrive un
// `<h6>` per sezione, e il tema del negozio costruisce una tab per ogni `<h6>`
// **nell'ordine in cui li trova**. Questa lista è quindi la sequenza vera delle
// tab sulla scheda.
//
// Si sposta con le frecce e si salva in un colpo solo: mandare una scrittura a
// ogni freccia vorrebbe dire lasciare l'elenco a metà se qualcosa va storto.

import { useState } from "react";

export type SezioneRiga = { id: string; nome: string; tipo: string; attiva: boolean };

export function OrdineSezioni({
  righe,
  azione,
}: {
  righe: SezioneRiga[];
  azione: (fd: FormData) => void;
}) {
  const [lista, setLista] = useState(righe);
  const [sporco, setSporco] = useState(false);

  function sposta(i: number, verso: -1 | 1) {
    const j = i + verso;
    if (j < 0 || j >= lista.length) return;
    const nuova = lista.slice();
    [nuova[i], nuova[j]] = [nuova[j], nuova[i]];
    setLista(nuova);
    setSporco(true);
  }

  return (
    <form action={azione} className="ordine-sezioni">
      <input type="hidden" name="ordineJson" value={JSON.stringify(lista.map((x) => x.id))} />
      <ol className="ordine-lista">
        {lista.map((s, i) => (
          <li key={s.id} className={s.attiva ? "ordine-riga" : "ordine-riga spenta"}>
            <span className="ordine-numero">{i + 1}</span>
            <span className="ordine-nome">
              {s.nome}
              <span className="ordine-tipo">{s.tipo}</span>
              {!s.attiva && <span className="ordine-spenta">spenta</span>}
            </span>
            <span className="ordine-frecce">
              <button type="button" onClick={() => sposta(i, -1)} disabled={i === 0} aria-label={`Sposta «${s.nome}» in su`}>
                ↑
              </button>
              <button type="button" onClick={() => sposta(i, 1)} disabled={i === lista.length - 1} aria-label={`Sposta «${s.nome}» in giù`}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      {sporco && (
        <div className="ordine-salva">
          <button type="submit" className="btn">
            Salva questo ordine
          </button>
          <span className="cella-sub">Le schede già online cambiano al loro prossimo salvataggio, non subito.</span>
        </div>
      )}
    </form>
  );
}
