"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DecisioneProposta({
  id,
  stato,
  ambitoTipo,
  consolidataSu,
  tipologie,
}: {
  id: string;
  stato: string;
  ambitoTipo: string;
  consolidataSu: string | null;
  // Le voci di budget su cui si può far atterrare una proposta di maison.
  tipologie: { slug: string; nome: string }[];
}) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [canale, setCanale] = useState(tipologie[0]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  async function decidi(nuovo: string) {
    setBusy(true);
    setErrore(null);
    setFatto(null);
    const res = await fetch("/api/proposte/decisione", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stato: nuovo, notaAdmin: nota }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Non riuscito.");
      return;
    }
    router.refresh();
  }

  async function consolida() {
    if (!confirm("Scrivere questi dodici valori nel budget ufficiale? Sovrascrive quello che c'è adesso.")) return;
    setBusy(true);
    setErrore(null);
    setFatto(null);
    const res = await fetch("/api/proposte/decisione", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, canale }),
    });
    setBusy(false);
    const b = await res.json().catch(() => null);
    if (!res.ok) {
      setErrore(b?.error ?? "Consolidamento non riuscito.");
      return;
    }
    setFatto(`Budget aggiornato su ${b.dove}.`);
    router.refresh();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Risposta dell&apos;admin</h3>
      <p className="page-caption" style={{ marginTop: 0 }}>
        <strong>Approvare</strong> vuol dire «ho letto, va bene». <strong>Consolidare</strong> è un secondo gesto e
        riscrive davvero i numeri del budget pubblicato: sono separati perché una proposta si può approvare e
        applicare in parte, più tardi, o mai.
      </p>

      {errore && <div className="avviso-errore" style={{ marginBottom: 10 }}>{errore}</div>}
      {fatto && <div className="card" style={{ borderColor: "var(--green)", marginBottom: 10 }}>{fatto}</div>}

      <label style={{ display: "grid", gap: 4, fontSize: 12.5, marginBottom: 10 }}>
        Nota per chi l&apos;ha scritta (obbligatoria se respingi)
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="es. rivedi il secondo semestre, i mesi di punta sono sottostimati"
          style={{ width: "100%", padding: "7px 9px" }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn" disabled={busy || stato === "APPROVATA"} onClick={() => decidi("APPROVATA")}>
          Approva
        </button>
        <button
          className="btn secondary"
          style={{ color: "var(--red)" }}
          disabled={busy || stato === "RESPINTA"}
          onClick={() => decidi("RESPINTA")}
        >
          Respingi
        </button>
        {stato !== "INVIATA" && (
          <button className="btn secondary" disabled={busy} onClick={() => decidi("INVIATA")}>
            Rimetti in attesa
          </button>
        )}
      </div>

      {stato === "APPROVATA" && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hairline, rgba(0,0,0,.08))" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            {ambitoTipo === "MAISON" && (
              <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
                Voce di budget su cui applicarla
                <select value={canale} onChange={(e) => setCanale(e.target.value)}>
                  {tipologie.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.nome}</option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn" disabled={busy} onClick={consolida}>
              {busy ? "Scrivo…" : "Consolida nel budget"}
            </button>
          </div>
          {consolidataSu && (
            <p className="page-caption" style={{ marginTop: 8, marginBottom: 0 }}>
              Già consolidata su <strong>{consolidataSu}</strong>: rifarlo sovrascrive di nuovo.
            </p>
          )}
          {ambitoTipo === "MAISON" && (
            <p className="page-caption" style={{ marginTop: 8, marginBottom: 0 }}>
              Una proposta per maison non dice se è D2C, Eventi o B2B: la voce la sceglie chi approva, perché è
              un&apos;informazione che nella proposta non c&apos;è e indovinarla scriverebbe numeri nel posto sbagliato.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
