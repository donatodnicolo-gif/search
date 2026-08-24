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
  const [aperto, setAperto] = useState(false);

  function apri() {
    const url = `https://wa.me/${telefono.replace(/\D/g, "")}?text=${encodeURIComponent(testo)}`;
    window.open(url, "_blank", "noopener");
    setAperto(true);
    void registraWaMe({ chiaveCliente, nomeCliente, telefono, testo, listaId });
  }

  return (
    <button className={`btn ghost${mini ? " mini" : ""}`} type="button" onClick={apri}>
      {aperto ? "Aperta ✓ (riapri)" : etichetta}
    </button>
  );
}
