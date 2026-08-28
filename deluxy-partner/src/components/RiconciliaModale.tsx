"use client";

import { useState, useTransition } from "react";
import type { MovimentoCandidato } from "@/lib/ordini-actions";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

// Popup «Riconcilia» per un ordine non riconciliato: si cerca il movimento
// bancario per importo o per nome/causale e lo si abbina. La ricerca gira lato
// server (cerca), l'abbinamento è una server action (riconcilia).
export function RiconciliaModale({
  ordineId,
  ordineNome,
  totale,
  clienteNome,
  cerca,
  riconcilia,
}: {
  ordineId: string;
  ordineNome: string;
  totale: number;
  clienteNome: string | null;
  cerca: (q: string) => Promise<MovimentoCandidato[]>;
  riconcilia: (fd: FormData) => Promise<void>;
}) {
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState<MovimentoCandidato[]>([]);
  const [cercato, setCercato] = useState(false);
  const [pending, start] = useTransition();

  const ricerca = (term: string) => {
    setQ(term);
    start(async () => {
      setRisultati(await cerca(term));
      setCercato(true);
    });
  };

  const apri = () => {
    setAperto(true);
    // di default proponiamo i movimenti dello stesso importo dell'ordine
    ricerca(totale.toFixed(2));
  };

  return (
    <>
      <button className="btn small primary" type="button" onClick={apri}>Riconcilia</button>

      {aperto && (
        <div className="modal-overlay" onClick={() => setAperto(false)} role="dialog" aria-modal="true">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div style={{ fontWeight: 600 }}>Riconcilia ordine {ordineNome}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {eur.format(totale)}{clienteNome ? ` · ${clienteNome}` : ""}
                </div>
              </div>
              {/* ✕ obbligatoria in testata (Libro v1.7 §9): resta in vista
                  anche a risultati lunghi perché la testata è sticky. */}
              <button className="modal-chiudi" type="button" aria-label="Chiudi" onClick={() => setAperto(false)}>✕</button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); ricerca(q); }}
              className="filters"
              style={{ marginBottom: 12 }}
            >
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca per importo (es. 250) o per nome/causale"
                autoFocus
                style={{ flex: "1 1 240px", minWidth: 200 }}
              />
              <button className="btn secondary small" type="submit">Cerca</button>
              <button className="btn secondary small" type="button" onClick={() => ricerca(clienteNome ?? "")} disabled={!clienteNome}>
                Per nome cliente
              </button>
            </form>

            <div className="modal-body">
              {pending ? (
                <p className="muted" style={{ fontSize: 13 }}>Cerco…</p>
              ) : risultati.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>
                  {cercato ? "Nessun movimento non abbinato corrisponde alla ricerca." : "Digita un importo o un nome e cerca."}
                </p>
              ) : (
                <table>
                  <thead>
                    <tr><th>Data</th><th>Nome / causale</th><th className="num">Importo</th><th></th></tr>
                  </thead>
                  <tbody>
                    {risultati.map((m) => (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{dataIt(m.data)}</td>
                        <td style={{ fontSize: 12.5 }}>
                          {m.controparte ?? "—"}
                          <div className="muted" style={{ fontSize: 11 }}>{m.descrizione.slice(0, 50)}</div>
                        </td>
                        <td className={`num ${Math.abs(m.importo - totale) < 0.02 ? "pos" : ""}`} style={{ fontWeight: Math.abs(m.importo - totale) < 0.02 ? 700 : 400 }}>
                          {eur.format(m.importo)}
                        </td>
                        <td>
                          <form action={riconcilia} onSubmit={() => setAperto(false)}>
                            <input type="hidden" name="ordineId" value={ordineId} />
                            <input type="hidden" name="transazioneId" value={m.id} />
                            <button className="btn small primary" type="submit">Abbina</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
