"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Riga = {
  nome: string;
  label: string;
  serve: string;
  origine: "ambiente" | "app" | "hub" | "assente";
  anteprima: string | null;
};

const ORIGINE: Record<Riga["origine"], { label: string; badge: string }> = {
  ambiente: { label: "variabile d'ambiente", badge: "blue" },
  app: { label: "impostata qui", badge: "green" },
  hub: { label: "cassaforte del Hub", badge: "gold" },
  assente: { label: "non impostata", badge: "neutral" },
};

export function ChiaviEditor({ righe, cifraturaOk }: { righe: Riga[]; cifraturaOk: boolean }) {
  const router = useRouter();
  const [valori, setValori] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function salva(nome: string) {
    const valore = (valori[nome] ?? "").trim();
    if (!valore) return;
    setBusy(nome);
    setErrore(null);
    setOk(null);
    const res = await fetch("/api/chiavi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, valore }),
    });
    setBusy(null);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Salvataggio non riuscito.");
      return;
    }
    // Il valore sparisce dal campo appena salvato: non resta a schermo.
    setValori((v) => ({ ...v, [nome]: "" }));
    setOk(`${nome} salvata.`);
    router.refresh();
  }

  async function rimuovi(nome: string) {
    if (!confirm(`Rimuovere ${nome}? Le funzioni che la usano si spengono.`)) return;
    setBusy(nome);
    await fetch(`/api/chiavi?nome=${encodeURIComponent(nome)}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  return (
    <>
      {!cifraturaOk && (
        <div className="card" style={{ borderColor: "var(--red)", marginBottom: 14 }}>
          <strong>APP_SECRET non configurata.</strong> È il segreto con cui si cifrano le chiavi prima di
          scriverle nel database: senza, salvarle da qui è disabilitato — una chiave in chiaro su un database
          condiviso non è una cosa da fare di nascosto. Aggiungi <code>APP_SECRET</code> alle variabili
          d&apos;ambiente dell&apos;app e ricarica.
        </div>
      )}
      {errore && <div className="avviso-errore" style={{ marginBottom: 12 }}>{errore}</div>}
      {ok && <div className="card" style={{ marginBottom: 12, borderColor: "var(--green)" }}>{ok}</div>}

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chiave</th>
                <th>Da dove arriva</th>
                <th>Nuovo valore</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.nome}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.label}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      <code>{r.nome}</code> · {r.serve}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className={`badge ${ORIGINE[r.origine].badge}`}>
                      <span className="dot" />
                      {ORIGINE[r.origine].label}
                    </span>
                    {r.anteprima && (
                      <div className="muted" style={{ fontSize: 11.5 }}>{r.anteprima}</div>
                    )}
                  </td>
                  <td>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={r.origine === "assente" ? "incolla la chiave" : "sostituisci"}
                      value={valori[r.nome] ?? ""}
                      disabled={!cifraturaOk || busy === r.nome}
                      onChange={(e) => setValori((v) => ({ ...v, [r.nome]: e.target.value }))}
                      style={{ width: "100%", minWidth: 220, padding: "6px 8px" }}
                    />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn"
                      disabled={!cifraturaOk || busy === r.nome || !(valori[r.nome] ?? "").trim()}
                      onClick={() => salva(r.nome)}
                    >
                      {busy === r.nome ? "Salvo…" : "Salva"}
                    </button>
                    {r.origine === "app" && (
                      <button
                        className="btn secondary small"
                        style={{ marginLeft: 6, color: "var(--red)" }}
                        onClick={() => rimuovi(r.nome)}
                      >
                        Rimuovi
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
