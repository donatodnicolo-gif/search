"use client";

import { useEffect, useRef, useState } from "react";
import { spostaContatto, spostaContattiMulti } from "@/lib/azioni";
import { linkContattoHubspot } from "@/lib/hubspot-link";

type Suggerito = { id: string; nome: string; categoria: string; citta: string | null };
export type RigaRiconc = {
  id: string;
  nome: string | null;
  ruolo: string | null;
  email: string | null;
  telefono: string | null;
  hubspotId: string | null;
  partnerId: string;
  partnerNome: string;
  partnerCitta: string | null;
  suggeriti: Suggerito[];
};

type RisultatoPartner = { id: string; nome: string; categoria: string; citta: string | null };

export function TabellaRiconciliazione({ righe }: { righe: RigaRiconc[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modale, setModale] = useState<null | { tipo: "uno" | "bulk"; contattoId?: string; nome?: string }>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const tutti = righe.length > 0 && righe.every((r) => sel.has(r.id));
  const toggleTutti = () => setSel(tutti ? new Set() : new Set(righe.map((r) => r.id)));

  // Sposta un contatto direttamente su un suggerimento (un click)
  async function suSuggerito(contattoId: string, partnerId: string) {
    setInCorso(contattoId);
    try {
      await spostaContatto(contattoId, partnerId);
    } finally {
      setInCorso(null);
    }
  }

  return (
    <>
      {sel.size > 0 && (
        <div className="barra-selezione">
          <span>{sel.size} selezionati</span>
          <button type="button" className="btn small" onClick={() => setModale({ tipo: "bulk" })}>
            Sposta selezionati →
          </button>
          <button type="button" className="btn small btn-secondario" onClick={() => setSel(new Set())}>
            Deseleziona
          </button>
        </div>
      )}

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={tutti} onChange={toggleTutti} aria-label="Seleziona tutti" />
              </th>
              <th>Referente</th>
              <th>Ruolo</th>
              <th>Contatti</th>
              <th>Anagrafica attuale</th>
              <th>Suggerimenti / azione</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id}>
                <td>
                  <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Seleziona ${r.nome ?? ""}`} />
                </td>
                <td>
                  {r.hubspotId ? (
                    <a href={linkContattoHubspot(r.hubspotId)} target="_blank" rel="noreferrer" title="Apri in HubSpot">
                      <div className="cella-nome">{r.nome ?? "—"} ↗</div>
                    </a>
                  ) : (
                    <div className="cella-nome">{r.nome ?? "—"}</div>
                  )}
                </td>
                <td className="cella-muta">{r.ruolo ?? "—"}</td>
                <td className="cella-muta">{[r.email, r.telefono].filter(Boolean).join(" · ") || "—"}</td>
                <td>
                  <a href={`/partner/${r.partnerId}`}>
                    <div className="cella-nome">{r.partnerNome}</div>
                    {r.partnerCitta && <div className="cella-sub">{r.partnerCitta}</div>}
                  </a>
                </td>
                <td>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {r.suggeriti.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="chip-suggerito"
                        disabled={inCorso === r.id}
                        title={`Sposta a ${s.nome}${s.citta ? " · " + s.citta : ""}`}
                        onClick={() => suSuggerito(r.id, s.id)}
                      >
                        → {s.nome}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn small btn-secondario"
                      onClick={() => setModale({ tipo: "uno", contattoId: r.id, nome: r.nome ?? "referente" })}
                    >
                      Altra…
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modale && (
        <ModaleCerca
          titolo={modale.tipo === "bulk" ? `Sposta ${sel.size} referenti` : `Riassegna «${modale.nome}»`}
          onChiudi={() => setModale(null)}
          onScegli={async (p) => {
            if (modale.tipo === "bulk") await spostaContattiMulti([...sel], p.id);
            else if (modale.contattoId) await spostaContatto(modale.contattoId, p.id);
            setSel(new Set());
            setModale(null);
          }}
        />
      )}
    </>
  );
}

function ModaleCerca({
  titolo,
  onChiudi,
  onScegli,
}: {
  titolo: string;
  onChiudi: () => void;
  onScegli: (p: RisultatoPartner) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<RisultatoPartner[]>([]);
  const [stato, setStato] = useState<"" | "cerco" | "errore" | "fatto">("");
  const [salvo, setSalvo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
        setRisultati((await res.json()).dati ?? []);
        setStato("fatto");
      } catch {
        setStato("errore");
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return (
    <div className="modale-sfondo" onClick={onChiudi}>
      <div className="modale" onClick={(e) => e.stopPropagation()}>
        <div className="modale-testata">
          <div>
            <div className="modale-titolo">{titolo}</div>
            <div className="modale-sub">Cerca l&apos;anagrafica di destinazione</div>
          </div>
          <button type="button" className="modale-chiudi" onClick={onChiudi}>✕</button>
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
          {stato === "fatto" && risultati.length === 0 && <div className="modale-vuoto">Nessuna anagrafica per «{query}».</div>}
          {risultati.map((p) => (
            <button
              key={p.id}
              type="button"
              className="modale-voce"
              disabled={salvo}
              onClick={async () => {
                setSalvo(true);
                try {
                  await onScegli(p);
                } finally {
                  setSalvo(false);
                }
              }}
            >
              <span className="modale-voce-nome">{p.nome}</span>
              <span className="modale-voce-sub">{[p.categoria, p.citta].filter(Boolean).join(" · ") || "—"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
