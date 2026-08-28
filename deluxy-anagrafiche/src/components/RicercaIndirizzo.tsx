"use client";

import { useEffect, useRef, useState } from "react";

// RIEMPIMENTO INDIRIZZI CON MAPS — barra di ricerca DEDICATA che popola i campi.
//
// ⚠️ Pattern deciso dal custode UX (28/08/2026, Libro §4-bis): NON si trasforma
// il campo «Indirizzo» in un autocomplete. Si mette una barra a parte sopra i
// campi; si scrive lì, si sceglie un suggerimento, e via/città/provincia si
// riempiono. Tre motivi: Maps torna «Via X 1, 20100 Milano MI, Italia» ma il
// campo Indirizzo deve contenere solo via+civico; nel form «Aggiungi sede»
// l'Indirizzo deve restare vuoto finché l'operatore non sceglie (discriminante
// anti-doppione); ed è il modello di Scout, per coerenza di suite.
//
// ⚠️ È un AIUTO, non un cancello: i tre campi restano input di testo, sempre
// scrivibili a mano. Se il proxy non risponde (o la chiave manca), il form si
// compila interamente a mano — la ricerca non blocca mai niente.
//
// I campi bersaglio sono UNCONTROLLED (defaultValue + server action): si scrive
// nel loro `.value` via DOM, che è ciò che finisce nel FormData al submit.

type Suggerimento = { testo: string; placeId: string };
type Dettaglio = {
  indirizzo: string | null;
  citta: string | null;
  provincia: string | null;
};

export function RicercaIndirizzo({
  idIndirizzo = "indirizzo",
  idCitta = "citta",
  idProvincia = "provincia",
}: {
  idIndirizzo?: string;
  idCitta?: string;
  idProvincia?: string;
}) {
  const [q, setQ] = useState("");
  const [suggerimenti, setSuggerimenti] = useState<Suggerimento[]>([]);
  const [aperto, setAperto] = useState(false);
  const [stato, setStato] = useState<"" | "cerco" | "vuoto" | "inerte" | "errore">("");
  // Nota di sola sessione: sparisce appena l'operatore tocca un campo a mano.
  const [nota, setNota] = useState<{ testo: string; attenzione: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Suggerimenti col debounce (350ms, min 3 caratteri: come Scout).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const v = q.trim();
    if (v.length < 3) {
      setSuggerimenti([]);
      setStato("");
      return;
    }
    timer.current = setTimeout(async () => {
      setStato("cerco");
      try {
        const r = await fetch(`/api/interno/indirizzo?q=${encodeURIComponent(v)}`);
        if (r.status === 503) {
          setStato("inerte");
          setSuggerimenti([]);
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        const s: Suggerimento[] = j.suggerimenti ?? [];
        setSuggerimenti(s);
        setStato(s.length ? "" : "vuoto");
        setAperto(true);
      } catch {
        setStato("errore");
        setSuggerimenti([]);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  // Chiudi la tendina cliccando fuori.
  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setAperto(false);
    }
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  // ⚠️ La nota di provenienza è di SESSIONE: appena l'operatore modifica a mano
  // uno dei campi, il valore non viene più «da Maps» e la nota va tolta.
  useEffect(() => {
    const els = [idIndirizzo, idCitta, idProvincia]
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLInputElement[];
    const suEdit = () => setNota(null);
    els.forEach((el) => el.addEventListener("input", suEdit));
    return () => els.forEach((el) => el.removeEventListener("input", suEdit));
  }, [idIndirizzo, idCitta, idProvincia]);

  async function scegli(s: Suggerimento) {
    setAperto(false);
    setQ(s.testo);
    try {
      const r = await fetch(`/api/interno/indirizzo?place_id=${encodeURIComponent(s.placeId)}`);
      if (!r.ok) {
        setStato("errore");
        return;
      }
      const d: Dettaglio = await r.json();
      const campo = (id: string) => document.getElementById(id) as HTMLInputElement | null;
      const cittaPrima = campo(idCitta)?.value.trim() || "";
      const provPrima = campo(idProvincia)?.value.trim() || "";

      // ⚠️ La scelta è un gesto ESPLICITO dell'operatore, quindi vince e
      // sovrascrive anche i campi ereditati dall'insegna. Ma mai in silenzio:
      // se cambia un valore DIVERSO già presente, lo si dice.
      const scrivi = (id: string, val: string | null) => {
        const el = campo(id);
        if (el && val != null) el.value = val;
      };
      scrivi(idIndirizzo, d.indirizzo);
      scrivi(idCitta, d.citta);
      scrivi(idProvincia, d.provincia);

      const cambi: string[] = [];
      if (d.citta && cittaPrima && cittaPrima.toUpperCase() !== d.citta.toUpperCase())
        cambi.push(`città ${d.citta} (prima ${cittaPrima})`);
      if (d.provincia && provPrima && provPrima.toUpperCase() !== d.provincia.toUpperCase())
        cambi.push(`provincia ${d.provincia} (prima ${provPrima})`);
      if (cambi.length)
        setNota({ testo: `Da Maps: ${cambi.join(" · ")}. Controlla che sia la sede giusta.`, attenzione: true });
      else setNota({ testo: "Compilato da Maps. Correggi pure a mano se serve.", attenzione: false });
    } catch {
      setStato("errore");
    }
  }

  return (
    <div className="ricerca-indirizzo" ref={box}>
      <label htmlFor="cerca-indirizzo-maps" className="ri-label">Cerca l&apos;indirizzo su Maps</label>
      <div className="ri-campo">
        <span className="ri-icona" aria-hidden="true">◎</span>
        <input
          id="cerca-indirizzo-maps"
          type="text"
          autoComplete="off"
          value={q}
          placeholder="Scrivi e scegli: riempie via, città e provincia"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => suggerimenti.length && setAperto(true)}
          // ⚠️ Invio nella barra NON deve inviare il form: è una ricerca, non un
          // campo del modulo. Si annulla e basta.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
            if (e.key === "Escape") setAperto(false);
          }}
        />
        {aperto && suggerimenti.length > 0 && (
          <ul className="ri-lista" role="listbox">
            {suggerimenti.map((s) => (
              <li key={s.placeId}>
                <button type="button" className="ri-voce" onClick={() => scegli(s)}>
                  <span className="ri-voce-icona" aria-hidden="true">◎</span>
                  <span className="ri-voce-testo">{s.testo}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {stato === "cerco" && <p className="ri-nota">Cerco…</p>}
      {stato === "vuoto" && <p className="ri-nota">Nessun indirizzo trovato — scrivilo a mano qui sotto.</p>}
      {stato === "inerte" && <p className="ri-nota">Completamento Maps non attivo — scrivi l&apos;indirizzo a mano.</p>}
      {stato === "errore" && <p className="ri-nota">Ricerca non disponibile — scrivi l&apos;indirizzo a mano.</p>}
      {nota && <p className={`ri-nota${nota.attenzione ? " ri-nota-attenzione" : ""}`}>{nota.testo}</p>}
    </div>
  );
}
