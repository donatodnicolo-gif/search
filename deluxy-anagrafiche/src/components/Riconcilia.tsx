"use client";

import { useEffect, useRef, useState } from "react";
import { riconciliaHubspot } from "@/lib/azioni";

type RisultatoPartner = {
  id: string;
  nome: string;
  categoria: string;
  citta: string | null;
  stato: string;
  hubspotId: string | null;
};
type RisultatoHubspot = {
  id: string;
  nome: string;
  citta: string | null;
  telefono: string | null;
  dominio: string | null;
};

// Popup di riconciliazione tra registro e HubSpot.
// cerca="hubspot": la riga è un'anagrafica (partnerId fisso), si cerca la company.
// cerca="partner": la riga è una company HubSpot (hubspotId fisso), si cerca l'anagrafica.
export function Riconcilia({
  cerca,
  partnerId,
  hubspotId,
  nomeRiga,
  collegato = false,
}: {
  cerca: "hubspot" | "partner";
  partnerId?: string;
  hubspotId?: string;
  nomeRiga: string;
  collegato?: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<(RisultatoPartner | RisultatoHubspot)[]>([]);
  const [statoRicerca, setStatoRicerca] = useState<"" | "cerco" | "errore" | "fatto">("");
  const [salvo, setSalvo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aperto) return;
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setRisultati([]);
      setStatoRicerca("");
      return;
    }
    timer.current = setTimeout(async () => {
      setStatoRicerca("cerco");
      try {
        const res = await fetch(
          `/api/interno/cerca-${cerca === "hubspot" ? "hubspot" : "partner"}?q=${encodeURIComponent(query)}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        setRisultati(json.dati ?? []);
        setStatoRicerca("fatto");
      } catch {
        setStatoRicerca("errore");
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, aperto, cerca]);

  async function scegli(r: RisultatoPartner | RisultatoHubspot) {
    setSalvo(true);
    try {
      if (cerca === "hubspot") {
        await riconciliaHubspot(partnerId!, r.id);
      } else {
        await riconciliaHubspot(r.id, hubspotId!);
      }
      setAperto(false);
      setQuery("");
      setRisultati([]);
    } finally {
      setSalvo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn-riconcilia${collegato ? " collegato" : ""}`}
        title={
          collegato
            ? "Già riconciliata con HubSpot — clicca per cambiare collegamento"
            : cerca === "hubspot"
              ? "Riconcilia con una company HubSpot"
              : "Riconcilia con un'anagrafica del registro"
        }
        onClick={() => setAperto(true)}
      >
        ⇄
      </button>

      {aperto && (
        <div className="modale-sfondo" onClick={() => setAperto(false)}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testata">
              <div>
                <div className="modale-titolo">Riconcilia «{nomeRiga}»</div>
                <div className="modale-sub">
                  {cerca === "hubspot"
                    ? "Cerca la company corrispondente su HubSpot"
                    : "Cerca l'anagrafica corrispondente nel registro"}
                </div>
              </div>
              <button type="button" className="modale-chiudi" onClick={() => setAperto(false)}>✕</button>
            </div>
            <input
              autoFocus
              type="search"
              className="modale-ricerca"
              placeholder={cerca === "hubspot" ? "Nome della company…" : "Nome, città, referente…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="modale-risultati">
              {statoRicerca === "cerco" && <div className="modale-vuoto">Ricerca…</div>}
              {statoRicerca === "errore" && <div className="modale-vuoto">Errore nella ricerca. Riprova.</div>}
              {statoRicerca === "fatto" && risultati.length === 0 && (
                <div className="modale-vuoto">Nessun risultato per «{query}».</div>
              )}
              {risultati.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="modale-voce"
                  disabled={salvo}
                  onClick={() => scegli(r)}
                >
                  <span className="modale-voce-nome">{r.nome}</span>
                  <span className="modale-voce-sub">
                    {"categoria" in r
                      ? [r.categoria, r.citta, r.hubspotId ? "già collegata ⇄" : null].filter(Boolean).join(" · ")
                      : [r.citta, r.dominio ?? r.telefono].filter(Boolean).join(" · ") || "—"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
