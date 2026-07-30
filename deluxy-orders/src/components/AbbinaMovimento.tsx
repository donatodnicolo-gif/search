"use client";

import { useState, useTransition } from "react";

// Popup per abbinare un movimento bancario a un ordine: l'INCASSO del cliente
// (accrediti) o il COSTO del fornitore (addebiti).
//
// La ricerca gira sul server (una server action) invece di scaricare qui
// undicimila movimenti: si cerca per causale, controparte o importo.
// Il campo parte già compilato con quello che serve — il numero dell'ordine per
// l'incasso — perché è il criterio che funziona: in causale c'è il numero, non
// una parola.

export type Candidato = {
  id: string;
  data: string;
  importo: number;
  descrizione: string;
  controparte: string | null;
};

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

export function AbbinaMovimento({
  ordineId,
  ordineNumero,
  totale,
  suggerimento,
  tipo,
  etichetta,
  cerca,
  abbina,
}: {
  ordineId: string;
  ordineNumero: string;
  totale: number;
  suggerimento: string;
  tipo: "incasso" | "costo";
  etichetta: string;
  cerca: (q: string) => Promise<Candidato[]>;
  abbina: (fd: FormData) => Promise<void>;
}) {
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState(suggerimento);
  const [righe, setRighe] = useState<Candidato[] | null>(null);
  const [importo, setImporto] = useState("");
  const [attesa, avvia] = useTransition();

  function apri() {
    setAperto(true);
    if (righe === null) trova(suggerimento);
  }

  function trova(termine: string) {
    avvia(async () => setRighe(await cerca(termine)));
  }

  return (
    <>
      <button className="btn btn-secondario small" type="button" onClick={apri}>
        {etichetta}
      </button>

      {aperto && (
        <div className="modale-fondo" onClick={() => setAperto(false)}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testa">
              <strong>
                {tipo === "incasso" ? "Incasso di " : "Costo del fornitore per "}
                {ordineNumero}
              </strong>
              <span className="testo-guida">valore ordine {euro(totale)}</span>
              <button className="btn btn-secondario small" type="button" onClick={() => setAperto(false)}>
                Chiudi
              </button>
            </div>

            <div className="modale-cerca">
              <input
                type="search"
                value={q}
                placeholder="Numero d'ordine, nome in causale o importo"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    trova(q);
                  }
                }}
              />
              <button className="btn small" type="button" onClick={() => trova(q)} disabled={attesa}>
                {attesa ? "Cerco…" : "Cerca"}
              </button>
            </div>

            {tipo === "costo" && (
              <p className="testo-guida" style={{ margin: "0 0 8px" }}>
                Il costo del fornitore è una <strong>frazione</strong> del valore dell&apos;ordine (~60%), quindi non
                si trova per importo uguale: in causale c&apos;è il <strong>numero dell&apos;ordine</strong>. Se un
                bonifico copre più ordini, scrivi qui sotto solo la parte di questo.
              </p>
            )}

            <div className="modale-lista">
              {righe === null ? (
                <p className="testo-guida">Cerco i movimenti…</p>
              ) : righe.length === 0 ? (
                <p className="testo-guida">
                  Nessun movimento libero trovato. I movimenti già usati da un altro ordine — o che Finance ha
                  registrato per una fattura — non compaiono.
                </p>
              ) : (
                righe.map((m) => (
                  <form action={abbina} key={m.id} className="modale-riga">
                    <input type="hidden" name="ordineId" value={ordineId} />
                    <input type="hidden" name="movimentoId" value={m.id} />
                    {tipo === "costo" && (
                      <input type="hidden" name="importo" value={importo || Math.abs(m.importo).toFixed(2)} />
                    )}
                    <span className="modale-data">
                      {new Date(m.data).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" })}
                    </span>
                    <span className="modale-importo">{euro(m.importo)}</span>
                    <span className="modale-desc" title={m.descrizione}>
                      {m.descrizione}
                      {m.controparte ? ` · ${m.controparte}` : ""}
                    </span>
                    <button className="btn small" type="submit">
                      Abbina
                    </button>
                  </form>
                ))
              )}
            </div>

            {tipo === "costo" && (
              <div className="modale-cerca" style={{ marginTop: 6 }}>
                <label htmlFor={`imp-${ordineId}`} className="testo-guida">
                  Importo da attribuire a questo ordine
                </label>
                <input
                  id={`imp-${ordineId}`}
                  type="text"
                  inputMode="decimal"
                  value={importo}
                  placeholder="tutto il movimento"
                  onChange={(e) => setImporto(e.target.value)}
                  style={{ maxWidth: 140 }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
