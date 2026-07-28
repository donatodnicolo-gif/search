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

export function ChiaviEditor({
  righe,
  cifraturaOk,
  segreto,
}: {
  righe: Riga[];
  cifraturaOk: boolean;
  segreto: string | null;
}) {
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
      {!cifraturaOk ? (
        <div className="card" style={{ borderColor: "var(--red)", marginBottom: 14 }}>
          <strong>Nessun segreto per cifrare.</strong> Le chiavi non si scrivono mai in chiaro su un database
          condiviso: senza un segreto d&apos;ambiente da cui derivare la cifratura, salvarle da qui è
          disabilitato. Aggiungi <code>APP_SECRET</code> alle variabili d&apos;ambiente dell&apos;app e ricarica.
        </div>
      ) : (
        <p className="page-caption" style={{ marginTop: 0, marginBottom: 12 }}>
          Le chiavi salvate qui sono cifrate con <code>{segreto}</code>.{" "}
          {segreto !== "APP_SECRET" && (
            <>
              È un <strong>ripiego</strong>: <code>APP_SECRET</code> non è impostata su questo ambiente, quindi
              si usa un segreto che c&apos;è già.{" "}
            </>
          )}
          Se quel segreto cambia, le chiavi già salvate <strong>non si decifrano più</strong>: non si rompe
          niente, risultano «non impostate» e vanno reincollate. Vale anche il contrario — aggiungere{" "}
          <code>APP_SECRET</code> dove ora non c&apos;è sposta la cifratura su di lei, e le chiavi di prima
          vanno riscritte.
        </p>
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
