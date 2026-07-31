"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";

type Opzione = { slug: string; nome: string };

export function PropostaForm({
  year,
  maisons,
  linee,
  consuntivoMese = [],
}: {
  year: number;
  maisons: Opzione[];
  linee: Opzione[];
  // Ricavi reali dei mesi già chiusi: dove c'è un numero, quel mese non si
  // propone più.
  consuntivoMese?: (number | null)[];
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
          <div className="mese-cell" key={m} style={typeof consuntivoMese[i] === "number" ? { opacity: 0.75 } : undefined}>
            <div className="k">
              {m} {year}
              {typeof consuntivoMese[i] === "number" && (
                <span className="muted" style={{ fontSize: 10.5, marginLeft: 4 }}>consuntivo</span>
              )}
            </div>
            {/* Un mese già passato non si propone: si legge. La casella resta
                visibile — toglierla farebbe perdere il confronto con i mesi che
                restano — ma mostra il ricavo vero e non si può scrivere. */}
            {typeof consuntivoMese[i] === "number" ? (
              <div
                style={{ padding: "9px 0", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                title="Mese già chiuso: questo è il ricavo reale, non una proposta"
              >
                {eur(consuntivoMese[i] ?? 0)}
              </div>
            ) : (
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
            )}
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
