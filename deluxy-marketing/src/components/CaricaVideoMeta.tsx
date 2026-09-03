"use client";

import { useState } from "react";

// Il VIDEO dell'annuncio Meta, caricato a pezzi dal browser.
//
// ⚠️ Perché non un semplice <input type="file"> nel form: su Vercel il corpo
// di una richiesta ha un tetto duro a 4,5 MB e un video non ci sta. Qui il
// file si affetta (~3 MB a pezzo) e ogni pezzo va a /api/interno/meta/video,
// che lo inoltra alla sessione chunked di Meta. Alla fine il video_id finisce
// nel campo nascosto `videoId` del form — e da lì viaggia col lancio.
// Il caricamento va nella LIBRERIA dell'account: non pubblica niente.
const PEZZO = 3 * 1024 * 1024;
const MAX = 200 * 1024 * 1024;

export function CaricaVideoMeta({ brand }: { brand: string }) {
  const [stato, setStato] = useState<"fermo" | "in_corso" | "fatto" | "errore">("fermo");
  const [percento, setPercento] = useState(0);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [nomeFile, setNomeFile] = useState<string | null>(null);

  const scriviVideoId = (valore: string) => {
    const campo = document.querySelector<HTMLInputElement>('form.modulo-creazione [name="videoId"]');
    if (campo) campo.value = valore;
  };

  const carica = async (file: File) => {
    if (!/^video\/(mp4|quicktime|x-m4v)$/.test(file.type)) {
      setStato("errore");
      setMessaggio("Formato non riconosciuto: servono MP4 o MOV.");
      return;
    }
    if (file.size > MAX) {
      setStato("errore");
      setMessaggio("Video oltre i 200 MB: comprimilo prima di caricarlo.");
      return;
    }
    setStato("in_corso");
    setPercento(0);
    setMessaggio(null);
    setNomeFile(file.name);
    try {
      const inizioFd = new FormData();
      inizioFd.append("fase", "start");
      inizioFd.append("brand", brand);
      inizioFd.append("dimensione", String(file.size));
      const avvio = await fetch("/api/interno/meta/video", { method: "POST", body: inizioFd });
      const sessione = (await avvio.json()) as { errore?: string; account: string; sessione: string; videoId: string; inizio: number; fine: number };
      if (!avvio.ok || sessione.errore) throw new Error(sessione.errore ?? `avvio fallito (${avvio.status})`);

      // È META a dire gli offset: si obbedisce a quelli, non si presume.
      let inizio = sessione.inizio;
      let fine = sessione.fine;
      while (inizio < file.size && inizio < fine) {
        // Mai oltre ~3 MB per richiesta: il tetto di Vercel è 4,5.
        const finePezzo = Math.min(fine, inizio + PEZZO);
        const fd = new FormData();
        fd.append("fase", "transfer");
        fd.append("account", sessione.account);
        fd.append("sessione", sessione.sessione);
        fd.append("inizio", String(inizio));
        fd.append("pezzo", file.slice(inizio, finePezzo), "pezzo.bin");
        const r = await fetch("/api/interno/meta/video", { method: "POST", body: fd });
        const esito = (await r.json()) as { errore?: string; inizio: number; fine: number };
        if (!r.ok || esito.errore) throw new Error(esito.errore ?? `pezzo fallito (${r.status})`);
        inizio = esito.inizio;
        fine = esito.fine;
        setPercento(Math.min(99, Math.round((inizio / file.size) * 100)));
      }

      const fineFd = new FormData();
      fineFd.append("fase", "finish");
      fineFd.append("account", sessione.account);
      fineFd.append("sessione", sessione.sessione);
      const chiusura = await fetch("/api/interno/meta/video", { method: "POST", body: fineFd });
      const esitoChiusura = (await chiusura.json()) as { errore?: string };
      if (!chiusura.ok || esitoChiusura.errore) throw new Error(esitoChiusura.errore ?? "chiusura fallita");

      scriviVideoId(sessione.videoId);
      setPercento(100);
      setStato("fatto");
      setMessaggio(`Video nella libreria dell'account (id ${sessione.videoId}).`);
    } catch (e) {
      setStato("errore");
      setMessaggio(String(e instanceof Error ? e.message : e).slice(0, 200));
      scriviVideoId("");
    }
  };

  const togli = () => {
    scriviVideoId("");
    setStato("fermo");
    setPercento(0);
    setMessaggio(null);
    setNomeFile(null);
  };

  return (
    <div>
      {stato !== "fatto" && (
        <input
          type="file"
          accept="video/mp4,video/quicktime"
          disabled={stato === "in_corso"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void carica(f);
          }}
        />
      )}
      {stato === "in_corso" && (
        <div className="campo-aiuto" style={{ marginTop: 6 }}>
          Caricamento a pezzi… {percento}% {nomeFile ? `(${nomeFile})` : ""}
        </div>
      )}
      {stato === "fatto" && (
        <div className="campo-aiuto" style={{ marginTop: 6, color: "var(--green)" }}>
          ✓ {messaggio}{" "}
          <button type="button" className="link-come-testo" onClick={togli}>
            Togli
          </button>
        </div>
      )}
      {stato === "errore" && (
        <div className="campo-aiuto" style={{ marginTop: 6, color: "var(--red)" }}>
          ⚠️ {messaggio}
        </div>
      )}
    </div>
  );
}
