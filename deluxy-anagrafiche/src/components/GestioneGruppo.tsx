"use client";

import { useEffect, useRef, useState } from "react";
import { raggruppaSotto } from "@/lib/azioni";

type RisultatoPartner = {
  id: string;
  nome: string;
  categoria: string;
  citta: string | null;
  stato: string;
};

// Sceglie l'insegna madre sotto cui raggruppare questa anagrafica.
// Le sedi restano anagrafiche autonome: cambia solo l'appartenenza al gruppo.
export function GestioneGruppo({ partnerId, nome }: { partnerId: string; nome: string }) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<RisultatoPartner[]>([]);
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
        const res = await fetch(`/api/interno/cerca-partner?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        setRisultati((json.dati ?? []).filter((r: RisultatoPartner) => r.id !== partnerId));
        setStatoRicerca("fatto");
      } catch {
        setStatoRicerca("errore");
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, aperto, partnerId]);

  async function scegli(r: RisultatoPartner) {
    setSalvo(true);
    try {
      await raggruppaSotto(partnerId, r.id);
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
        className="btn btn-secondario"
        style={{ fontSize: 12.5, padding: "6px 14px" }}
        onClick={() => setAperto(true)}
        title="Raggruppa questa anagrafica sotto un'insegna madre"
      >
        ⧉ Raggruppa
      </button>

      {aperto && (
        <div className="modale-sfondo" onClick={() => setAperto(false)}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testata">
              <div>
                <div className="modale-titolo">Raggruppa «{nome}»</div>
                <div className="modale-sub">
                  Cerca l&apos;insegna madre: questa anagrafica diventa una sua sede
                </div>
              </div>
              <button type="button" className="modale-chiudi" onClick={() => setAperto(false)}>✕</button>
            </div>
            <input
              autoFocus
              type="search"
              className="modale-ricerca"
              placeholder="Nome dell'insegna madre…"
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
                    {[r.categoria, r.citta].filter(Boolean).join(" · ")}
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
