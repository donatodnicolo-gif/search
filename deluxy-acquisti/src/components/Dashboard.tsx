"use client";

import { useMemo, useState } from "react";
import { CardRichiesta } from "./CardRichiesta";
import { CardAcquisto } from "./CardAcquisto";
import { NuovaRichiesta } from "./NuovaRichiesta";
import { NuovoAcquisto } from "./NuovoAcquisto";
import { formattaImporto } from "@/lib/vocab";
import type { AcquistoDTO, Riepilogo, RichiestaDTO } from "@/lib/tipi";

type RisultatoAI = {
  ambito: "richieste" | "acquisti";
  spiegazione: string;
  richieste?: RichiestaDTO[];
  acquisti?: AcquistoDTO[];
};

export function Dashboard({
  richieste,
  acquisti,
  riepilogo,
  aiAttiva,
}: {
  richieste: RichiestaDTO[];
  acquisti: AcquistoDTO[];
  riepilogo: Riepilogo;
  aiAttiva: boolean;
}) {
  const [tab, setTab] = useState<"richieste" | "acquisti">(
    riepilogo.richiesteDaApprovare > 0 ? "richieste" : "acquisti",
  );
  const [modale, setModale] = useState<"richiesta" | "acquisto" | null>(null);
  const [q, setQ] = useState("");
  const [aiCorso, setAiCorso] = useState(false);
  const [aiErrore, setAiErrore] = useState<string | null>(null);
  const [ai, setAi] = useState<RisultatoAI | null>(null);

  async function cerca(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setAiCorso(true);
    setAiErrore(null);
    try {
      const r = await fetch("/api/interno/ai/ricerca", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const dati = await r.json();
      if (!r.ok) throw new Error(dati?.errore || "Ricerca non riuscita.");
      setAi(dati as RisultatoAI);
      setTab(dati.ambito);
    } catch (err) {
      setAiErrore(err instanceof Error ? err.message : "Ricerca non riuscita.");
    } finally {
      setAiCorso(false);
    }
  }

  function pulisci() {
    setAi(null);
    setQ("");
    setAiErrore(null);
  }

  const listaRichieste = ai?.ambito === "richieste" && ai.richieste ? ai.richieste : richieste;
  const listaAcquisti = ai?.ambito === "acquisti" && ai.acquisti ? ai.acquisti : acquisti;

  // Le SCORCIATOIE DI PERIODO (Libro v1.9 §8-bis): quattro chip a selezione
  // singola, «Sempre» come azzeramento. Filtrano gli ACQUISTI sulla
  // `dataOrdine` — quando l'ordine è stato fatto, la data con cui si ragiona
  // sugli acquisti. Le richieste non hanno una data operativa equivalente
  // (la loro `creataIl` è burocrazia, non spesa): il periodo vale solo per la
  // scheda Acquisti. Confini in ora locale; «mese scorso» finisce dove
  // comincia questo.
  const [periodo, setPeriodo] = useState<"tutti" | "mese" | "scorso" | "trimestre" | "anno">("tutti");
  const finestra = useMemo(() => {
    const ora = new Date();
    const domani = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate() + 1);
    if (periodo === "mese") return { da: new Date(ora.getFullYear(), ora.getMonth(), 1), a: domani };
    if (periodo === "scorso")
      return { da: new Date(ora.getFullYear(), ora.getMonth() - 1, 1), a: new Date(ora.getFullYear(), ora.getMonth(), 1) };
    if (periodo === "trimestre") return { da: new Date(ora.getFullYear(), ora.getMonth() - 2, 1), a: domani };
    if (periodo === "anno") return { da: new Date(ora.getFullYear(), 0, 1), a: domani };
    return null;
  }, [periodo]);
  const acquistiFiltrati = useMemo(
    () =>
      finestra
        ? listaAcquisti.filter((a) => {
            const d = new Date(a.dataOrdine);
            return !isNaN(d.getTime()) && d >= finestra.da && d < finestra.a;
          })
        : listaAcquisti,
    [listaAcquisti, finestra],
  );

  return (
    <div className="wrap">
      <div>
        <h1 className="page-title">Acquisti</h1>
        <p className="page-sub">
          Richieste, acquisti e movimenti finanziari in un unico posto. Cerca con parole tue.
        </p>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Richieste da approvare</div>
          <div className="stat-value">{riepilogo.richiesteDaApprovare}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Acquisti aperti</div>
          <div className="stat-value">{riepilogo.acquistiAperti}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Da pagare</div>
          <div className="stat-value">{formattaImporto(riepilogo.daPagare, riepilogo.valuta)}</div>
          <div className="stat-sub">residuo su acquisti aperti</div>
        </div>
        <div className="stat">
          <div className="stat-label">Speso (12 mesi)</div>
          <div className="stat-value">{formattaImporto(riepilogo.speso12Mesi, riepilogo.valuta)}</div>
          <div className="stat-sub">movimenti eseguiti</div>
        </div>
      </div>

      <div className="azioni-riga">
        <form className="ricerca-ai" onSubmit={cerca}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              aiAttiva
                ? "Cerca con l'AI: “fatture fiori di giugno non pagate”, “ordini sopra 500€”…"
                : "Ricerca AI spenta: manca la chiave OpenAI (vedi .env.example)"
            }
            disabled={!aiAttiva || aiCorso}
          />
          <button type="submit" className="btn piccolo" disabled={!aiAttiva || aiCorso || !q.trim()}>
            {aiCorso ? "Cerco…" : "✨ Cerca"}
          </button>
        </form>
        <button className="btn ghost" onClick={() => setModale("richiesta")}>
          + Richiesta
        </button>
        <button className="btn" onClick={() => setModale("acquisto")}>
          + Acquisto
        </button>
      </div>

      {aiErrore && <div className="ai-nota" style={{ background: "transparent" }}><span className="errore" style={{ margin: 0 }}>{aiErrore}</span></div>}
      {ai && (
        <div className="ai-nota">
          <span>✨ {ai.spiegazione}</span>
          <button className="btn ghost piccolo clear" onClick={pulisci}>
            Azzera ricerca
          </button>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === "richieste" ? "attivo" : ""}`} onClick={() => setTab("richieste")}>
          Richieste <span className="conta">{listaRichieste.length}</span>
        </button>
        <button className={`tab ${tab === "acquisti" ? "attivo" : ""}`} onClick={() => setTab("acquisti")}>
          Acquisti <span className="conta">{acquistiFiltrati.length}</span>
        </button>
      </div>

      {tab === "acquisti" && (
        <div className="chips-periodo">
          {([
            { v: "tutti", l: "Sempre" },
            { v: "mese", l: "Mese in corso" },
            { v: "scorso", l: "Mese scorso" },
            { v: "trimestre", l: "Trimestre" },
            { v: "anno", l: "Anno" },
          ] as const).map((p) => (
            <button
              key={p.v}
              className={`chip${periodo === p.v ? " attivo" : ""}`}
              onClick={() => setPeriodo(p.v)}
            >
              {p.l}
            </button>
          ))}
        </div>
      )}

      {tab === "richieste" ? (
        <div className="lista">
          {listaRichieste.length === 0 ? (
            <div className="vuoto">Nessuna richiesta{ai ? " per questa ricerca" : ""}.</div>
          ) : (
            listaRichieste.map((r) => <CardRichiesta key={r.id} r={r} />)
          )}
        </div>
      ) : (
        <div className="lista">
          {acquistiFiltrati.length === 0 ? (
            <div className="vuoto">
              Nessun acquisto{ai ? " per questa ricerca" : periodo !== "tutti" ? " nel periodo scelto" : ""}.
            </div>
          ) : (
            acquistiFiltrati.map((a) => <CardAcquisto key={a.id} a={a} />)
          )}
        </div>
      )}

      {modale === "richiesta" && <NuovaRichiesta onClose={() => setModale(null)} />}
      {modale === "acquisto" && <NuovoAcquisto onClose={() => setModale(null)} />}
    </div>
  );
}
