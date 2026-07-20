"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIPI_PERSONA } from "@/lib/calc";
import { eur } from "@/lib/format";

type PersonaTeam = { id: string; nome: string; ruolo: string | null; tipo: string; costo: number };
type TeamConOrganico = {
  id: string;
  nome: string;
  responsabile: string | null;
  colore: string | null;
  ordine: number;
  note: string | null;
  persone: PersonaTeam[];
  costo: number;
};

const COLORI = [
  { key: "neutral", label: "Grigio" },
  { key: "blue", label: "Blu" },
  { key: "green", label: "Verde" },
  { key: "gold", label: "Oro" },
  { key: "purple", label: "Viola" },
  { key: "orange", label: "Arancio" },
];

const VUOTO = { id: "", nome: "", responsabile: "", colore: "neutral", ordine: 0, note: "" };

export function TeamEditor({
  team,
  senzaTeam,
}: {
  team: TeamConOrganico[];
  senzaTeam: PersonaTeam[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<typeof VUOTO | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const costoTotale = team.reduce((s, t) => s + t.costo, 0);
  const personeInTeam = team.reduce((s, t) => s + t.persone.length, 0);

  async function salva() {
    if (!form) return;
    if (!form.nome.trim()) {
      setErrore("Indicare il nome del team.");
      return;
    }
    setSalvo(true);
    setErrore(null);
    const res = await fetch("/api/team", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        responsabile: form.responsabile || null,
        note: form.note || null,
      }),
    });
    setSalvo(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setErrore(body?.error ?? "Salvataggio non riuscito, riprovare.");
      return;
    }
    setForm(null);
    router.refresh();
  }

  async function elimina(t: TeamConOrganico) {
    const avviso =
      t.persone.length > 0
        ? `Sciogliere il team "${t.nome}"? Le ${t.persone.length} persone restano a budget, ma senza team.`
        : `Eliminare il team "${t.nome}"?`;
    if (!confirm(avviso)) return;
    const res = await fetch(`/api/team?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const tipoLabel = (tipo: string) => TIPI_PERSONA.find((x) => x.key === tipo)?.label ?? tipo;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Costo del lavoro nei team</div>
          <div className="kpi-value">{eur(costoTotale)}</div>
          <div className="kpi-sub">{personeInTeam} persone assegnate</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Team attivi</div>
          <div className="kpi-value">{team.length}</div>
          <div className="kpi-sub">
            {team.filter((t) => t.responsabile).length} con responsabile indicato
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Persone senza team</div>
          <div className={`kpi-value ${senzaTeam.length > 0 ? "neg" : ""}`}>{senzaTeam.length}</div>
          <div className="kpi-sub">{eur(senzaTeam.reduce((s, p) => s + p.costo, 0))} di costo</div>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Squadre</h2>
        <button
          className="btn primary"
          onClick={() => {
            setErrore(null);
            setForm({ ...VUOTO, ordine: team.length });
          }}
        >
          Crea team
        </button>
      </div>

      {team.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">◇</div>
          <div className="empty-title">Nessun team creato</div>
          <div className="empty-text">
            Crea le squadre (Commerciale, Operations, Marketing…) e assegna le persone dalla scheda in{" "}
            <Link href="/dipendenti" style={{ color: "var(--blue)" }}>Dipendenti</Link>.
          </div>
        </div>
      ) : (
        team.map((t) => (
          <div className="card" key={t.id}>
            <div className="page-head" style={{ marginBottom: t.persone.length ? 14 : 0 }}>
              <div>
                <h3 className="section-title" style={{ margin: 0 }}>
                  <span className={`badge ${t.colore ?? "neutral"}`} style={{ marginRight: 10 }}>
                    <span className="dot" />
                    {t.nome}
                  </span>
                </h3>
                <p className="page-caption">
                  {t.responsabile ? `Responsabile: ${t.responsabile}` : "Responsabile non indicato"} ·{" "}
                  {t.persone.length} {t.persone.length === 1 ? "persona" : "persone"} · costo{" "}
                  <strong style={{ color: "var(--text)" }}>{eur(t.costo)}</strong>
                  {t.note && ` · ${t.note}`}
                </p>
              </div>
              <div className="page-actions">
                <button
                  className="btn secondary small"
                  onClick={() => {
                    setErrore(null);
                    setForm({
                      id: t.id,
                      nome: t.nome,
                      responsabile: t.responsabile ?? "",
                      colore: t.colore ?? "neutral",
                      ordine: t.ordine,
                      note: t.note ?? "",
                    });
                  }}
                >
                  Modifica
                </button>
                <button
                  className="btn secondary small"
                  style={{ color: "var(--red)" }}
                  onClick={() => elimina(t)}
                >
                  Sciogli
                </button>
              </div>
            </div>

            {t.persone.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th>Tipo</th>
                      <th className="num">Costo anno</th>
                      <th className="num">% del team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.persone.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.nome}</div>
                          {p.ruolo && <div className="muted" style={{ fontSize: 12 }}>{p.ruolo}</div>}
                        </td>
                        <td className="muted">{tipoLabel(p.tipo)}</td>
                        <td className="num">{eur(p.costo)}</td>
                        <td className="num muted">
                          {t.costo > 0 ? `${Math.round((p.costo / t.costo) * 100)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      {senzaTeam.length > 0 && (
        <div className="card">
          <h3 className="section-title" style={{ marginTop: 0 }}>Persone senza team</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tipo</th>
                  <th className="num">Costo anno</th>
                </tr>
              </thead>
              <tbody>
                {senzaTeam.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.nome}</div>
                      {p.ruolo && <div className="muted" style={{ fontSize: 12 }}>{p.ruolo}</div>}
                    </td>
                    <td className="muted">{tipoLabel(p.tipo)}</td>
                    <td className="num">{eur(p.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            Assegna un team dalla scheda della persona in{" "}
            <Link href="/dipendenti" style={{ color: "var(--blue)" }}>Dipendenti</Link>.
          </p>
        </div>
      )}

      {form && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            {form.id ? "Modifica team" : "Nuovo team"}
          </h2>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome del team</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Es. Commerciale"
              />
            </div>
            <div>
              <label className="field-label">Responsabile</label>
              <input
                type="text"
                value={form.responsabile}
                onChange={(e) => setForm({ ...form, responsabile: e.target.value })}
                placeholder="Chi risponde del team"
              />
            </div>
            <div>
              <label className="field-label">Colore del badge</label>
              <select value={form.colore} onChange={(e) => setForm({ ...form, colore: e.target.value })}>
                {COLORI.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Ordine di visualizzazione</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.ordine}
                onChange={(e) => setForm({ ...form, ordine: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="full">
              <label className="field-label">Note</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Es. copre D2C e lead generation B2B"
              />
            </div>
          </div>
          <div className="form-footer">
            {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
            <button className="btn secondary" onClick={() => setForm(null)}>Annulla</button>
            <button className="btn primary" onClick={salva} disabled={salvo}>
              {salvo ? "Salvataggio…" : "Salva team"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
