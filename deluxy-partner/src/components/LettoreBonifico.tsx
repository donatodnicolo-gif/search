"use client";

import { useState } from "react";
import { creaPagamentoDiretto } from "@/lib/pagamenti-actions";

type Dati = {
  beneficiario: string | null;
  iban: string | null;
  bic: string | null;
  importo: number | null;
  fornitore: string | null;
  causale: string | null;
  note: string | null;
};

// Carica una foto/immagine dei dati bancari, la fa leggere all'AI e precompila
// il form del bonifico. L'operatore verifica e corregge PRIMA di predisporre:
// il pagamento non parte da qui, si scarica il file SEPA e si autorizza in banca.
export function LettoreBonifico() {
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [ibanOk, setIbanOk] = useState<boolean | null>(null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [dati, setDati] = useState<Dati>({
    beneficiario: "",
    iban: "",
    bic: "",
    importo: null,
    fornitore: "",
    causale: "",
    note: null,
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrore(null);
    setNota(null);
    setCaricando(true);
    setAnteprima(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append("immagine", file);
      const res = await fetch("/api/pagamenti/leggi", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Errore ${res.status}`);
      const d: Dati = json.dati;
      setDati({
        beneficiario: d.beneficiario ?? "",
        iban: d.iban ?? "",
        bic: d.bic ?? "",
        importo: d.importo,
        fornitore: "",
        causale: d.causale ?? "",
        note: d.note,
      });
      setIbanOk(json.ibanValido);
      setNota(d.note);
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setCaricando(false);
    }
  }

  const set = (k: keyof Dati, v: string) => setDati((d) => ({ ...d, [k]: v }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 18 }}>
        <label className="field-label">Foto o screenshot dei dati bancari</label>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 12px" }}>
          Coordinate bancarie, un IBAN scritto, una fattura del fornitore: l&apos;AI legge intestatario,
          IBAN, BIC, importo e causale. <strong>Poi verifica sempre i dati</strong> prima di predisporre il bonifico.
        </p>
        <input type="file" accept="image/*" onChange={onFile} disabled={caricando} />
        {caricando && (
          <p style={{ fontSize: 13.5, color: "var(--blue)", marginTop: 10 }}>Lettura in corso…</p>
        )}
        {errore && (
          <p style={{ fontSize: 13.5, color: "var(--red)", marginTop: 10 }}>{errore}</p>
        )}
        {anteprima && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={anteprima} alt="anteprima" style={{ maxWidth: 260, maxHeight: 200, marginTop: 12, borderRadius: 8, border: "1px solid var(--hairline)" }} />
        )}
      </div>

      <form action={creaPagamentoDiretto} className="card">
        <h2 className="section-title" style={{ marginTop: 0, fontSize: 15 }}>Dati del bonifico</h2>
        {nota && (
          <div style={{ padding: 12, marginBottom: 14, borderRadius: 10, background: "rgba(201,52,0,0.08)" }}>
            <span style={{ fontSize: 13, color: "var(--orange)" }}>⚠︎ Avviso dell&apos;AI: {nota}</span>
          </div>
        )}
        <div className="form-grid">
          <div className="full">
            <label className="field-label">Beneficiario (intestatario conto) <span className="req">*</span></label>
            <input type="text" name="beneficiario" required value={dati.beneficiario ?? ""} onChange={(e) => set("beneficiario", e.target.value)} placeholder="Ragione sociale o nome" />
          </div>
          <div>
            <label className="field-label">
              IBAN <span className="req">*</span>
              {ibanOk === true && <span className="badge green" style={{ marginLeft: 8 }}><span className="dot" />valido</span>}
              {ibanOk === false && dati.iban && <span className="badge red" style={{ marginLeft: 8 }}><span className="dot" />da verificare</span>}
            </label>
            <input
              type="text"
              name="iban"
              required
              value={dati.iban ?? ""}
              onChange={(e) => { set("iban", e.target.value.toUpperCase()); setIbanOk(null); }}
              placeholder="IT00 X000 0000 0000 0000 0000 000"
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </div>
          <div>
            <label className="field-label">BIC / SWIFT (facoltativo)</label>
            <input type="text" name="bic" value={dati.bic ?? ""} onChange={(e) => set("bic", e.target.value.toUpperCase())} placeholder="es. QNTOITM2XXX" />
          </div>
          <div>
            <label className="field-label">Importo € <span className="req">*</span></label>
            <input type="number" name="importo" required step="0.01" min="0" defaultValue={dati.importo ?? ""} key={dati.importo ?? "vuoto"} placeholder="0,00" />
          </div>
          <div>
            <label className="field-label">Fornitore / riferimento interno</label>
            <input type="text" name="fornitore" value={dati.fornitore ?? ""} onChange={(e) => set("fornitore", e.target.value)} placeholder="es. Fioreria Rossi" />
          </div>
          <div className="full">
            <label className="field-label">Causale</label>
            <input type="text" name="causale" value={dati.causale ?? ""} onChange={(e) => set("causale", e.target.value)} placeholder="es. Saldo fattura 42/2026" />
          </div>
          <div className="full">
            <label className="field-label">Note interne</label>
            <input type="text" name="note" defaultValue="" placeholder="Annotazioni (non finiscono nel bonifico)" />
          </div>
        </div>
        <div className="form-footer" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>
            Alla conferma il bonifico viene <strong>predisposto</strong> (non eseguito): dalla scheda scarichi il file
            SEPA e lo autorizzi in Qonto/home banking.
          </p>
          <button type="submit" className="btn primary" style={{ alignSelf: "flex-end" }}>Predisponi bonifico</button>
        </div>
      </form>
    </div>
  );
}
