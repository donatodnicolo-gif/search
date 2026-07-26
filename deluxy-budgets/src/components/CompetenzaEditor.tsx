"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

type Voce = { tipo: "USCITA" | "RICAVO"; nome: string; perMese: number[] };
type Rettifica = {
  id: string;
  tipo: "USCITA" | "RICAVO";
  voce: string;
  annoOrigine: number;
  meseOrigine: number;
  annoCompetenza: number;
  meseCompetenza: number;
  importo: number;
  nota: string | null;
  categoria: string | null;
};

export function CompetenzaEditor({
  anno,
  voci,
  rettifiche,
}: {
  anno: number;
  voci: Voce[];
  rettifiche: Rettifica[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"USCITA" | "RICAVO">("USCITA");
  const [voce, setVoce] = useState("");
  const [meseOrigine, setMeseOrigine] = useState(1);
  const [annoCompetenza, setAnnoCompetenza] = useState(anno - 1);
  const [meseCompetenza, setMeseCompetenza] = useState(12);
  const [importo, setImporto] = useState("");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const vociTipo = useMemo(() => voci.filter((v) => v.tipo === tipo), [voci, tipo]);
  const scelta = vociTipo.find((v) => v.nome === voce);
  // L'importo si propone da solo: è quello che quella voce ha in quel mese.
  // Resta modificabile, perché una controparte può avere in un mese sia costi
  // dell'anno prima sia costi dell'anno giusto.
  const suggerito = scelta ? scelta.perMese[meseOrigine - 1] ?? 0 : 0;

  async function salva() {
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/competenza", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo, voce, annoOrigine: anno, meseOrigine, annoCompetenza, meseCompetenza,
        importo: Number((importo || String(suggerito)).replace(",", ".")),
        nota,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Salvataggio non riuscito.");
      return;
    }
    setVoce("");
    setImporto("");
    setNota("");
    router.refresh();
  }

  async function elimina(id: string) {
    if (!confirm("Togliere questa rettifica? L'importo torna nell'anno in cui è successo il movimento.")) return;
    setBusy(true);
    await fetch(`/api/competenza?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  const ANNI = [anno - 2, anno - 1, anno, anno + 1];

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Sposta un importo su un altro esercizio</h3>
        {errore && <div className="avviso-errore" style={{ marginBottom: 10 }}>{errore}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
            Tipo
            <select value={tipo} onChange={(e) => { setTipo(e.target.value as "USCITA" | "RICAVO"); setVoce(""); }}>
              <option value="USCITA">Uscita</option>
              <option value="RICAVO">Ricavo</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5, minWidth: 260 }}>
            Voce ({tipo === "USCITA" ? "controparte di banca" : "tipologia fatturata"})
            <select value={voce} onChange={(e) => { setVoce(e.target.value); setImporto(""); }}>
              <option value="">— scegli —</option>
              {vociTipo.map((v) => (
                <option key={v.nome} value={v.nome}>{v.nome}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
            Mese in cui risulta ({anno})
            <select value={meseOrigine} onChange={(e) => { setMeseOrigine(Number(e.target.value)); setImporto(""); }}>
              {MESI.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                  {scelta ? ` · ${eur(scelta.perMese[i] ?? 0)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
            Importo da spostare
            <input
              value={importo}
              placeholder={scelta ? String(Math.round(suggerito * 100) / 100) : "0"}
              onChange={(e) => setImporto(e.target.value)}
              style={{ width: 130, padding: "6px 8px" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
            Competenza: anno
            <select value={annoCompetenza} onChange={(e) => setAnnoCompetenza(Number(e.target.value))}>
              {ANNI.map((y) => (<option key={y} value={y}>{y}</option>))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
            e mese
            <select value={meseCompetenza} onChange={(e) => setMeseCompetenza(Number(e.target.value))}>
              {MESI.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5, flex: 1, minWidth: 180 }}>
            Perché (facoltativo)
            <input value={nota} onChange={(e) => setNota(e.target.value)} style={{ padding: "6px 8px" }} />
          </label>
          <button className="btn" disabled={busy || !voce} onClick={salva}>
            {busy ? "Salvo…" : "Sposta"}
          </button>
        </div>
        {scelta && (
          <p className="page-caption" style={{ marginTop: 10, marginBottom: 0 }}>
            «{scelta.nome}» in {MESI[meseOrigine - 1]} {anno} vale <strong>{eur(suggerito)}</strong>. Lasciando
            vuoto l&apos;importo si sposta tutto; scrivendone uno minore si sposta solo quella parte e il resto
            resta dov&apos;è.
          </p>
        )}
      </div>

      <h2 className="section-title">Rettifiche in vigore</h2>
      {rettifiche.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">◎</div>
          <div className="empty-title">Nessuna rettifica</div>
          <div className="empty-text">
            Ogni importo è letto nell&apos;anno in cui il movimento è successo. Finché è così, competenza e cassa
            coincidono.
          </div>
        </div>
      ) : (
        <div className="card tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Voce</th>
                  <th>Dove risulta</th>
                  <th>Dove va letto</th>
                  <th className="num">Importo</th>
                  <th>Perché</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rettifiche.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.voce}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {r.tipo === "USCITA" ? "uscita" : "ricavo"}
                        {r.tipo === "USCITA" && (
                          <> · {r.categoria ? r.categoria : <span style={{ color: "var(--red)" }}>senza categoria: non entra nel P&amp;L</span>}</>
                        )}
                      </div>
                    </td>
                    <td className="muted">{MESI[r.meseOrigine - 1]} {r.annoOrigine}</td>
                    <td style={{ fontWeight: 600 }}>{MESI[r.meseCompetenza - 1]} {r.annoCompetenza}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(r.importo)}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{r.nota ?? "—"}</td>
                    <td>
                      <button className="btn secondary small" style={{ color: "var(--red)" }} disabled={busy} onClick={() => elimina(r.id)}>
                        Togli
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
