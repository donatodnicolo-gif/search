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
export function CercaInRubrica({
  partnerNome,
  citta,
  onScegli,
  etichetta = "⌕ Dalla rubrica",
}: {
  partnerNome: string;
  citta: string | null;
  onScegli: (p: PersonaScelta) => void;
  etichetta?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<PersonaRubrica[]>([]);
  const [stato, setStato] = useState<"" | "cerco" | "fatto">("");
  const [errore, setErrore] = useState<string | null>(null);
  const [montato, setMontato] = useState(false);
  useEffect(() => setMontato(true), []);

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
                return (
                  <button
                    key={p.chiave}
                    type="button"
                    className="modale-voce"
                    onClick={() => {
                      onScegli({ nome, telefono: p.telefono, email: p.email, ruolo: p.ruolo });
                      chiudi();
                    }}
                  >
                    <span className="modale-voce-nome">{nome}</span>
                    <span className="modale-voce-sub">
                      {[p.telefono, p.email, p.organizzazione].filter(Boolean).join(" · ") || "—"}
                    </span>
                    {nome !== p.nomeInRubrica && (
                      <span className="modale-voce-sub">in rubrica: {p.nomeInRubrica}</span>
                    )}
                  </button>
                );
              })}
              {stato === "" && !errore && (
                <div className="modale-vuoto">
                  Scrivi almeno due lettere e premi Cerca. I campi restano modificabili prima di salvare.
                </div>
              )}
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
