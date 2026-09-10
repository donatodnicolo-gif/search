"use client";

import { useState } from "react";
import { registraWaMe } from "@/lib/actions";

// Il canale assistito: la chat si apre sul WhatsApp DELL'OPERATORE col testo
// già scritto (wa.me). Nessuna finestra 24h di mezzo — manda una persona dal
// suo telefono — e il clic resta registrato come «preparato».

export default function WaAssistito({
  chiaveCliente,
  nomeCliente,
  telefono,
  testo,
  listaId,
  etichetta = "Apri su WhatsApp",
  mini = false,
}: {
  chiaveCliente: string;
  nomeCliente: string;
  telefono: string; // già normalizzato (+39…)
  testo: string;
  listaId?: string;
  etichetta?: string;
  mini?: boolean;
}) {
  const [stato, setStato] = useState<"" | "aperta" | "bloccata" | "non-registrata">("");

  async function apri() {
    const url = `https://wa.me/${telefono.replace(/\D/g, "")}?text=${encodeURIComponent(testo)}`;
    // ⚠️ `window.open` torna null col blocco dei popup: prima il bottone
    // diceva «Aperta ✓» anche allora (segnalazione UX 28/08, confermata 10/09).
    const finestra = window.open(url, "_blank", "noopener");
    if (!finestra) {
      setStato("bloccata");
      return;
    }
    setStato("aperta");
    try {
      const r = await registraWaMe({ chiaveCliente, nomeCliente, telefono, testo, listaId });
      if (!r.ok) setStato("non-registrata");
    } catch {
      setStato("non-registrata");
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button className={`btn ghost${mini ? " mini" : ""}`} type="button" onClick={apri}>
        {stato === "aperta" ? "Aperta ✓ (riapri)" : stato === "non-registrata" ? "Aperta, non registrata (riapri)" : etichetta}
      </button>
      {stato === "bloccata" ? (
        <span className="piccolo" style={{ color: "var(--orange)" }} role="alert">
          Il browser ha bloccato la finestra: consenti i popup e riprova.
        </span>
      ) : null}
      {stato === "non-registrata" ? (
        <span className="piccolo" style={{ color: "var(--orange)" }} role="alert">
          La chat si è aperta ma il diario non l&apos;ha registrata.
        </span>
      ) : null}
    </span>
  );
}
