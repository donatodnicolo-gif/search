"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, pct } from "@/lib/format";

type Riga = {
  id: string;
  slug: string;
  nome: string;
  marginePct: number;
  note: string | null;
  ricavi: number;
  vociFinance: string[];
};

export function MarginiEditor({ tipologie }: { tipologie: Riga[] }) {
  const router = useRouter();
  const [margini, setMargini] = useState<Record<string, number>>(() =>
    Object.fromEntries(tipologie.map((t) => [t.id, t.marginePct]))
  );
  // Mappatura verso le tipologie di Finance, come testo "A, B, C" per riga.
  const [voci, setVoci] = useState<Record<string, string>>(() =>
    Object.fromEntries(tipologie.map((t) => [t.id, t.vociFinance.join(", ")]))
  );
  const [nuovo, setNuovo] = useState<{ nome: string; marginePct: number } | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const totali = useMemo(() => {
    const ricavi = tipologie.reduce((s, t) => s + t.ricavi, 0);
    const margine = tipologie.reduce(
      (s, t) => s + (t.ricavi * (margini[t.id] ?? t.marginePct)) / 100,
      0
    );
    return { ricavi, margine, cogs: ricavi - margine, mediaPct: ricavi > 0 ? (margine / ricavi) * 100 : 0 };
  }, [tipologie, margini]);

  async function salva() {
    setSalvo(true);
    setEsito(null);
    const res = await fetch("/api/margini", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipologie: tipologie.map((t) => ({
          id: t.id,
          marginePct: margini[t.id] ?? t.marginePct,
          vociFinance: voci[t.id] ?? "",
        })),
      }),
    });
    setSalvo(false);
    setEsito(res.ok ? "Margini salvati." : "Salvataggio non riuscito, riprovare.");
    if (res.ok) router.refresh();
  }

  async function creaTipologia() {
    if (!nuovo) return;
    if (!nuovo.nome.trim()) {
      setErrore("Indicare il nome della tipologia.");
      return;
    }
    setSalvo(true);
    setErrore(null);
    const res = await fetch("/api/margini", {
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

  async function elimina(t: Riga) {
    if (!confirm(`Eliminare la tipologia "${t.nome}"?`)) return;
    const res = await fetch(`/api/margini?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Eliminazione non riuscita.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Margine lordo complessivo</div>
          <div className="kpi-value">{eur(totali.margine)}</div>
          <div className="kpi-sub">{pct(totali.mediaPct)} dei ricavi (media ponderata sul mix)</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Costo del venduto</div>
          <div className="kpi-value">{eur(totali.cogs)}</div>
          <div className="kpi-sub">su {eur(totali.ricavi)} di ricavi a budget</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Tipologie di servizio</div>
          <div className="kpi-value">{tipologie.length}</div>
          <div className="kpi-sub">
            {tipologie.filter((t) => t.ricavi > 0).length} con ricavi a budget
          </div>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Margine per tipologia</h2>
        <button
          className="btn secondary"
          onClick={() => {
            setErrore(null);
            setNuovo({ nome: "", marginePct: 35 });
          }}
        >
          Aggiungi tipologia
        </button>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipologia</th>
                <th className="num">Ricavi a budget</th>
                <th className="num">% sul totale</th>
                <th className="num">Margine %</th>
                <th className="num">Margine €</th>
                <th className="num">Costo del venduto</th>
                <th>Voci in Finance (consuntivo)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tipologie.map((t) => {
                const m = margini[t.id] ?? t.marginePct;
                const margineEur = (t.ricavi * m) / 100;
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.nome}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{t.slug}</div>
                    </td>
                    <td className="num">{t.ricavi > 0 ? eur(t.ricavi) : <span className="muted">—</span>}</td>
                    <td className="num muted">
                      {totali.ricavi > 0 ? pct((t.ricavi / totali.ricavi) * 100, 0) : "—"}
                    </td>
                    <td className="num" style={{ width: 130 }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={m}
                        onChange={(e) =>
                          setMargini((prev) => ({
                            ...prev,
                            [t.id]: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          }))
                        }
                      />
                    </td>
                    <td className="num">{eur(margineEur)}</td>
                    <td className="num muted">{eur(t.ricavi - margineEur)}</td>
                    <td style={{ minWidth: 220 }}>
                      <input
                        type="text"
                        value={voci[t.id] ?? ""}
                        onChange={(e) => setVoci((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        placeholder="es. Consegne, Food Supplier"
                        style={{ fontSize: 13 }}
                      />
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="btn secondary small"
                        style={{ color: "var(--red)" }}
                        onClick={() => elimina(t)}
                        title={t.ricavi > 0 ? "Ha ricavi a budget: vanno azzerati prima" : undefined}
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale</td>
                <td className="num">{eur(totali.ricavi)}</td>
                <td className="num">100%</td>
                <td className="num">{pct(totali.mediaPct)}</td>
                <td className="num">{eur(totali.margine)}</td>
                <td className="num">{eur(totali.cogs)}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {nuovo && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>Nuova tipologia di servizio</h2>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome</label>
              <input
                type="text"
                value={nuovo.nome}
                onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })}
                placeholder="Es. Affiliazioni, Logistica, Regalistica"
              />
            </div>
            <div>
              <label className="field-label">Margine (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={nuovo.marginePct}
                onChange={(e) => setNuovo({ ...nuovo, marginePct: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="form-footer">
            {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
            <button className="btn secondary" onClick={() => setNuovo(null)}>Annulla</button>
            <button className="btn primary" onClick={creaTipologia} disabled={salvo}>
              {salvo ? "Creazione…" : "Crea tipologia"}
            </button>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            Una tipologia nuova nasce senza ricavi: entra nel P&amp;L quando le si attribuisce budget.
            Il margine si può impostare subito.
          </p>
        </div>
      )}

      <p className="page-caption" style={{ marginTop: 14 }}>
        <strong>Voci in Finance</strong>: i nomi delle tipologie dell&apos;app Finance che confluiscono in
        questa voce di budget, separati da virgola (es. il B2B raccoglie <em>Consegne, Food Supplier,
        Magazzino…</em>). Servono al <a href="/consuntivo" style={{ color: "var(--blue)" }}>Consuntivo</a> per
        confrontare budget e fatturato reale. Lasciando il campo vuoto, il confronto avviene per nome identico.
      </p>

      <div className="form-footer">
        {esito && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esito}</span>}
        <button className="btn primary" onClick={salva} disabled={salvo}>
          {salvo ? "Salvataggio…" : "Salva margini e mappature"}
        </button>
      </div>
    </>
  );
}
