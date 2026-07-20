"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/format";

type Scenario = { livello: string; label: string; moltiplicatore: number; premio: number };
type Costo = { id: string; tipo: string; label: string; valore: number };

const TIPO_LABEL: Record<string, string> = {
  COGS_PCT: "% sulle vendite",
  FISSO_MENSILE: "€ / mese",
  FISSO_ANNUO: "€ / anno",
};

export function ImpostazioniForm({
  year,
  scenari: scenariIniziali,
  costi: costiIniziali,
}: {
  year: number;
  scenari: Scenario[];
  costi: Costo[];
}) {
  const router = useRouter();
  const [scenari, setScenari] = useState(scenariIniziali);
  const [costi, setCosti] = useState(costiIniziali);
  const [salvo, setSalvo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);

  async function salva() {
    setSalvo(true);
    setEsito(null);
    const res = await fetch("/api/impostazioni", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, scenari, costi }),
    });
    setSalvo(false);
    setEsito(res.ok ? "Impostazioni salvate." : "Salvataggio non riuscito, riprovare.");
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>Livelli di budget e premi</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Livello</th>
                <th className="num">Moltiplicatore sul pubblicato</th>
                <th className="num">Premio al raggiungimento (€)</th>
              </tr>
            </thead>
            <tbody>
              {scenari.map((s, i) => (
                <tr key={s.livello}>
                  <td style={{ fontWeight: 500 }}>{s.label}</td>
                  <td className="num" style={{ width: 220 }}>
                    <input
                      type="number"
                      min={0.5}
                      step={0.05}
                      value={s.moltiplicatore}
                      disabled={s.livello === "RAGGIUNGIBILE"}
                      title={s.livello === "RAGGIUNGIBILE" ? "Il livello raggiungibile è il budget pubblicato (×1)" : undefined}
                      onChange={(e) => {
                        const v = [...scenari];
                        v[i] = { ...s, moltiplicatore: Number(e.target.value) || 1 };
                        setScenari(v);
                      }}
                    />
                  </td>
                  <td className="num" style={{ width: 240 }}>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={s.premio}
                      onChange={(e) => {
                        const v = [...scenari];
                        v[i] = { ...s, premio: Number(e.target.value) || 0 };
                        setScenari(v);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="page-caption" style={{ marginTop: 12 }}>
          Il livello &quot;Raggiungibile&quot; è il budget pubblicato {year} (moltiplicatore fisso ×1). I premi sono il
          monte premi totale riconosciuto al team se le vendite dell&apos;anno raggiungono quel livello.
        </p>
      </div>

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>Voci di costo del P&amp;L</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Voce</th>
                <th>Unità</th>
                <th className="num">Valore</th>
              </tr>
            </thead>
            <tbody>
              {costi.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.label}</td>
                  <td className="muted">{TIPO_LABEL[c.tipo] ?? c.tipo}</td>
                  <td className="num" style={{ width: 220 }}>
                    <input
                      type="number"
                      min={0}
                      step={c.tipo === "COGS_PCT" ? 0.5 : 100}
                      value={c.valore}
                      onChange={(e) => {
                        const v = [...costi];
                        v[i] = { ...c, valore: Number(e.target.value) || 0 };
                        setCosti(v);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="page-caption" style={{ marginTop: 12 }}>
          Il costo del venduto di partenza (65%) deriva dal margine stimato 2026 dei budget pubblicati (≈35% delle vendite).
          I costi fissi sono da impostare: entrano nel P&amp;L come {eur(0)} finché non vengono valorizzati.
        </p>
      </div>

      <div className="form-footer">
        {esito && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esito}</span>}
        <button className="btn primary" onClick={salva} disabled={salvo}>
          {salvo ? "Salvataggio…" : "Salva impostazioni"}
        </button>
      </div>
    </>
  );
}
