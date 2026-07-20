"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { costoPersonaAnno, costoPersonaMese, TIPI_PERSONA, type Persona } from "@/lib/calc";
import { eur, MESI, pct } from "@/lib/format";

type MaisonOpt = { id: string; nome: string };

const VUOTO = {
  id: "",
  nome: "",
  ruolo: "",
  tipo: "DIPENDENTE",
  importo: 0,
  periodicita: "ANNUO",
  contributiPct: 38,
  mesi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  maisonId: "",
  note: "",
};

// Valori di partenza sensati per tipo: un consulente si paga a mese senza
// contributi, uno stagista ha un rimborso mensile, un dipendente una RAL.
const DEFAULT_TIPO: Record<string, { periodicita: string; contributiPct: number }> = {
  DIPENDENTE: { periodicita: "ANNUO", contributiPct: 38 },
  STAGISTA: { periodicita: "MENSILE", contributiPct: 0 },
  CONSULENTE: { periodicita: "MENSILE", contributiPct: 0 },
};

export function DipendentiEditor({
  year,
  persone,
  maisons,
}: {
  year: number;
  persone: Persona[];
  maisons: MaisonOpt[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<typeof VUOTO | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const totaleAnno = persone.reduce((s, p) => s + costoPersonaAnno(p), 0);
  const perTipo = TIPI_PERSONA.map((t) => ({
    ...t,
    persone: persone.filter((p) => p.tipo === t.key),
    costo: persone.filter((p) => p.tipo === t.key).reduce((s, p) => s + costoPersonaAnno(p), 0),
  }));
  const nomeMaison = (id: string | null) => maisons.find((m) => m.id === id)?.nome ?? "Struttura";

  function apriNuovo() {
    setErrore(null);
    setForm({ ...VUOTO });
  }

  function apriModifica(p: Persona) {
    setErrore(null);
    setForm({
      id: p.id,
      nome: p.nome,
      ruolo: p.ruolo ?? "",
      tipo: p.tipo,
      importo: p.importo,
      periodicita: p.periodicita,
      contributiPct: p.contributiPct,
      mesi: p.mesi,
      maisonId: p.maisonId ?? "",
      note: p.note ?? "",
    });
  }

  async function salva() {
    if (!form) return;
    if (!form.nome.trim()) {
      setErrore("Indicare il nome.");
      return;
    }
    if (form.mesi.length === 0) {
      setErrore("Selezionare almeno un mese di competenza.");
      return;
    }
    setSalvo(true);
    setErrore(null);
    const res = await fetch("/api/dipendenti", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        year,
        maisonId: form.maisonId || null,
        ruolo: form.ruolo || null,
        note: form.note || null,
      }),
    });
    setSalvo(false);
    if (!res.ok) {
      setErrore("Salvataggio non riuscito, riprovare.");
      return;
    }
    setForm(null);
    router.refresh();
  }

  async function elimina(p: Persona) {
    if (!confirm(`Eliminare ${p.nome} dal budget ${year}?`)) return;
    const res = await fetch(`/api/dipendenti?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  // Anteprima del costo mensile mentre si compila il form.
  const anteprima = form
    ? costoPersonaMese(
        {
          id: "",
          nome: "",
          ruolo: null,
          tipo: form.tipo,
          importo: form.importo,
          periodicita: form.periodicita,
          contributiPct: form.contributiPct,
          mesi: form.mesi,
          maisonId: null,
          note: null,
        },
        form.mesi[0] ?? 1
      )
    : 0;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Costo del personale {year}</div>
          <div className="kpi-value">{eur(totaleAnno)}</div>
          <div className="kpi-sub">{persone.length} persone a budget</div>
        </div>
        {perTipo.map((t) => (
          <div className="kpi" key={t.key}>
            <div className="kpi-label">
              <span className={`badge ${t.badge}`}><span className="dot" />{t.label}</span>
            </div>
            <div className="kpi-value">{eur(t.costo)}</div>
            <div className="kpi-sub">{t.persone.length} in organico</div>
          </div>
        ))}
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Organico a budget</h2>
        <button className="btn primary" onClick={apriNuovo}>Aggiungi persona</button>
      </div>

      {persone.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">👤</div>
          <div className="empty-title">Nessuna persona a budget</div>
          <div className="empty-text">
            Aggiungi dipendenti con RAL, stagisti o consulenti: il costo entra automaticamente nel P&amp;L.
          </div>
        </div>
      ) : (
        <div className="card tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Attribuzione</th>
                  <th className="num">Importo</th>
                  <th className="num">Oneri</th>
                  <th>Mesi</th>
                  <th className="num">Costo mese</th>
                  <th className="num">Costo anno</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {persone.map((p) => {
                  const t = TIPI_PERSONA.find((x) => x.key === p.tipo);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.nome}</div>
                        {p.ruolo && <div className="muted" style={{ fontSize: 12 }}>{p.ruolo}</div>}
                      </td>
                      <td>
                        <span className={`badge ${t?.badge ?? "neutral"}`}>
                          <span className="dot" />{t?.label ?? p.tipo}
                        </span>
                      </td>
                      <td className="muted">{nomeMaison(p.maisonId)}</td>
                      <td className="num">
                        {eur(p.importo)}
                        <span className="muted" style={{ fontSize: 11.5, display: "block" }}>
                          {p.periodicita === "ANNUO" ? "RAL annua" : "al mese"}
                        </span>
                      </td>
                      <td className="num muted">{p.contributiPct > 0 ? pct(p.contributiPct, 0) : "—"}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {p.mesi.length === 12 ? "tutto l'anno" : p.mesi.map((m) => MESI[m - 1]).join(" ")}
                      </td>
                      <td className="num">{eur(costoPersonaMese(p, p.mesi[0] ?? 1))}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{eur(costoPersonaAnno(p))}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn secondary small" onClick={() => apriModifica(p)}>Modifica</button>{" "}
                        <button className="btn secondary small" style={{ color: "var(--red)" }} onClick={() => elimina(p)}>
                          Elimina
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="tot">
                  <td colSpan={7}>Totale costo del personale</td>
                  <td className="num">{eur(totaleAnno)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {form && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            {form.id ? "Modifica persona" : "Nuova persona"}
          </h2>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome e cognome"
              />
            </div>
            <div>
              <label className="field-label">Ruolo</label>
              <input
                type="text"
                value={form.ruolo}
                onChange={(e) => setForm({ ...form, ruolo: e.target.value })}
                placeholder="Es. Responsabile commerciale"
              />
            </div>
            <div>
              <label className="field-label">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => {
                  const tipo = e.target.value;
                  setForm({ ...form, tipo, ...DEFAULT_TIPO[tipo] });
                }}
              >
                {TIPI_PERSONA.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">
                {form.periodicita === "ANNUO" ? "RAL lorda annua (€)" : "Compenso mensile (€)"}
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={form.importo || ""}
                onChange={(e) => setForm({ ...form, importo: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="field-label">Periodicità</label>
              <select
                value={form.periodicita}
                onChange={(e) => setForm({ ...form, periodicita: e.target.value })}
              >
                <option value="ANNUO">Importo annuo (RAL)</option>
                <option value="MENSILE">Importo mensile</option>
              </select>
            </div>
            <div>
              <label className="field-label">Oneri sopra il lordo (%)</label>
              <input
                type="number"
                min={0}
                max={200}
                step={1}
                value={form.contributiPct}
                onChange={(e) => setForm({ ...form, contributiPct: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="field-label">Attribuzione</label>
              <select
                value={form.maisonId}
                onChange={(e) => setForm({ ...form, maisonId: e.target.value })}
              >
                <option value="">Struttura (non attribuito)</option>
                {maisons.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div className="full">
              <label className="field-label">Mesi in cui il costo è a carico</label>
              <div className="chips">
                {MESI.map((m, i) => {
                  const month = i + 1;
                  const on = form.mesi.includes(month);
                  return (
                    <button
                      type="button"
                      key={m}
                      className={`chip${on ? " on" : ""}`}
                      // aggiornamento funzionale: due click ravvicinati sui mesi
                      // non devono sovrascriversi a vicenda
                      onClick={() =>
                        setForm((f) =>
                          f === null
                            ? f
                            : {
                                ...f,
                                mesi: f.mesi.includes(month)
                                  ? f.mesi.filter((x) => x !== month)
                                  : [...f.mesi, month].sort((a, b) => a - b),
                              }
                        )
                      }
                    >
                      {m}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="chip azione"
                  onClick={() =>
                    setForm((f) =>
                      f === null
                        ? f
                        : { ...f, mesi: f.mesi.length === 12 ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
                    )
                  }
                >
                  {form.mesi.length === 12 ? "Nessuno" : "Tutto l'anno"}
                </button>
              </div>
            </div>
            <div className="full">
              <label className="field-label">Note</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Es. assunzione prevista a settembre"
              />
            </div>
          </div>

          <div className="form-footer">
            {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
            <span className="muted" style={{ fontSize: 13.5 }}>
              Costo azienda: <strong style={{ color: "var(--text)" }}>{eur(anteprima)}</strong>/mese ·{" "}
              <strong style={{ color: "var(--text)" }}>{eur(anteprima * form.mesi.length)}</strong> sull&apos;anno
            </span>
            <button className="btn secondary" onClick={() => setForm(null)}>Annulla</button>
            <button className="btn primary" onClick={salva} disabled={salvo}>
              {salvo ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
