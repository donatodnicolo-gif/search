"use client";

import { useState } from "react";
import { Modale } from "./Modale";
import { CampiIo, useIo } from "./Identita";
import { creaAcquisto } from "@/lib/actions";
import { CATEGORIE, STATI_ACQUISTO, VALUTE } from "@/lib/vocab";

type Campi = {
  descrizione: string;
  fornitoreNome: string;
  fornitorePiva: string;
  categoria: string;
  imponibile: string;
  iva: string;
  totale: string;
  valuta: string;
  numeroFattura: string;
  dataFattura: string;
  note: string;
};

const VUOTO: Campi = {
  descrizione: "",
  fornitoreNome: "",
  fornitorePiva: "",
  categoria: "",
  imponibile: "",
  iva: "",
  totale: "",
  valuta: "EUR",
  numeroFattura: "",
  dataFattura: "",
  note: "",
};

export function NuovoAcquisto({ onClose }: { onClose: () => void }) {
  const [io] = useIo();
  const [campi, setCampi] = useState<Campi>(VUOTO);
  const [testoFattura, setTestoFattura] = useState("");
  const [estraendo, setEstraendo] = useState(false);
  const [avvisoAI, setAvvisoAI] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const set = (k: keyof Campi, v: string) => setCampi((c) => ({ ...c, [k]: v }));

  async function estrai() {
    if (!testoFattura.trim()) return;
    setEstraendo(true);
    setAvvisoAI(null);
    try {
      const r = await fetch("/api/interno/ai/estrai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ testo: testoFattura }),
      });
      const dati = await r.json();
      if (!r.ok) throw new Error(dati?.errore || "Estrazione non riuscita.");
      const f = dati.fattura;
      setCampi((c) => ({
        ...c,
        descrizione: f.descrizione ?? c.descrizione,
        fornitoreNome: f.fornitoreNome ?? c.fornitoreNome,
        fornitorePiva: f.fornitorePiva ?? c.fornitorePiva,
        categoria: f.categoria ?? c.categoria,
        imponibile: f.imponibile != null ? String(f.imponibile) : c.imponibile,
        iva: f.iva != null ? String(f.iva) : c.iva,
        totale: f.totale != null ? String(f.totale) : c.totale,
        valuta: f.valuta ?? c.valuta,
        numeroFattura: f.numeroFattura ?? c.numeroFattura,
        dataFattura: f.dataFattura ?? c.dataFattura,
      }));
      setAvvisoAI("Campi compilati dall'AI: controllali prima di salvare.");
    } catch (e) {
      setAvvisoAI(e instanceof Error ? e.message : "Estrazione non riuscita.");
    } finally {
      setEstraendo(false);
    }
  }

  async function invia(fd: FormData) {
    setInCorso(true);
    setErrore(null);
    try {
      await creaAcquisto(fd);
      onClose();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nel salvataggio.");
      setInCorso(false);
    }
  }

  return (
    <Modale
      titolo="Nuovo acquisto"
      sottotitolo="Registra un ordine/fattura fornitore. Puoi incollare una fattura e lasciar compilare all'AI."
      onClose={onClose}
    >
      {/* Estrazione AI */}
      <div className="campo">
        <label>Incolla qui una fattura o un ordine (AI)</label>
        <textarea
          value={testoFattura}
          onChange={(e) => setTestoFattura(e.target.value)}
          placeholder="Incolla il testo della fattura: fornitore, imponibile, IVA, totale, numero, data…"
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button type="button" className="btn ghost piccolo" onClick={estrai} disabled={estraendo || !testoFattura.trim()}>
          {estraendo ? "Leggo…" : "✨ Estrai con AI"}
        </button>
        {avvisoAI && <span className="muted">{avvisoAI}</span>}
      </div>

      <form action={invia}>
        <CampiIo io={io} />
        <div className="campo">
          <label>Descrizione *</label>
          <input
            name="descrizione"
            required
            value={campi.descrizione}
            onChange={(e) => set("descrizione", e.target.value)}
            placeholder="Cosa è stato acquistato"
          />
        </div>
        <div className="riga">
          <div className="campo">
            <label>Fornitore *</label>
            <input
              name="fornitoreNome"
              required
              value={campi.fornitoreNome}
              onChange={(e) => set("fornitoreNome", e.target.value)}
            />
          </div>
          <div className="campo">
            <label>Partita IVA</label>
            <input name="fornitorePiva" value={campi.fornitorePiva} onChange={(e) => set("fornitorePiva", e.target.value)} />
          </div>
        </div>
        <div className="riga">
          <div className="campo">
            <label>Categoria</label>
            <select name="categoria" value={campi.categoria} onChange={(e) => set("categoria", e.target.value)}>
              <option value="">—</option>
              {CATEGORIE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Stato</label>
            <select name="stato" defaultValue="ordinato">
              {STATI_ACQUISTO.filter((s) => s.codice !== "annullato").map((s) => (
                <option key={s.codice} value={s.codice}>
                  {s.etichetta}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="riga-3">
          <div className="campo">
            <label>Imponibile</label>
            <input name="imponibile" inputMode="decimal" value={campi.imponibile} onChange={(e) => set("imponibile", e.target.value)} placeholder="0,00" />
          </div>
          <div className="campo">
            <label>IVA</label>
            <input name="iva" inputMode="decimal" value={campi.iva} onChange={(e) => set("iva", e.target.value)} placeholder="0,00" />
          </div>
          <div className="campo">
            <label>Totale</label>
            <input name="totale" inputMode="decimal" value={campi.totale} onChange={(e) => set("totale", e.target.value)} placeholder="0,00" />
          </div>
        </div>
        <div className="riga-3">
          <div className="campo">
            <label>Valuta</label>
            <select name="valuta" value={campi.valuta} onChange={(e) => set("valuta", e.target.value)}>
              {VALUTE.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>N° fattura</label>
            <input name="numeroFattura" value={campi.numeroFattura} onChange={(e) => set("numeroFattura", e.target.value)} />
          </div>
          <div className="campo">
            <label>Data fattura</label>
            <input name="dataFattura" type="date" value={campi.dataFattura} onChange={(e) => set("dataFattura", e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label>Note</label>
          <textarea name="note" value={campi.note} onChange={(e) => set("note", e.target.value)} />
        </div>
        {errore && <p className="errore">{errore}</p>}
        <div className="modal-azioni">
          <button type="button" className="btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn" disabled={inCorso}>
            {inCorso ? "Salvo…" : "Registra acquisto"}
          </button>
        </div>
      </form>
    </Modale>
  );
}
