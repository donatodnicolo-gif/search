"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/format";
import { SCHEMA } from "@/lib/bilancio-voci";
import { NON_PROPONIBILI, type Proposta } from "@/lib/proposta-voci";

const nomeVoce = (codice: string) => SCHEMA.find((v) => v.codice === codice)?.nome ?? codice;

export function PropostaBilancio({
  anno,
  proposte,
  avvisi,
  gia,
}: {
  anno: number;
  proposte: Proposta[];
  avvisi: string[];
  // Voci già compilate: si segnalano, perché accettare la proposta le
  // sovrascriverebbe — e il valore che c'è potrebbe essere quello vero.
  gia: Record<string, number>;
}) {
  const router = useRouter();
  const [scelte, setScelte] = useState<Record<string, boolean>>(
    Object.fromEntries(proposte.map((p) => [p.codice, gia[p.codice] === undefined]))
  );
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  async function applica() {
    const da = proposte.filter((p) => scelte[p.codice]);
    if (!da.length) return;
    setBusy(true);
    setErrore(null);
    for (const p of da) {
      const res = await fetch("/api/bilancio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anno, codice: p.codice, importo: p.importo, nota: `proposta: ${p.fonte}` }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setBusy(false);
        setErrore(b?.error ?? `Non sono riuscito a scrivere ${p.codice}.`);
        return;
      }
    }
    setBusy(false);
    setFatto(`${da.length} voci compilate. Controllale col bilancio vero prima di considerarle definitive.`);
    router.refresh();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Proposta dai dati dell&apos;app</h3>
      <p className="page-caption" style={{ marginTop: 0 }}>
        Quello che l&apos;app sa già, messo nelle voci di legge. <strong>È un punto di partenza, non il
        bilancio</strong>: va confrontato col documento del commercialista e corretto. Ogni riga dice da dove
        viene, così fra sei mesi si capisce se quel numero è il bilancio o una stima.
      </p>

      {avvisi.map((a) => (
        <div key={a} className="card" style={{ borderColor: "var(--orange)", marginBottom: 10 }}>{a}</div>
      ))}
      {errore && <div className="avviso-errore" style={{ marginBottom: 10 }}>{errore}</div>}
      {fatto && <div className="card" style={{ borderColor: "var(--green)", marginBottom: 10 }}>{fatto}</div>}

      {proposte.length === 0 ? (
        <p className="page-caption">Non c&apos;è niente da proporre per il {anno}.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Voce</th>
                  <th className="num">Proposta</th>
                  <th>Da dove viene</th>
                </tr>
              </thead>
              <tbody>
                {proposte.map((p) => (
                  <tr key={p.codice}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(scelte[p.codice])}
                        onChange={(e) => setScelte((s) => ({ ...s, [p.codice]: e.target.checked }))}
                      />
                    </td>
                    <td>
                      <strong>{p.codice}</strong> {nomeVoce(p.codice)}
                      {gia[p.codice] !== undefined && (
                        <div className="muted" style={{ fontSize: 11.5, color: "var(--orange)" }}>
                          già compilata con {eur(gia[p.codice])}: accettando la sovrascrivi
                        </div>
                      )}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(p.importo)}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{p.fonte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={applica}>
            {busy ? "Scrivo…" : "Usa le voci selezionate"}
          </button>
        </>
      )}

      <h4 style={{ margin: "18px 0 6px", fontSize: 14 }}>Quello che l&apos;app non può sapere</h4>
      <div className="table-wrap">
        <table>
          <tbody>
            {NON_PROPONIBILI.map((n) => (
              <tr key={n.codice}>
                <td style={{ whiteSpace: "nowrap" }}><strong>{n.codice}</strong> {n.nome}</td>
                <td className="muted" style={{ fontSize: 12.5 }}>{n.perche}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
