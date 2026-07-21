"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

type Piattaforma = {
  id: string;
  nome: string;
  colore: string | null;
  split: Record<number, number>;
};

const COLORI = [
  { key: "blue", label: "Blu" },
  { key: "purple", label: "Viola" },
  { key: "green", label: "Verde" },
  { key: "gold", label: "Oro" },
  { key: "orange", label: "Arancio" },
  { key: "neutral", label: "Grigio" },
];

export function PiattaformeEditor({
  year,
  budgetMese,
  piattaforme,
}: {
  year: number;
  budgetMese: number[]; // budget ADV per mese, indice 0..11
  piattaforme: Piattaforma[];
}) {
  const router = useRouter();
  // % per `${piattaformaId}:${month}`
  const [perc, setPerc] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of piattaforme) for (let m = 1; m <= 12; m++) init[`${p.id}:${m}`] = p.split[m] ?? 0;
    return init;
  });
  const [nuovo, setNuovo] = useState<{ nome: string; colore: string } | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const budgetAnno = budgetMese.reduce((s, v) => s + v, 0);
  const getPct = (id: string, m: number) => perc[`${id}:${m}`] ?? 0;
  const importo = (id: string, m: number) => (budgetMese[m - 1] * getPct(id, m)) / 100;

  const totalePctMese = (m: number) => piattaforme.reduce((s, p) => s + getPct(p.id, m), 0);
  const totaleAnnoPiattaforma = (id: string) => {
    let t = 0;
    for (let m = 1; m <= 12; m++) t += importo(id, m);
    return t;
  };
  const allocatoAnno = useMemo(
    () => piattaforme.reduce((s, p) => s + totaleAnnoPiattaforma(p.id), 0),
    [piattaforme, perc, budgetMese] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function salva() {
    setSalvo(true);
    setEsito(null);
    const split = piattaforme.flatMap((p) =>
      Array.from({ length: 12 }, (_, i) => ({
        piattaformaId: p.id,
        month: i + 1,
        percent: getPct(p.id, i + 1),
      }))
    );
    const res = await fetch("/api/piattaforme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, split }),
    });
    setSalvo(false);
    setEsito(res.ok ? "Ripartizione salvata." : "Salvataggio non riuscito, riprovare.");
    if (res.ok) router.refresh();
  }

  async function creaPiattaforma() {
    if (!nuovo) return;
    if (!nuovo.nome.trim()) {
      setErrore("Indicare il nome della piattaforma.");
      return;
    }
    setSalvo(true);
    setErrore(null);
    const res = await fetch("/api/piattaforme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuovo),
    });
    setSalvo(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setErrore(body?.error ?? "Creazione non riuscita, riprovare.");
      return;
    }
    setNuovo(null);
    router.refresh();
  }

  async function elimina(p: Piattaforma) {
    if (!confirm(`Rimuovere la piattaforma "${p.nome}"? Le sue percentuali verranno cancellate.`)) return;
    const res = await fetch(`/api/piattaforme?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Budget ADV {year}</div>
          <div className="kpi-value">{eur(budgetAnno)}</div>
          <div className="kpi-sub">da ripartire tra le piattaforme</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Allocato alle piattaforme</div>
          <div className={`kpi-value ${Math.abs(allocatoAnno - budgetAnno) < 1 ? "pos" : ""}`}>
            {eur(allocatoAnno)}
          </div>
          <div className="kpi-sub">
            {budgetAnno > 0 ? Math.round((allocatoAnno / budgetAnno) * 100) : 0}% del budget
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Piattaforme</div>
          <div className="kpi-value">{piattaforme.length}</div>
          <div className="kpi-sub">aggiungibili e rimovibili</div>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Ripartizione mensile (% → importo)</h2>
        <button
          className="btn secondary"
          onClick={() => {
            setErrore(null);
            setNuovo({ nome: "", colore: "neutral" });
          }}
        >
          Aggiungi piattaforma
        </button>
      </div>

      {piattaforme.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">◫</div>
          <div className="empty-title">Nessuna piattaforma</div>
          <div className="empty-text">Aggiungi Google, Meta, TikTok o altre e imposta le percentuali per mese.</div>
        </div>
      ) : (
        <div className="card tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Piattaforma</th>
                  {MESI.map((m) => (
                    <th className="num" key={m}>{m}</th>
                  ))}
                  <th className="num">Anno</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {piattaforme.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`badge ${p.colore ?? "neutral"}`}><span className="dot" />{p.nome}</span>
                    </td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <td className="num" key={m} style={{ minWidth: 84 }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={getPct(p.id, m)}
                          onChange={(e) =>
                            setPerc((prev) => ({
                              ...prev,
                              [`${p.id}:${m}`]: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                            }))
                          }
                          style={{ padding: "5px 8px", fontSize: 12.5, textAlign: "right" }}
                        />
                        <div className="muted" style={{ fontSize: 11, marginTop: 3, textAlign: "right" }}>
                          {eur(importo(p.id, m))}
                        </div>
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 600 }}>{eur(totaleAnnoPiattaforma(p.id))}</td>
                    <td>
                      <button
                        className="btn secondary small"
                        style={{ color: "var(--red)" }}
                        onClick={() => elimina(p)}
                        title="Rimuovi piattaforma"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>Totale %</td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const tot = totalePctMese(m);
                    const ok = Math.abs(tot - 100) < 0.5;
                    return (
                      <td className="num" key={m} style={{ color: ok ? "var(--green)" : "var(--orange)" }}>
                        {Math.round(tot)}%
                      </td>
                    );
                  })}
                  <td className="num" />
                  <td />
                </tr>
                <tr className="tot">
                  <td>Budget ADV mese</td>
                  {budgetMese.map((v, i) => (
                    <td className="num" key={i}>{eur(v)}</td>
                  ))}
                  <td className="num">{eur(budgetAnno)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="page-caption" style={{ marginTop: 14 }}>
        L&apos;importo per piattaforma = budget ADV del mese × la sua %. La riga <strong>Totale %</strong> è
        verde quando le piattaforme coprono il 100% del mese, arancione se sopra o sotto. Il budget ADV
        mensile arriva da <a href="/spese" style={{ color: "var(--blue)" }}>Spese ADV</a>.
      </p>

      {nuovo && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>Nuova piattaforma</h2>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome</label>
              <input
                type="text"
                value={nuovo.nome}
                onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })}
                placeholder="Es. Pinterest, LinkedIn, Amazon Ads"
              />
            </div>
            <div>
              <label className="field-label">Colore</label>
              <select value={nuovo.colore} onChange={(e) => setNuovo({ ...nuovo, colore: e.target.value })}>
                {COLORI.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-footer">
            {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
            <button className="btn secondary" onClick={() => setNuovo(null)}>Annulla</button>
            <button className="btn primary" onClick={creaPiattaforma} disabled={salvo}>
              {salvo ? "Creazione…" : "Crea piattaforma"}
            </button>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            Nasce con percentuali a zero: impostale nella griglia e salva.
          </p>
        </div>
      )}

      <div className="form-footer">
        {esito && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esito}</span>}
        <button className="btn primary" onClick={salva} disabled={salvo || piattaforme.length === 0}>
          {salvo ? "Salvataggio…" : "Salva ripartizione"}
        </button>
      </div>
    </>
  );
}
