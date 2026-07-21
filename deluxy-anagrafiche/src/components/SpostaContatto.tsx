"use client";

import { useEffect, useRef, useState } from "react";
import { spostaContatto } from "@/lib/azioni";

type RisultatoPartner = {
  id: string;
  nome: string;
  categoria: string;
  citta: string | null;
  stato: string;
};

// Modale per riassegnare un referente all'anagrafica giusta: cerca l'insegna
// e sposta il contatto lì (senza duplicarlo). Riusa /api/interno/cerca-partner.
export function SpostaContatto({
  contattoId,
  nomeContatto,
  partnerAttualeId,
}: {
  contattoId: string;
  nomeContatto: string;
  partnerAttualeId: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<RisultatoPartner[]>([]);
  const [stato, setStato] = useState<"" | "cerco" | "errore" | "fatto">("");
  const [salvo, setSalvo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aperto) return;
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setRisultati([]);
      setStato("");
      return;
    }
    timer.current = setTimeout(async () => {
      setStato("cerco");
      try {
        const res = await fetch(`/api/interno/cerca-partner?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        setRisultati((json.dati ?? []).filter((r: RisultatoPartner) => r.id !== partnerAttualeId));
        setStato("fatto");
      } catch {
        setStato("errore");
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, aperto, partnerAttualeId]);

  async function scegli(r: RisultatoPartner) {
    setSalvo(true);
    try {
      await spostaContatto(contattoId, r.id);
      setAperto(false);
      setQuery("");
      setRisultati([]);
    } finally {
      setSalvo(false);
    }
  }

  return (
    <>
      <button type="button" className="btn small" onClick={() => setAperto(true)} title="Sposta a un'altra anagrafica">
        Riassegna →
      </button>

      {aperto && (
        <div className="modale-sfondo" onClick={() => setAperto(false)}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testata">
              <div>
                <div className="modale-titolo">Riassegna «{nomeContatto}»</div>
                <div className="modale-sub">Cerca l&apos;anagrafica a cui spostare il referente</div>
              </div>
              <button type="button" className="modale-chiudi" onClick={() => setAperto(false)}>✕</button>
            </div>
            <input
              autoFocus
              type="search"
              className="modale-ricerca"
              placeholder="Nome insegna, città…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="modale-risultati">
              {stato === "cerco" && <div className="modale-vuoto">Ricerca…</div>}
              {stato === "errore" && <div className="modale-vuoto">Errore nella ricerca. Riprova.</div>}
              {stato === "fatto" && risultati.length === 0 && (
                <div className="modale-vuoto">Nessuna anagrafica per «{query}».</div>
              )}
              {risultati.map((r) => (
                <button key={r.id} type="button" className="modale-voce" disabled={salvo} onClick={() => scegli(r)}>
                  <span className="modale-voce-nome">{r.nome}</span>
                  <span className="modale-voce-sub">{[r.categoria, r.citta].filter(Boolean).join(" · ") || "—"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
