"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { aggiungiAziendaAlCapogruppo } from "@/lib/azioni";

// «＋ Aggiungi azienda» sulla pagina di un CAPOGRUPPO: cerca un'azienda per nome
// e la mette nel capogruppo. È il verso opposto al campo «Capogruppo» sulla
// scheda dell'azienda — lo stesso gesto, visto dall'entità.
type Trovata = { id: string; nome: string; citta: string | null };

export function AggiungiAziendaCapogruppo({
  capogruppoId,
  giaDentro,
}: {
  capogruppoId: string;
  giaDentro: string[];
}) {
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState<Trovata[]>([]);
  const [aperto, setAperto] = useState(false);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [inCorso, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const dentro = new Set(giaDentro);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const v = q.trim();
    if (v.length < 2) {
      setRisultati([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/interno/cerca-partner?q=${encodeURIComponent(v)}`);
        if (!r.ok) throw new Error();
        const j = await r.json();
        // ⚠️ Fuori chi è già in questo capogruppo: aggiungerlo di nuovo non fa
        // niente, e vederlo fra i suggerimenti confonde.
        setRisultati((j.dati ?? []).filter((d: Trovata) => !dentro.has(d.id)));
        setAperto(true);
      } catch {
        setRisultati([]);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setAperto(false);
    }
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  function aggiungi(t: Trovata) {
    setAperto(false);
    setQ("");
    setSalvo(t.nome);
    startTransition(async () => {
      await aggiungiAziendaAlCapogruppo(capogruppoId, t.id);
    });
  }

  return (
    <div className="ricerca-indirizzo" ref={box} style={{ marginTop: 12 }}>
      <div className="ri-campo">
        <span className="ri-icona" aria-hidden="true">＋</span>
        <input
          type="text"
          autoComplete="off"
          value={q}
          placeholder="Aggiungi un'azienda: scrivi il nome…"
          aria-label="Aggiungi un'azienda a questo capogruppo"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => risultati.length && setAperto(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
            if (e.key === "Escape") setAperto(false);
          }}
        />
        {aperto && risultati.length > 0 && (
          <ul className="ri-lista" role="listbox">
            {risultati.map((t) => (
              <li key={t.id}>
                <button type="button" className="ri-voce" onClick={() => aggiungi(t)}>
                  <span className="ri-voce-icona" aria-hidden="true">＋</span>
                  <span className="ri-voce-testo">
                    {t.nome}
                    {t.citta ? ` — ${t.citta}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {salvo && (
        <p className="ri-nota">
          {inCorso ? `Aggiungo «${salvo}»…` : `«${salvo}» aggiunta al capogruppo.`}
        </p>
      )}
    </div>
  );
}
