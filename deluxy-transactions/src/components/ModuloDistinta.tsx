"use client";

import { useActionState, useState } from "react";
import { creaDistinta } from "@/app/actions";

type Riga = {
  id: string;
  riferimento: string;
  beneficiario: string;
  iban: string;
  importo: string;
  importoCent: number;
  causale: string;
};

// Selezione delle richieste da mettere in distinta. Il totale si aggiorna
// mentre si spunta: chi genera il file deve vedere la cifra che sta per
// caricare in banca, non scoprirla dopo.
export function ModuloDistinta({ richieste, disabilitato }: { richieste: Riga[]; disabilitato: boolean }) {
  const [stato, azione, inCorso] = useActionState(creaDistinta, {} as { errore?: string });
  const [scelte, setScelte] = useState<Set<string>>(new Set());

  const totale = richieste.filter((r) => scelte.has(r.id)).reduce((s, r) => s + r.importoCent, 0);
  const tutte = scelte.size === richieste.length && richieste.length > 0;

  function commuta(id: string) {
    setScelte((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(id)) dopo.delete(id);
      else dopo.add(id);
      return dopo;
    });
  }

  return (
    <form action={azione}>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th className="spunta">
                <input
                  type="checkbox"
                  checked={tutte}
                  aria-label="Seleziona tutte"
                  onChange={() => setScelte(tutte ? new Set() : new Set(richieste.map((r) => r.id)))}
                />
              </th>
              <th>Riferimento</th>
              <th>Beneficiario</th>
              <th className="num">Importo</th>
            </tr>
          </thead>
          <tbody>
            {richieste.map((r) => (
              <tr key={r.id}>
                <td className="spunta">
                  <input
                    type="checkbox"
                    name="richieste"
                    value={r.id}
                    checked={scelte.has(r.id)}
                    onChange={() => commuta(r.id)}
                    aria-label={`Includi ${r.riferimento}`}
                  />
                </td>
                <td>
                  <a href={`/richieste/${r.id}`} className="cella-nome">
                    {r.riferimento}
                  </a>
                  <div className="cella-sub">{r.causale}</div>
                </td>
                <td>
                  <div>{r.beneficiario}</div>
                  <div className="cella-sub iban">{r.iban}</div>
                </td>
                <td className="cella-num importo">{r.importo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="paginazione">
        <span>
          {scelte.size} selezionate ·{" "}
          <strong className="importo">
            {(totale / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
          </strong>
        </span>
        <button className="btn" type="submit" disabled={inCorso || disabilitato || scelte.size === 0}>
          {inCorso ? "Creo…" : "Crea la distinta"}
        </button>
      </div>
    </form>
  );
}
