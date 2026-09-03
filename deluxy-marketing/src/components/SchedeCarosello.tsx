"use client";

import { useState } from "react";

// Le SCHEDE del carosello Meta: ogni scheda ha immagine, link (il prodotto),
// titolo e descrizione. Le immagini si caricano UNA ALLA VOLTA nella libreria
// dell'account (via /api/interno/meta/immagine, tetto piattaforma 4,5 MB a
// richiesta) e nel form viaggia solo il JSON con gli hash, nel campo nascosto
// `caroselloJson`. Da 2 a 10 schede, come vuole Meta.

type Scheda = {
  imageHash: string | null;
  nomeFile: string | null;
  url: string;
  titolo: string;
  descrizione: string;
  inCorso: boolean;
  errore: string | null;
};

const VUOTA: Scheda = { imageHash: null, nomeFile: null, url: "", titolo: "", descrizione: "", inCorso: false, errore: null };

export function SchedeCarosello({ brand }: { brand: string }) {
  const [schede, setSchede] = useState<Scheda[]>([{ ...VUOTA }, { ...VUOTA }]);

  const serializza = (prossime: Scheda[]) => {
    const campo = document.querySelector<HTMLInputElement>('form.modulo-creazione [name="caroselloJson"]');
    if (campo) {
      const pronte = prossime
        .filter((s) => s.imageHash && s.url.trim())
        .map((s) => ({ imageHash: s.imageHash, url: s.url.trim(), titolo: s.titolo.trim(), descrizione: s.descrizione.trim() }));
      campo.value = pronte.length > 0 ? JSON.stringify(pronte) : "";
    }
  };

  const aggiorna = (i: number, patch: Partial<Scheda>) => {
    setSchede((prima) => {
      const prossime = prima.map((s, j) => (j === i ? { ...s, ...patch } : s));
      serializza(prossime);
      return prossime;
    });
  };

  const carica = async (i: number, file: File) => {
    aggiorna(i, { inCorso: true, errore: null });
    try {
      const fd = new FormData();
      fd.append("brand", brand);
      fd.append("file", file);
      const r = await fetch("/api/interno/meta/immagine", { method: "POST", body: fd });
      const esito = (await r.json()) as { errore?: string; hash?: string };
      if (!r.ok || esito.errore || !esito.hash) throw new Error(esito.errore ?? `caricamento fallito (${r.status})`);
      aggiorna(i, { imageHash: esito.hash, nomeFile: file.name, inCorso: false });
    } catch (e) {
      aggiorna(i, { inCorso: false, errore: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {schede.map((s, i) => (
        <div
          key={i}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 12, borderRadius: 12, background: "var(--fill)" }}
        >
          <div className="campo-modulo" style={{ gridColumn: "1 / -1" }}>
            <label>Scheda {i + 1} — immagine {s.imageHash ? `✓ ${s.nomeFile}` : "(JPG/PNG/WebP, max 4 MB)"}</label>
            {!s.imageHash && (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={s.inCorso}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void carica(i, f);
                }}
              />
            )}
            {s.inCorso && <span className="campo-aiuto">Caricamento…</span>}
            {s.errore && <span className="campo-aiuto" style={{ color: "var(--red)" }}>⚠️ {s.errore}</span>}
            {s.imageHash && (
              <button type="button" className="link-come-testo" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={() => aggiorna(i, { imageHash: null, nomeFile: null })}>
                Cambia immagine
              </button>
            )}
          </div>
          <div className="campo-modulo" style={{ gridColumn: "1 / -1" }}>
            <label>Link del prodotto</label>
            <input type="url" placeholder="https://…/products/…" value={s.url} onChange={(e) => aggiorna(i, { url: e.target.value })} />
          </div>
          <div className="campo-modulo">
            <label>Titolo della scheda</label>
            <input value={s.titolo} onChange={(e) => aggiorna(i, { titolo: e.target.value })} placeholder="es. Bouquet Rose Rosse" />
          </div>
          <div className="campo-modulo">
            <label>Descrizione (facoltativa)</label>
            <input value={s.descrizione} onChange={(e) => aggiorna(i, { descrizione: e.target.value })} placeholder="es. Consegna in giornata" />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10 }}>
        {schede.length < 10 && (
          <button type="button" className="btn small btn-secondario" onClick={() => setSchede((p) => [...p, { ...VUOTA }])}>
            + Aggiungi scheda
          </button>
        )}
        {schede.length > 2 && (
          <button
            type="button"
            className="btn small btn-secondario"
            onClick={() =>
              setSchede((p) => {
                const prossime = p.slice(0, -1);
                serializza(prossime);
                return prossime;
              })
            }
          >
            Togli l&apos;ultima
          </button>
        )}
      </div>
      <span className="campo-aiuto">
        Servono ALMENO 2 schede complete (immagine + link). Le immagini vanno subito nella
        libreria dell&apos;account; l&apos;annuncio carosello nasce con l&apos;esecuzione approvata,
        in pausa. Se cambi marchio dopo i caricamenti, ricarica le immagini.
      </span>
    </div>
  );
}
