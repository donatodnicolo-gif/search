"use client";

import { useState } from "react";

// La foto del cliente si RIDUCE NEL BROWSER prima di partire: un file da 4 MB
// del telefono diventa un JPEG di 512 px (qualche decina di KB), che viaggia
// nel form come data URL in un campo nascosto e finisce nel database
// (Bytes, tetto 600 KB lato server). Niente storage esterno da configurare,
// niente dipendenze: un canvas e basta.
//
// ⚠️ Il campo `foto` (file) NON si manda: il form porta solo `fotoDati`.

const LATO_MAX = 512;

export default function FotoInput({ fotoAttuale }: { fotoAttuale: string | null }) {
  const [anteprima, setAnteprima] = useState<string | null>(fotoAttuale);
  const [dati, setDati] = useState("");
  const [rimuovi, setRimuovi] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function scelta(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrore("Serve un'immagine (JPG, PNG, HEIC convertito…).");
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((ok, ko) => {
        img.onload = () => ok();
        img.onerror = () => ko(new Error("immagine non leggibile"));
        img.src = url;
      });
      const scala = Math.min(1, LATO_MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scala);
      canvas.height = Math.round(img.height * scala);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const ridotta = canvas.toDataURL("image/jpeg", 0.85);
      setDati(ridotta);
      setAnteprima(ridotta);
      setRimuovi(false);
      setErrore(null);
    } catch {
      setErrore("Questa immagine non si è potuta leggere: prova con un JPG o un PNG.");
    }
  }

  return (
    <div className="campo">
      <label>Foto</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div className="foto-cliente grande" aria-hidden>
          {anteprima && !rimuovi ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={anteprima} alt="" />
          ) : (
            <span className="terziario piccolo">nessuna</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="file" accept="image/*" onChange={scelta} style={{ fontSize: 13 }} />
          {anteprima && !rimuovi ? (
            <button
              type="button"
              className="link-quieto"
              style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", fontSize: 13 }}
              onClick={() => {
                setRimuovi(true);
                setDati("");
              }}
            >
              Togli la foto
            </button>
          ) : null}
        </div>
      </div>
      <input type="hidden" name="fotoDati" value={dati} />
      <input type="hidden" name="rimuoviFoto" value={rimuovi ? "1" : ""} />
      {errore ? <span style={{ color: "var(--red)", fontSize: 12 }}>{errore}</span> : null}
      <span className="aiuto">Si riduce a 512 px prima di partire: va bene anche una foto dal telefono.</span>
    </div>
  );
}
