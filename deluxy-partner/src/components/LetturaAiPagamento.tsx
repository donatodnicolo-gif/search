"use client";

import { useState } from "react";

// «Leggi con l'AI»: si incolla il messaggio del fornitore (o si carica lo
// screenshot) e i campi del modulo qui sotto si riempiono da soli — PROPOSTI,
// mai salvati: chi registra è la persona, dopo averli riletti.
//
// I campi del modulo sono controllati da React (SceltaBeneficiario): per
// riempirli da fuori si usa il setter nativo + l'evento `input`, che è il modo
// con cui React accetta un valore scritto da un altro componente.

function scriviCampo(nome: string, valore: string) {
  const el = document.querySelector<HTMLInputElement>(`form input[name="${nome}"]`);
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, valore);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

type Estratto = {
  dati?: { iban: string; intestatario: string; importo: number; valuta: string; causale: string };
  ibanValido?: boolean;
  fornitore?: string;
  errore?: string;
};

export function LetturaAiPagamento() {
  const [testo, setTesto] = useState("");
  const [immagine, setImmagine] = useState<{ dati: string; tipo: string; nome: string } | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState("");

  async function scegliFile(file: File | null) {
    if (!file) return setImmagine(null);
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    setImmagine({ dati: base64, tipo: file.type || "image/png", nome: file.name });
  }

  async function leggi() {
    setInCorso(true);
    setEsito("");
    try {
      const res = await fetch("/api/estrai-pagamento", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          testo: testo.trim() || undefined,
          immagine: immagine ? { dati: immagine.dati, tipo: immagine.tipo } : undefined,
        }),
      });
      const r = (await res.json()) as Estratto;
      if (!res.ok || r.errore) {
        setEsito(r.errore ?? `Errore ${res.status}.`);
        return;
      }
      if (r.dati) {
        if (r.dati.intestatario) scriviCampo("beneficiario", r.dati.intestatario);
        if (r.dati.iban) scriviCampo("iban", r.dati.iban);
        if (r.dati.importo > 0) scriviCampo("importo", r.dati.importo.toFixed(2).replace(".", ","));
        if (r.dati.causale) scriviCampo("causale", r.dati.causale);
        setEsito(
          `Letto con ${r.fornitore}. ${
            r.dati.iban ? (r.ibanValido ? "IBAN verificato (checksum ok)." : "⚠️ L'IBAN letto NON passa il checksum: ricontrollalo.") : "Nessun IBAN nel contenuto."
          } Rileggi i campi prima di inviare.`
        );
      }
    } catch {
      setEsito("Lettura non riuscita: compila a mano.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <strong style={{ fontSize: 13.5 }}>Leggi con l&rsquo;AI (facoltativo)</strong>
      <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>
        Incolla il messaggio del fornitore con IBAN e importo, o carica lo screenshot: i campi del modulo si riempiono
        da soli — li rileggi tu prima di inviare.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          rows={3}
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="…il messaggio con le coordinate…"
          style={{ width: "100%", resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => scegliFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn small" onClick={leggi} disabled={inCorso || (!testo.trim() && !immagine)}>
            {inCorso ? "Leggo…" : "Leggi e riempi i campi"}
          </button>
        </div>
        {esito && <span className="muted" style={{ fontSize: 12.5 }}>{esito}</span>}
      </div>
    </div>
  );
}
