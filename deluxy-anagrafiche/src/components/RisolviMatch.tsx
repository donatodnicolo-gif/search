"use client";

import { useEffect, useRef, useState } from "react";
import { ignoraRichiestaMatch, risolviRichiestaMatch } from "@/lib/azioni";

type Partner = { id: string; nome: string; categoria: string; citta: string | null; stato: string; hubspotId: string | null };

// Risoluzione manuale di una richiesta di aggancio: cerca l'anagrafica giusta
// e collegala (crea il riferimento esterno se la richiesta porta un id d'app).
export function RisolviMatch({ richiestaId, suggerimento }: { richiestaId: string; suggerimento?: string }) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState(suggerimento ?? "");
  const [risultati, setRisultati] = useState<Partner[]>([]);
  const [stato, setStato] = useState<"" | "cerco" | "errore" | "fatto">("");
  const [salvo, setSalvo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aperto) return;
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) { setRisultati([]); setStato(""); return; }
    timer.current = setTimeout(async () => {
      setStato("cerco");
      try {
        const res = await fetch(`/api/interno/cerca-partner?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setRisultati(json.dati ?? []);
        setStato("fatto");
      } catch {
        setStato("errore");
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, aperto]);

  async function scegli(p: Partner) {
    setSalvo(true);
    try {
      await risolviRichiestaMatch(richiestaId, p.id);
      setAperto(false);
    } finally {
      setSalvo(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button type="button" className="btn small" onClick={() => setAperto(true)}>Risolvi</button>
      <form action={ignoraRichiestaMatch.bind(null, richiestaId)}>
        <button type="submit" className="btn small btn-secondario" title="Archivia senza collegare">Ignora</button>
      </form>

      {aperto && (
        <div className="modale-sfondo" onClick={() => setAperto(false)}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="modale-testata">
              <div>
                <div className="modale-titolo">Risolvi l&apos;aggancio</div>
                <div className="modale-sub">Cerca e scegli l&apos;anagrafica corrispondente</div>
              </div>
              <button type="button" className="modale-chiudi" onClick={() => setAperto(false)}>✕</button>
            </div>
            <input
              autoFocus
              type="search"
              className="modale-ricerca"
              placeholder="Nome, città, referente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="modale-risultati">
              {stato === "cerco" && <div className="modale-vuoto">Ricerca…</div>}
              {stato === "errore" && <div className="modale-vuoto">Errore nella ricerca. Riprova.</div>}
              {stato === "fatto" && risultati.length === 0 && <div className="modale-vuoto">Nessun risultato per «{query}».</div>}
              {risultati.map((p) => (
                <button key={p.id} type="button" className="modale-voce" disabled={salvo} onClick={() => scegli(p)}>
                  <span className="modale-voce-nome">{p.nome}</span>
                  <span className="modale-voce-sub">{[p.categoria, p.citta, p.stato].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
