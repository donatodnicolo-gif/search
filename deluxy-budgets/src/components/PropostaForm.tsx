"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

type Opzione = { slug: string; nome: string };

export function PropostaForm({
  year,
  maisons,
  linee,
}: {
  year: number;
  maisons: Opzione[];
  linee: Opzione[];
}) {
  const router = useRouter();
  const [autore, setAutore] = useState("");
  const [ruolo, setRuolo] = useState("Responsabile");
  const [ambito, setAmbito] = useState("GLOBALE"); // "GLOBALE" | "MAISON:slug" | "LINEA:slug"
  const [valori, setValori] = useState<number[]>(Array(12).fill(0));
  const [note, setNote] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const totale = valori.reduce((s, v) => s + (v || 0), 0);

  async function invia() {
    if (!autore.trim()) {
      setErrore("Indicare il nome dell'autore.");
      return;
    }
    setInvio(true);
    setErrore(null);
    const [ambitoTipo, ambitoSlug] = ambito === "GLOBALE" ? ["GLOBALE", null] : ambito.split(":");
    const res = await fetch("/api/proposte", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        autore: autore.trim(),
        ruolo,
        ambitoTipo,
        ambitoSlug,
        note: note.trim() || null,
        valori: valori.map((valore, i) => ({ month: i + 1, valore: valore || 0 })),
      }),
    });
    setInvio(false);
    if (!res.ok) {
      setErrore("Invio non riuscito, riprovare.");
      return;
    }
    router.push("/proposte");
    router.refresh();
  }

  return (
    <div className="card">
      <div className="form-grid">
        <div>
          <label className="field-label">Autore</label>
          <input type="text" value={autore} onChange={(e) => setAutore(e.target.value)} placeholder="Nome e cognome" />
        </div>
        <div>
          <label className="field-label">Ruolo</label>
          <select value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
            <option>Responsabile</option>
            <option>Commerciale</option>
            <option>Amministrazione</option>
          </select>
        </div>
        <div>
          <label className="field-label">Ambito della proposta</label>
          <select value={ambito} onChange={(e) => setAmbito(e.target.value)}>
            <option value="GLOBALE">Tutta l&apos;azienda</option>
            <optgroup label="Maison">
              {maisons.map((m) => (
                <option key={m.slug} value={`MAISON:${m.slug}`}>{m.nome}</option>
              ))}
            </optgroup>
            <optgroup label="Linee commerciali">
              {linee.map((l) => (
                <option key={l.slug} value={`LINEA:${l.slug}`}>{l.nome}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <h2 className="section-title">Vendite proposte per mese (€)</h2>
      <div className="mesi-grid">
        {MESI.map((m, i) => (
          <div className="mese-cell" key={m}>
            <div className="k">{m} {year}</div>
            <input
              type="number"
              min={0}
              step={100}
              value={valori[i] || ""}
              onChange={(e) => {
                const v = [...valori];
                v[i] = e.target.value === "" ? 0 : Number(e.target.value);
                setValori(v);
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <label className="field-label">Note (facoltative)</label>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ipotesi, condizioni, richieste di risorse…" />
      </div>

      <div className="form-footer">
        {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
        <span className="muted" style={{ fontSize: 13.5 }}>
          Totale proposto: <strong style={{ color: "var(--text)" }}>{eur(totale)}</strong>
        </span>
        <button className="btn primary" onClick={invia} disabled={invio}>
          {invio ? "Invio…" : "Invia proposta"}
        </button>
      </div>
    </div>
  );
}
