"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { nuovaRichiestaManuale } from "@/app/actions";
import { AIUTO_METODO, METODI, SEGNAPOSTO_METODO } from "@/lib/metodi";

// Il modulo della richiesta manuale. Dal 28/08/2026 sa anche LEGGERE: si
// incolla il testo di una chat o lo screenshot di una richiesta di pagamento e
// l'AI propone importo, IBAN e intestatario. PROPONE: i campi restano
// modificabili e il salvataggio è sempre un gesto della persona.

type Estratto = {
  stato: string;
  dati?: { iban: string; intestatario: string; importo: number; valuta: string; causale: string };
  ibanValido?: boolean;
  fornitore?: string;
};

export function ModuloNuovaRichiesta() {
  const [stato, azione, inCorso] = useActionState(nuovaRichiestaManuale, {} as { errore?: string; ok?: string });
  const [metodo, setMetodo] = useState("iban");
  const [testoAi, setTestoAi] = useState("");
  const [immagineAi, setImmagineAi] = useState<{ dati: string; tipo: string; nome: string } | null>(null);
  const [letturaInCorso, setLetturaInCorso] = useState(false);
  const [esitoLettura, setEsitoLettura] = useState("");
  const beneficiarioRef = useRef<HTMLInputElement>(null);
  const importoRef = useRef<HTMLInputElement>(null);
  const ibanRef = useRef<HTMLInputElement>(null);
  const causaleRef = useRef<HTMLInputElement>(null);

  const conIban = metodo === "iban";

  async function scegliImmagine(file: File | null) {
    if (!file) return setImmagineAi(null);
    const base64 = await new Promise<string>((resolve, reject) => {
      const lettore = new FileReader();
      lettore.onload = () => resolve(String(lettore.result).replace(/^data:[^;]+;base64,/, ""));
      lettore.onerror = () => reject(lettore.error);
      lettore.readAsDataURL(file);
    });
    setImmagineAi({ dati: base64, tipo: file.type || "image/png", nome: file.name });
  }

  async function leggiConAi() {
    setLetturaInCorso(true);
    setEsitoLettura("");
    try {
      const risposta = await fetch("/api/estrai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          testo: testoAi.trim() || undefined,
          immagine: immagineAi ? { dati: immagineAi.dati, tipo: immagineAi.tipo } : undefined,
        }),
      });
      const esito = (await risposta.json()) as Estratto & { errore?: string };
      if (!risposta.ok || esito.errore) {
        setEsitoLettura(esito.errore ?? `Errore ${risposta.status}.`);
        return;
      }
      // I campi si COMPILANO, non si salvano: la persona rilegge e decide.
      if (esito.dati) {
        if (beneficiarioRef.current && esito.dati.intestatario) beneficiarioRef.current.value = esito.dati.intestatario;
        if (importoRef.current && esito.dati.importo > 0) {
          importoRef.current.value = esito.dati.importo.toFixed(2).replace(".", ",");
        }
        if (ibanRef.current && esito.dati.iban) ibanRef.current.value = esito.dati.iban;
        if (causaleRef.current && esito.dati.causale) causaleRef.current.value = esito.dati.causale;
        const notaIban = esito.dati.iban
          ? esito.ibanValido
            ? "IBAN verificato (checksum ok)."
            : "⚠️ l'IBAN letto NON passa il checksum: ricontrollalo sull'originale."
          : "nessun IBAN nel contenuto.";
        setEsitoLettura(`Letto con ${esito.fornitore}: ${notaIban} Rileggi i campi prima di registrare.`);
      }
    } catch {
      setEsitoLettura("Lettura non riuscita: riprova o compila a mano.");
    } finally {
      setLetturaInCorso(false);
    }
  }

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}

      <div className="modulo" style={{ marginBottom: 16 }}>
        <div className="campo-modulo largo">
          <label htmlFor="testoAi">Leggi con l&rsquo;AI (facoltativo): incolla il testo della richiesta…</label>
          <textarea
            id="testoAi"
            rows={3}
            value={testoAi}
            onChange={(e) => setTestoAi(e.target.value)}
            placeholder="…il messaggio del fornitore con IBAN e importo…"
          />
        </div>
        <div className="campo-modulo">
          <label htmlFor="immagineAi">…oppure uno screenshot (png/jpg)</label>
          <input
            id="immagineAi"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => scegliImmagine(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="azioni-modulo campo-modulo">
          <button type="button" className="btn secondario" onClick={leggiConAi} disabled={letturaInCorso || (!testoAi.trim() && !immagineAi)}>
            {letturaInCorso ? "Leggo…" : "Leggi e riempi i campi"}
          </button>
        </div>
        {esitoLettura && <div className="campo-modulo largo nota-campo">{esitoLettura}</div>}
      </div>

      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="metodo">Come si paga</label>
          <select id="metodo" name="metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {Object.entries(METODI).map(([valore, etichetta]) => (
              <option key={valore} value={valore}>
                {etichetta}
              </option>
            ))}
          </select>
          <small className="nota-campo">{AIUTO_METODO[metodo]}</small>
        </div>
        <div className="campo-modulo">
          <label htmlFor="beneficiario">Beneficiario</label>
          <input id="beneficiario" name="beneficiario" required ref={beneficiarioRef} />
        </div>
        <div className="campo-modulo">
          <label htmlFor="importo">Importo in euro</label>
          <input id="importo" name="importo" inputMode="decimal" placeholder="1.250,00" required ref={importoRef} />
        </div>
        {conIban ? (
          <>
            <div className="campo-modulo">
              <label htmlFor="iban">IBAN</label>
              <input id="iban" name="iban" required spellCheck={false} autoComplete="off" ref={ibanRef} />
            </div>
            <div className="campo-modulo">
              <label htmlFor="bic">BIC (facoltativo)</label>
              <input id="bic" name="bic" spellCheck={false} autoComplete="off" />
            </div>
          </>
        ) : (
          <div className="campo-modulo largo">
            <label htmlFor="riferimentoPagamento">
              {metodo === "carta" ? "Nota sulla carta (facoltativa, MAI il numero)" : "Riferimento di pagamento"}
            </label>
            <input
              id="riferimentoPagamento"
              name="riferimentoPagamento"
              placeholder={SEGNAPOSTO_METODO[metodo] ?? ""}
              required={metodo !== "carta"}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        )}
        <div className="campo-modulo largo">
          <label htmlFor="causale">Causale (max 140 caratteri)</label>
          <input id="causale" name="causale" maxLength={140} required ref={causaleRef} />
        </div>
        <div className="campo-modulo">
          <label htmlFor="categoria">Categoria (facoltativa)</label>
          <input id="categoria" name="categoria" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="scadenza">Scadenza (facoltativa)</label>
          <input id="scadenza" name="scadenza" type="date" />
        </div>
        <div className="campo-modulo largo">
          <label htmlFor="note">Note interne</label>
          <textarea id="note" name="note" rows={3} />
        </div>
        <div className="azioni-modulo campo-modulo largo">
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Registro…" : "Registra la richiesta"}
          </button>
        </div>
      </form>
    </>
  );
}
