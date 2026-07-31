"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI } from "@/lib/format";
// Solo il tipo: `import type` sparisce in compilazione, quindi il client non si
// tira dietro la catena che parla con Finance e Orders.
import type { ConsuntivoAmbiti } from "@/lib/proposta-consuntivo";

type Opzione = { slug: string; nome: string };

export function PropostaForm({
  year,
  maisons,
  linee,
  ambiti = {},
  mesiChiusi = [],
}: {
  year: number;
  maisons: Opzione[];
  linee: Opzione[];
  // Consuntivo dei mesi chiusi **per ambito**: azienda, ogni maison, ogni
  // linea. Il calcolo è sul server; qui si legge la casella dell'ambito scelto.
  ambiti?: ConsuntivoAmbiti;
  // I mesi già passati. Bloccati sempre — anche dove il consuntivo non esiste:
  // il motivo per cui non si propongono è che sono successi, non che c'è un
  // numero da mostrare al loro posto.
  mesiChiusi?: number[];
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
  // Il consuntivo dell'ambito scelto. Cambiando la tendina cambia il numero
  // letto e cambia la riga che dice **che cosa** è quel numero: il venduto
  // ecommerce di una maison e i ricavi di tutta l'azienda si somigliano solo
  // finché nessuno dichiara quale dei due si sta guardando.
  const info = ambiti[ambito];
  const consuntivoMese = info?.mesi ?? [];
  const chiuso = (i: number) => mesiChiusi.includes(i + 1);

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
      {/* Che cosa mostrano i mesi chiusi, per questo ambito — o perché non
          mostrano niente. Sta sopra la griglia perché è la cosa da leggere
          prima dei numeri, non dopo. */}
      {info?.nota && (
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px", maxWidth: 760, lineHeight: 1.5 }}>
          {info.nota}
        </p>
      )}
      <div className="mesi-grid">
        {MESI.map((m, i) => (
          <div className="mese-cell" key={m} style={chiuso(i) ? { opacity: 0.75 } : undefined}>
            <div className="k">
              {m} {year}
              {chiuso(i) && info?.etichetta && (
                <span className="muted" style={{ fontSize: 10.5, marginLeft: 4 }}>{info.etichetta}</span>
              )}
            </div>
            {/* Un mese già passato non si propone: si legge. La casella resta
                visibile — toglierla farebbe perdere il confronto con i mesi che
                restano — ma mostra il dato vero e non si può scrivere. Dove il
                dato per quell'ambito non esiste resta un trattino: vuoto, non
                zero, e la riga sopra dice perché. */}
            {chiuso(i) ? (
              <div
                style={{ padding: "9px 0", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                title={
                  typeof consuntivoMese[i] === "number"
                    ? "Mese già chiuso: questo è il dato reale, non una proposta"
                    : "Mese già chiuso: non si propone, e per questo ambito non c'è un consuntivo da leggere"
                }
              >
                {typeof consuntivoMese[i] === "number" ? eur(consuntivoMese[i] ?? 0) : <span className="muted">—</span>}
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
          Totale proposto
          {mesiChiusi.length > 0 && mesiChiusi.length < 12 && ` (${MESI[mesiChiusi.length]}–${MESI[11]})`}:{" "}
          <strong style={{ color: "var(--text)" }}>{eur(totale)}</strong>
        </span>
        <button className="btn primary" onClick={invia} disabled={invio}>
          {invio ? "Invio…" : "Invia proposta"}
        </button>
      </div>
    </div>
  );
}
