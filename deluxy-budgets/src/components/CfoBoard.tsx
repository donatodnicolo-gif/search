"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIPI_PL } from "@/lib/cfo";
import { eur, MESI, pct } from "@/lib/format";

type Riga = {
  categoriaId: string | null;
  categoriaNome: string | null;
  tipoPL: string | null;
  colore: string | null;
  uscite: number;
  movimenti: number;
  perMese: number[];
  controparti: { controparte: string; uscite: number }[];
};
type CatOpt = { id: string; nome: string; tipoPL: string; colore: string | null };

const tipoLabel = (k: string | null) => TIPI_PL.find((t) => t.key === k)?.label ?? "—";
const tipoBadge = (k: string | null) => TIPI_PL.find((t) => t.key === k)?.badge ?? "neutral";

export function CfoBoard({
  periodoLabel,
  totali,
  righe,
  categorie,
}: {
  periodoLabel: string;
  totali: { uscite: number; movimenti: number; perMese: number[] };
  righe: Riga[];
  categorie: CatOpt[];
}) {
  const router = useRouter();
  const [espansa, setEspansa] = useState<string | null>(null);
  const [nuova, setNuova] = useState<{ nome: string; tipoPL: string } | null>(null);
  const [assegna, setAssegna] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const nonCategorizzate = righe.find((r) => r.categoriaId === null);
  const categorizzato = righe.filter((r) => r.categoriaId !== null).reduce((s, r) => s + r.uscite, 0);
  const coperturaPct = totali.uscite > 0 ? (categorizzato / totali.uscite) * 100 : 0;

  async function creaCategoria() {
    if (!nuova?.nome.trim()) {
      setErrore("Indica il nome della categoria.");
      return;
    }
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/cfo/categorie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuova),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Creazione non riuscita.");
      return;
    }
    setNuova(null);
    router.refresh();
  }

  // Crea una regola "la controparte X va nella categoria Y" (match esatto).
  async function assegnaControparte(controparte: string) {
    const categoriaId = assegna[controparte];
    if (!categoriaId) return;
    setBusy(true);
    const res = await fetch("/api/cfo/regole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match: controparte, esatto: true, categoriaId }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function eliminaCategoria(c: Riga) {
    if (!c.categoriaId) return;
    if (!confirm(`Eliminare la categoria "${c.categoriaNome}"? Le sue controparti tornano non categorizzate.`)) return;
    const res = await fetch(`/api/cfo/categorie?id=${encodeURIComponent(c.categoriaId)}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Uscite di banca — {periodoLabel}</div>
          <div className="kpi-value">{eur(totali.uscite)}</div>
          <div className="kpi-sub">{totali.movimenti} movimenti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Costi ricostruiti (categorizzati)</div>
          <div className="kpi-value">{eur(categorizzato)}</div>
          <div className="kpi-sub">{pct(coperturaPct)} delle uscite</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da categorizzare</div>
          <div className={`kpi-value ${nonCategorizzate ? "neg" : ""}`}>
            {eur(nonCategorizzate?.uscite ?? 0)}
          </div>
          <div className="kpi-sub">{nonCategorizzate?.controparti.length ?? 0} controparti</div>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Costi per categoria</h2>
        <button className="btn secondary" onClick={() => { setErrore(null); setNuova({ nome: "", tipoPL: "STRUTTURA" }); }}>
          Aggiungi categoria
        </button>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Voce P&amp;L</th>
                <th className="num">Uscite</th>
                <th className="num">Quota</th>
                <th className="num">Movimenti</th>
                <th className="num">Controparti</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {righe.filter((r) => r.categoriaId).map((r) => (
                <tr key={r.categoriaId}>
                  <td>
                    <span className={`badge ${r.colore ?? tipoBadge(r.tipoPL)}`}>
                      <span className="dot" />{r.categoriaNome}
                    </span>
                  </td>
                  <td className="muted">{tipoLabel(r.tipoPL)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{eur(r.uscite)}</td>
                  <td className="num muted">{pct((r.uscite / (totali.uscite || 1)) * 100, 0)}</td>
                  <td className="num muted">{r.movimenti}</td>
                  <td className="num">
                    <button
                      className="btn secondary small"
                      onClick={() => setEspansa(espansa === r.categoriaId ? null : r.categoriaId)}
                    >
                      {r.controparti.length} {espansa === r.categoriaId ? "▲" : "▼"}
                    </button>
                  </td>
                  <td>
                    <button className="btn secondary small" style={{ color: "var(--red)" }} onClick={() => eliminaCategoria(r)}>
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale categorizzato</td>
                <td />
                <td className="num">{eur(categorizzato)}</td>
                <td className="num">{pct(coperturaPct, 0)}</td>
                <td className="num" />
                <td className="num" />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {espansa && (
        <div className="card">
          <h3 className="section-title" style={{ marginTop: 0 }}>
            Controparti in “{righe.find((r) => r.categoriaId === espansa)?.categoriaNome}”
          </h3>
          <div className="chips">
            {righe.find((r) => r.categoriaId === espansa)?.controparti.map((c) => (
              <span className="chip" key={c.controparte} style={{ cursor: "default" }}>
                {c.controparte} · {eur(c.uscite)}
              </span>
            ))}
          </div>
        </div>
      )}

      {nonCategorizzate && nonCategorizzate.controparti.length > 0 && (
        <>
          <h2 className="section-title">Da categorizzare — {eur(nonCategorizzate.uscite)}</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Controparte</th>
                    <th className="num">Uscite</th>
                    <th>Assegna a categoria</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {nonCategorizzate.controparti.map((c) => (
                    <tr key={c.controparte}>
                      <td style={{ fontWeight: 500 }}>{c.controparte}</td>
                      <td className="num">{eur(c.uscite)}</td>
                      <td style={{ minWidth: 220 }}>
                        <select
                          value={assegna[c.controparte] ?? ""}
                          onChange={(e) => setAssegna((p) => ({ ...p, [c.controparte]: e.target.value }))}
                        >
                          <option value="">Scegli…</option>
                          {categorie.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn primary small"
                          disabled={!assegna[c.controparte] || busy}
                          onClick={() => assegnaControparte(c.controparte)}
                        >
                          Assegna
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            Assegnare una controparte crea una regola permanente: la prossima volta sarà categorizzata da sola.
          </p>
        </>
      )}

      {nuova && (
        <div className="card">
          <h3 className="section-title" style={{ marginTop: 0 }}>Nuova categoria di costo</h3>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome</label>
              <input type="text" value={nuova.nome} onChange={(e) => setNuova({ ...nuova, nome: e.target.value })}
                placeholder="Es. Affitti, Software, Consulenze" />
            </div>
            <div>
              <label className="field-label">Confluisce nella voce di P&amp;L</label>
              <select value={nuova.tipoPL} onChange={(e) => setNuova({ ...nuova, tipoPL: e.target.value })}>
                {TIPI_PL.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-footer">
            {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
            <button className="btn secondary" onClick={() => setNuova(null)}>Annulla</button>
            <button className="btn primary" onClick={creaCategoria} disabled={busy}>
              {busy ? "Creazione…" : "Crea categoria"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
