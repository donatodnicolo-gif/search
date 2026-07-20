"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

type MeseSpesa = { month: number; vendite: number; percent: number; pubblicato: number };
type MaisonSpese = { id: string; nome: string; mesi: MeseSpesa[] };

export function SpeseEditor({ year, maisons }: { year: number; maisons: MaisonSpese[] }) {
  const router = useRouter();
  // stato: percent per `${maisonId}:${month}`
  const [percenti, setPercenti] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const m of maisons) for (const x of m.mesi) init[`${m.id}:${x.month}`] = x.percent;
    return init;
  });
  const [salvo, setSalvo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);

  const totale = useMemo(
    () =>
      maisons.reduce(
        (s, m) =>
          s +
          m.mesi.reduce(
            (sm, x) => sm + (x.vendite * (percenti[`${m.id}:${x.month}`] ?? 0)) / 100,
            0
          ),
        0
      ),
    [maisons, percenti]
  );

  async function salva() {
    setSalvo(true);
    setEsito(null);
    const entries = maisons.flatMap((m) =>
      m.mesi.map((x) => ({
        maisonId: m.id,
        month: x.month,
        percent: percenti[`${m.id}:${x.month}`] ?? 0,
      }))
    );
    const res = await fetch("/api/spese", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, entries }),
    });
    setSalvo(false);
    setEsito(res.ok ? "Percentuali salvate." : "Salvataggio non riuscito, riprovare.");
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Spesa ADV consentita {year} (tutte le maison)</div>
          <div className="kpi-value">{eur(totale)}</div>
          <div className="kpi-sub">si aggiorna con le % qui sotto</div>
        </div>
      </div>

      {maisons.map((m) => {
        const totMaison = m.mesi.reduce(
          (s, x) => s + (x.vendite * (percenti[`${m.id}:${x.month}`] ?? 0)) / 100,
          0
        );
        const totPubblicato = m.mesi.reduce((s, x) => s + x.pubblicato, 0);
        return (
          <div className="card" key={m.id}>
            <div className="page-head" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>{m.nome}</h2>
                <p className="page-caption">
                  Consentito {eur(totMaison)} · pubblicato {eur(totPubblicato)}
                </p>
              </div>
            </div>
            <div className="mesi-grid">
              {m.mesi.map((x) => {
                const key = `${m.id}:${x.month}`;
                const percent = percenti[key] ?? 0;
                return (
                  <div className="mese-cell" key={x.month}>
                    <div className="k">{MESI[x.month - 1]} · % su {eur(x.vendite)}</div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={percent}
                      onChange={(e) =>
                        setPercenti((p) => ({
                          ...p,
                          [key]: e.target.value === "" ? 0 : Number(e.target.value),
                        }))
                      }
                    />
                    <div className="sub">= {eur((x.vendite * percent) / 100)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="form-footer">
        {esito && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esito}</span>}
        <button className="btn primary" onClick={salva} disabled={salvo}>
          {salvo ? "Salvataggio…" : "Salva percentuali"}
        </button>
      </div>
    </>
  );
}
