"use client";

import { useMemo, useState } from "react";

// Il riquadro «Usa questo testo»: si sceglie per quale app lo si vuole (la firma
// e il tono cambiano), si compilano al volo le variabili che nessuno può sapere
// in anticipo — il nome del cliente, la data — e si porta via il messaggio:
// copiato, aperto in WhatsApp o già dentro una nuova email.
// Quello che si scrive qui NON viene salvato: resta in questa pagina.

export type VersioneApp = {
  chiave: string;
  nome: string;
  canale: string;
  oggetto: string | null; // già composto coi valori dell'app
  corpo: string; // già composto coi valori dell'app
  daCompilare: { chiave: string; etichetta: string | null; tipo: string; opzioni: string[] }[];
};

function riempi(testo: string, valori: Record<string, string>): string {
  let out = testo;
  for (const [chiave, valore] of Object.entries(valori)) {
    if (valore) out = out.split(`{{${chiave}}}`).join(valore);
  }
  return out;
}

export function CopiaTesto({ versioni }: { versioni: VersioneApp[] }) {
  const [scelta, setScelta] = useState(versioni[0]?.chiave ?? "");
  const [valori, setValori] = useState<Record<string, string>>({});
  const [copiato, setCopiato] = useState("");

  const versione = versioni.find((v) => v.chiave === scelta) ?? versioni[0];

  const oggetto = useMemo(
    () => (versione?.oggetto ? riempi(versione.oggetto, valori) : null),
    [versione, valori],
  );
  const corpo = useMemo(() => (versione ? riempi(versione.corpo, valori) : ""), [versione, valori]);

  if (!versione) return null;

  const restano = versione.daCompilare.filter((v) => !valori[v.chiave]).map((v) => v.chiave);

  async function copia(cosa: "testo" | "oggetto") {
    try {
      await navigator.clipboard.writeText(cosa === "oggetto" ? (oggetto ?? "") : corpo);
      setCopiato(cosa);
      setTimeout(() => setCopiato(""), 2000);
    } catch {
      setCopiato("");
    }
  }

  // WhatsApp: wa.me apre l'app (o WhatsApp Web) con il messaggio già scritto, il
  // numero lo sceglie chi manda. Email: mailto porta oggetto e corpo nel client
  // di posta predefinito.
  const linkWhatsapp = `https://wa.me/?text=${encodeURIComponent(corpo)}`;
  const linkEmail = `mailto:?subject=${encodeURIComponent(oggetto ?? "")}&body=${encodeURIComponent(corpo)}`;

  return (
    <div className="scheda">
      <div className="copia-testa">
        <div className="scheda-titolo" style={{ margin: 0 }}>Usa questo testo</div>
        <div className="copia-scelte">
          <select value={scelta} onChange={(e) => setScelta(e.target.value)} aria-label="Per quale app">
            {versioni.map((v) => (
              <option key={v.chiave} value={v.chiave}>{v.nome}</option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => copia("testo")}>
            {copiato === "testo" ? "Copiato" : "Copia il testo"}
          </button>
          {(versione.canale === "whatsapp" || versione.canale === "sms") && (
            <a className="btn btn-secondario" href={linkWhatsapp} target="_blank" rel="noreferrer">
              Apri in WhatsApp
            </a>
          )}
          {versione.canale === "email" && (
            <a className="btn btn-secondario" href={linkEmail}>Scrivi l&apos;email</a>
          )}
        </div>
      </div>

      {versione.daCompilare.length > 0 && (
        <div className="valori-app" style={{ marginTop: 0, paddingTop: 0, borderTop: "none", marginBottom: 14 }}>
          {versione.daCompilare.map((v) => (
            <div className="valore-campo" key={v.chiave}>
              <label htmlFor={`c-${versione.chiave}-${v.chiave}`}>{v.chiave}</label>
              {v.tipo === "scelta" && v.opzioni.length > 0 ? (
                <select
                  id={`c-${versione.chiave}-${v.chiave}`}
                  value={valori[v.chiave] ?? ""}
                  onChange={(e) => setValori((s) => ({ ...s, [v.chiave]: e.target.value }))}
                >
                  <option value="">— scegli —</option>
                  {v.opzioni.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`c-${versione.chiave}-${v.chiave}`}
                  type={v.tipo === "data" ? "date" : v.tipo === "numero" ? "number" : "text"}
                  autoComplete="off"
                  placeholder={v.etichetta ?? "compila per questo invio"}
                  value={valori[v.chiave] ?? ""}
                  onChange={(e) => setValori((s) => ({ ...s, [v.chiave]: e.target.value }))}
                />
              )}
              {v.etichetta && <span className="campo-aiuto">{v.etichetta}</span>}
            </div>
          ))}
        </div>
      )}

      {restano.length > 0 && (
        <div className="avviso-attenzione">
          Da compilare prima di mandarlo: {restano.join(", ")} — nel testo si vedono ancora i segnaposto.
        </div>
      )}

      {oggetto != null && (
        <div className="oggetto-riga">
          <span className="oggetto-etichetta">Oggetto</span>
          <span className="oggetto-testo">{oggetto || "—"}</span>
          <button type="button" className="btn btn-secondario small" onClick={() => copia("oggetto")}>
            {copiato === "oggetto" ? "Copiato" : "Copia"}
          </button>
        </div>
      )}

      <pre className="messaggio">{corpo || "(testo vuoto)"}</pre>
    </div>
  );
}
