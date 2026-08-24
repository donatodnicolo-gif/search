"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";
import { AMBITI, OBIETTIVI, type PremioMisurato } from "@/lib/premi-tipi";

type Opzione = { id: string; nome: string };

const VUOTO = {
  nome: "",
  ambito: "AZIENDA",
  teamId: "",
  dipendenteId: "",
  obiettivoTipo: "VENDITE_AZIENDA",
  obiettivoRif: "",
  soglia: "",
  dal: 1,
  al: 12,
  importo: "",
  note: "",
};

const numero = (t: string) => {
  const pulito = t.replace(/[\s €.]/g, "").replace(",", ".");
  if (pulito === "" || pulito === "-") return null;
  const n = Number(pulito);
  return Number.isFinite(n) ? n : null;
};

export function PremiEditor({
  year,
  premi,
  team,
  persone,
  maisons,
  linee,
  livello,
  presetPersonaId = null,
}: {
  year: number;
  premi: PremioMisurato[];
  team: Opzione[];
  persone: Opzione[];
  maisons: { slug: string; nome: string }[];
  linee: Opzione[];
  livello: string;
  // Arrivando da Team con ?persona=<id>, il modulo si apre già compilato su
  // quella persona: «come si inserisce un budget per una persona» si risponde
  // con una porta aperta, non con una spiegazione da cercare.
  presetPersonaId?: string | null;
}) {
  const router = useRouter();
  const presetValido = presetPersonaId !== null && persone.some((p) => p.id === presetPersonaId);
  const [form, setForm] = useState(
    presetValido ? { ...VUOTO, ambito: "PERSONA", dipendenteId: presetPersonaId! } : { ...VUOTO }
  );
  const [apertoNuovo, setApertoNuovo] = useState(presetValido);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [lavoro, setLavoro] = useState<string | null>(null);

  const obiettivo = OBIETTIVI.find((o) => o.key === form.obiettivoTipo)!;

  function apriNuovo() {
    setForm({ ...VUOTO });
    setInModifica(null);
    setApertoNuovo(true);
    setErrore(null);
  }

  function apriModifica(p: PremioMisurato) {
    setForm({
      nome: p.nome,
      ambito: p.ambito,
      teamId: p.teamId ?? "",
      dipendenteId: p.dipendenteId ?? "",
      obiettivoTipo: p.obiettivoTipo,
      obiettivoRif: p.obiettivoRif ?? "",
      soglia: String(p.soglia).replace(".", ","),
      dal: p.dal,
      al: p.al,
      importo: String(p.importo).replace(".", ","),
      note: p.note ?? "",
    });
    setInModifica(p.id);
    setApertoNuovo(true);
    setErrore(null);
  }

  async function salva() {
    setSalvo(true);
    setErrore(null);
    const corpo = {
      ...(inModifica ? { id: inModifica } : { year }),
      ...form,
      soglia: numero(form.soglia) ?? 0,
      importo: numero(form.importo) ?? 0,
    };
    const res = await fetch("/api/premi", {
      method: inModifica ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const body = await res.json().catch(() => null);
    setSalvo(false);
    if (!res.ok) {
      setErrore(body?.error ?? "Premio non salvato, riprova.");
      return;
    }
    setApertoNuovo(false);
    setInModifica(null);
    router.refresh();
  }

  async function riconosci(p: PremioMisurato, valore: boolean | null) {
    setLavoro(p.id);
    await fetch("/api/premi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, riconosciuto: valore }),
    });
    setLavoro(null);
    router.refresh();
  }

  async function elimina(p: PremioMisurato) {
    if (!window.confirm(`Elimino il premio «${p.nome}» (${eur(p.importo)} a ${p.destinatario})?`)) return;
    setLavoro(p.id);
    await fetch("/api/premi", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    setLavoro(null);
    router.refresh();
  }

  const totale = premi.reduce((s, p) => s + p.importo, 0);
  const daPagare = premi.filter((p) => p.costa).reduce((s, p) => s + p.importo, 0);

  const perAmbito = AMBITI.map((a) => ({
    ...a,
    righe: premi.filter((p) => p.ambito === a.key),
  })).filter((a) => a.righe.length > 0);

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Premi scritti</div>
          <div className="kpi-value">{eur(totale)}</div>
          <div className="kpi-sub">{premi.length} {premi.length === 1 ? "premio" : "premi"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Quanto scatta su questo scenario</div>
          <div className="kpi-value">{eur(daPagare)}</div>
          {/* ⚠️ Il numero che conta è questo, e cambia col livello: nello
              sfidante le vendite sono più alte, quindi scattano più premi. */}
          <div className="kpi-sub">
            {premi.filter((p) => p.costa).length} su {premi.length} · è la riga «Premi» del P&amp;L
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Non ancora raggiunti</div>
          <div className="kpi-value">{eur(totale - daPagare)}</div>
          <div className="kpi-sub">non pesano sul conto economico</div>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <div />
        <div className="page-actions">
          <button className="btn primary" onClick={apriNuovo}>+ Nuovo target o premio</button>
        </div>
      </div>

      {apertoNuovo && (
        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            {inModifica ? "Modifica il premio" : "Nuovo premio"}
          </h2>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Come si chiama</span>
              <input
                type="text"
                value={form.nome}
                placeholder="Bonus vendite Q4, Premio squadra Operations…"
                maxLength={80}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>A chi va</span>
              <select value={form.ambito} onChange={(e) => setForm({ ...form, ambito: e.target.value })}>
                {AMBITI.map((a) => (<option key={a.key} value={a.key}>{a.nome}</option>))}
              </select>
            </label>

            {form.ambito === "TEAM" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>Quale squadra</span>
                <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  <option value="">— scegli —</option>
                  {team.map((t) => (<option key={t.id} value={t.id}>{t.nome}</option>))}
                </select>
              </label>
            )}

            {form.ambito === "PERSONA" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>Quale persona</span>
                <select
                  value={form.dipendenteId}
                  onChange={(e) => setForm({ ...form, dipendenteId: e.target.value })}
                >
                  <option value="">— scegli —</option>
                  {persone.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
                </select>
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Su cosa si misura</span>
              <select
                value={form.obiettivoTipo}
                onChange={(e) => setForm({ ...form, obiettivoTipo: e.target.value, obiettivoRif: "" })}
              >
                {OBIETTIVI.map((o) => (<option key={o.key} value={o.key}>{o.nome}</option>))}
              </select>
            </label>

            {obiettivo.serveRif && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {form.obiettivoTipo === "VENDITE_MAISON" ? "Quale brand" : "Quale linea"}
                </span>
                <select
                  value={form.obiettivoRif}
                  onChange={(e) => setForm({ ...form, obiettivoRif: e.target.value })}
                >
                  <option value="">— scegli —</option>
                  {(form.obiettivoTipo === "VENDITE_MAISON"
                    ? maisons.map((m) => ({ id: m.slug, nome: m.nome }))
                    : linee
                  ).map((o) => (<option key={o.id} value={o.id}>{o.nome}</option>))}
                </select>
              </label>
            )}

            {form.obiettivoTipo !== "MANUALE" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>Risultato da superare (€)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.soglia}
                  placeholder="100.000"
                  onChange={(e) => setForm({ ...form, soglia: e.target.value })}
                />
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Dal mese</span>
              <select value={form.dal} onChange={(e) => setForm({ ...form, dal: Number(e.target.value) })}>
                {MESI.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Al mese</span>
              <select value={form.al} onChange={(e) => setForm({ ...form, al: Number(e.target.value) })}>
                {MESI.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Premio in denaro (€) — 0 = solo obiettivo</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.importo}
                placeholder="2.000, oppure 0"
                onChange={(e) => setForm({ ...form, importo: e.target.value })}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Nota (facoltativa)</span>
              <input
                type="text"
                value={form.note}
                placeholder="condizioni, chi lo ha concordato…"
                maxLength={200}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
          </div>

          {form.obiettivoTipo === "MANUALE" && (
            <p className="page-caption" style={{ marginTop: 10 }}>
              ⚠️ <strong>Questo premio l&apos;app non lo sa misurare</strong>: resterà sempre «da
              riconoscere», e sarà una persona a dire se è stato raggiunto. È giusto per gli obiettivi che
              i dati non vedono — meglio dichiararlo che far finta di calcolarlo.
            </p>
          )}

          {errore && (
            <p className="page-caption" style={{ marginTop: 10, color: "var(--red)" }}>
              <strong>{errore}</strong>
            </p>
          )}

          <div className="form-footer">
            <button className="btn secondary" onClick={() => { setApertoNuovo(false); setInModifica(null); }}>
              Annulla
            </button>
            <button className="btn primary" onClick={salva} disabled={salvo}>
              {salvo ? "Salvo…" : inModifica ? "Salva le modifiche" : "Crea il premio"}
            </button>
          </div>
        </div>
      )}

      {premi.length === 0 && !apertoNuovo && (
        <div className="card">
          <p className="page-caption" style={{ margin: 0 }}>
            Nessun target scritto per il {year}. <strong>Il budget di una persona si inserisce da
            qui</strong>: «+ Nuovo target o premio», ambito <strong>«Una persona»</strong>, l&apos;obiettivo
            su cui si misura (le vendite di una linea, di un brand, l&apos;EBITDA) con la soglia e il
            periodo — e un premio in denaro se c&apos;è, <strong>0 se è solo un obiettivo</strong>. La via
            più corta: il bottone <strong>«Obiettivo →»</strong> accanto a ogni persona nella pagina{" "}
            <a href="/team" style={{ color: "var(--blue)" }}>Team</a>, che arriva qui col modulo già
            compilato. Finché non ce ne sono, la riga «Premi» del conto economico vale zero.
          </p>
        </div>
      )}

      {perAmbito.map((a) => (
        <div key={a.key}>
          <h2 className="section-title">{a.nome}</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Premio</th>
                    {a.key !== "AZIENDA" && <th>A chi</th>}
                    <th>Obiettivo</th>
                    <th className="num">Soglia</th>
                    <th className="num">Risultato</th>
                    <th className="num">Importo</th>
                    <th>Stato</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {a.righe.map((p) => {
                    const o = OBIETTIVI.find((x) => x.key === p.obiettivoTipo);
                    const periodo =
                      p.dal === 1 && p.al === 12 ? "tutto l'anno" : `${MESI[p.dal - 1]}–${MESI[p.al - 1]}`;
                    return (
                      <tr key={p.id} style={{ opacity: p.costa ? 1 : 0.75 }}>
                        <td style={{ fontWeight: 500 }}>
                          {p.nome}
                          {p.note && (
                            <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{p.note}</div>
                          )}
                        </td>
                        {a.key !== "AZIENDA" && <td>{p.destinatario}</td>}
                        <td>
                          {o?.nome ?? p.obiettivoTipo}
                          <div className="muted" style={{ fontSize: 11 }}>{periodo}</div>
                        </td>
                        <td className="num muted">
                          {p.obiettivoTipo === "MANUALE" ? "—" : eur(p.soglia)}
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {p.risultato === null ? <span className="muted">—</span> : eur(p.risultato)}
                          {p.risultato !== null && p.soglia !== 0 && (
                            <div className={`scost ${p.risultato >= p.soglia ? "pos" : "neg"}`}>
                              {p.risultato >= p.soglia ? "+" : "−"}
                              {eur(Math.abs(p.risultato - p.soglia))}
                            </div>
                          )}
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {p.importo > 0 ? eur(p.importo) : <span className="muted">solo obiettivo</span>}
                        </td>
                        <td>
                          {/* Tre stati, non due: «raggiunto», «non ancora» e
                              «lo dice una persona». Schiacciarli in un sì/no
                              farebbe sparire proprio la differenza fra un dato
                              e una decisione. */}
                          {p.riconosciuto !== null ? (
                            <span className={`badge ${p.riconosciuto ? "green" : "neutral"}`}>
                              <span className="dot" />
                              {p.riconosciuto ? "riconosciuto a mano" : "negato a mano"}
                            </span>
                          ) : p.raggiunto === null ? (
                            <span className="badge neutral"><span className="dot" />da riconoscere</span>
                          ) : p.raggiunto ? (
                            <span className="badge green"><span className="dot" />raggiunto</span>
                          ) : (
                            <span className="badge orange"><span className="dot" />non ancora</span>
                          )}
                        </td>
                        <td className="num" style={{ whiteSpace: "nowrap" }}>
                          <button
                            className="btn secondary small"
                            onClick={() => riconosci(p, p.riconosciuto === true ? null : true)}
                            disabled={lavoro === p.id}
                            title={
                              p.riconosciuto === true
                                ? "Torna a decidere in base alla misura."
                                : "Paga questo premio comunque, anche se la misura non lo fa scattare."
                            }
                          >
                            {p.riconosciuto === true ? "Annulla" : "Riconosci"}
                          </button>{" "}
                          <button
                            className="btn secondary small"
                            onClick={() => apriModifica(p)}
                            disabled={lavoro === p.id}
                          >
                            Modifica
                          </button>{" "}
                          <button
                            className="btn secondary small"
                            onClick={() => elimina(p)}
                            disabled={lavoro === p.id}
                          >
                            Elimina
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      {premi.length > 0 && (
        <p className="page-caption" style={{ marginTop: 14 }}>
          Il <strong>risultato</strong> è misurato sullo scenario <strong>{livello.toLowerCase()}</strong>,
          lo stesso che stai guardando: cambiandolo cambiano i risultati e quindi quali premi scattano — nel
          budget sfidante le vendite sono più alte, e più premi si pagano. Nel conto economico entra{" "}
          <strong>solo quello che scatta</strong>: provisionare anche i premi mancati gonfierebbe un costo
          che nessuno sosterrà, ignorarli tutti nasconderebbe quello che invece si pagherà.
        </p>
      )}
    </>
  );
}
