"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cercaInRubrica, getToken, type PersonaRubrica } from "./google-rubrica";
import { nomePersonaDaRubrica } from "@/lib/rubrica";

export type PersonaScelta = {
  nome: string;
  telefono: string | null;
  email: string | null;
  ruolo: string | null;
};

// Pesca un referente dalla rubrica Google dell'operatore (l'account con cui
// entra in Google: in azienda deluxy.delivery@gmail.com) invece di ridigitarlo.
// È la stessa rubrica e lo stesso consenso OAuth del salvataggio automatico —
// solo nel verso opposto: lì scriviamo, qui leggiamo.
//
// Il nome viene ripulito dai pezzi che ci mettiamo noi salvando ("PARTNER
// Basara Milano MILANO Mara Roveda" → "Mara Roveda"), perché altrimenti quella
// zavorra rientrerebbe nel registro a ogni import.
//
// La scelta è MULTIPLA e il riquadro non si chiude a ogni click: di solito da
// un negozio si prendono il titolare e due persone in sala, e chiuderlo ogni
// volta vorrebbe dire riaprirlo, riautorizzare e ricercare. Le selezioni
// restano anche cambiando ricerca, così si può pescare in giro e confermare
// una volta sola.
export function CercaInRubrica({
  partnerNome,
  citta,
  onScegli,
  etichetta = "⌕ Dalla rubrica",
}: {
  partnerNome: string;
  citta: string | null;
  onScegli: (persone: PersonaScelta[]) => void;
  etichetta?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<PersonaRubrica[]>([]);
  const [stato, setStato] = useState<"" | "cerco" | "fatto">("");
  const [errore, setErrore] = useState<string | null>(null);
  const [montato, setMontato] = useState(false);
  // Chiave della persona in rubrica → dati già ripuliti. È una mappa e non una
  // lista perché sopravvive ai cambi di ricerca: la spunta deve restare anche
  // quando il risultato sparisce dall'elenco.
  const [scelte, setScelte] = useState<Map<string, PersonaScelta>>(new Map());
  useEffect(() => setMontato(true), []);

  function alterna(chiave: string, persona: PersonaScelta) {
    setScelte((prec) => {
      const nuova = new Map(prec);
      if (nuova.has(chiave)) nuova.delete(chiave);
      else nuova.set(chiave, persona);
      return nuova;
    });
  }

  async function cerca() {
    if (query.trim().length < 2) return;
    setStato("cerco");
    setErrore(null);
    try {
      // Prima si prova senza popup: se il consenso c'è già non disturba nessuno.
      let token: string;
      try {
        token = await getToken(true);
      } catch {
        token = await getToken();
      }
      setRisultati(await cercaInRubrica(token, query));
      setStato("fatto");
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Ricerca non riuscita.");
      setStato("");
    }
  }

  function chiudi() {
    setAperto(false);
    setQuery("");
    setRisultati([]);
    setStato("");
    setErrore(null);
    setScelte(new Map());
  }

  function conferma() {
    if (scelte.size === 0) return;
    onScegli([...scelte.values()]);
    chiudi();
  }

  // Il riquadro esce dal flusso della pagina (portale sul body): questo
  // componente vive dentro il form di modifica dell'anagrafica, e un form
  // dentro un altro form è HTML non valido — oltre che un modo per salvare
  // l'anagrafica premendo Invio mentre si cerca una persona.
  const riquadro = aperto && montato
    ? createPortal(
        <div className="modale-sfondo" onClick={chiudi}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testata">
              <div>
                <div className="modale-titolo">Cerca nella rubrica Google</div>
                <div className="modale-sub">
                  La rubrica dell&apos;account Google con cui ti colleghi (in azienda:
                  deluxy.delivery@gmail.com). Alla prima ricerca Google chiede il consenso.
                </div>
              </div>
              <button type="button" className="modale-chiudi" onClick={chiudi}>✕</button>
            </div>

            {errore && <div className="avviso-errore">{errore}</div>}

            <div className="ricerca-rubrica">
              <input
                autoFocus
                type="search"
                className="modale-ricerca"
                placeholder="Nome, telefono o email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  // L'Invio cerca; non deve arrivare al form che c'è sotto.
                  e.preventDefault();
                  void cerca();
                }}
              />
              <button
                type="button"
                className="btn"
                onClick={() => void cerca()}
                disabled={stato === "cerco" || query.trim().length < 2}
              >
                {stato === "cerco" ? "Cerco…" : "Cerca"}
              </button>
            </div>

            <div className="modale-risultati">
              {stato === "fatto" && risultati.length === 0 && (
                <div className="modale-vuoto">Nessuno in rubrica per «{query}».</div>
              )}
              {risultati.map((p) => {
                const nome = nomePersonaDaRubrica(p.nomeInRubrica, { partnerNome, citta });
                const scelta = scelte.has(p.chiave);
                return (
                  <button
                    key={p.chiave}
                    type="button"
                    className={`modale-voce voce-scelta${scelta ? " attiva" : ""}`}
                    aria-pressed={scelta}
                    onClick={() => alterna(p.chiave, { nome, telefono: p.telefono, email: p.email, ruolo: p.ruolo })}
                  >
                    <span className="spunta" aria-hidden="true">{scelta ? "✓" : ""}</span>
                    <span className="voce-testo">
                      <span className="modale-voce-nome">{nome}</span>
                      <span className="modale-voce-sub">
                        {[p.telefono, p.email, p.organizzazione].filter(Boolean).join(" · ") || "—"}
                      </span>
                      {nome !== p.nomeInRubrica && (
                        <span className="modale-voce-sub">in rubrica: {p.nomeInRubrica}</span>
                      )}
                    </span>
                  </button>
                );
              })}
              {stato === "" && !errore && (
                <div className="modale-vuoto">
                  Scrivi almeno due lettere e premi Cerca. Puoi spuntarne più di una, anche cambiando
                  ricerca: le scelte restano finché non confermi.
                </div>
              )}
            </div>

            <div className="modale-piede">
              <span className="testo-guida">
                {scelte.size === 0
                  ? "Nessuna persona selezionata"
                  : `${scelte.size} ${scelte.size === 1 ? "persona selezionata" : "persone selezionate"}: ${[...scelte.values()].map((s) => s.nome).join(", ")}`}
              </span>
              <button type="button" className="btn btn-secondario" onClick={chiudi}>
                Annulla
              </button>
              <button type="button" className="btn" onClick={conferma} disabled={scelte.size === 0}>
                {scelte.size > 1 ? `Aggiungi ${scelte.size} persone` : "Aggiungi"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        className="btn btn-secondario"
        style={{ fontSize: 12.5, padding: "6px 14px" }}
        onClick={() => setAperto(true)}
        title="Cerca la persona nella rubrica Google dell'account con cui sei collegato"
      >
        {etichetta}
      </button>
      {riquadro}
    </>
  );
}
