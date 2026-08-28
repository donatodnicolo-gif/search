"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { etichettaSistema } from "@/lib/sistemi";
import { COLORE_STATO, ETICHETTA_STATO, STATI, type Stato } from "@/lib/stati";

// Filtri dell'elenco: chip di stato + progetto + ricerca. Aggiornano la query string.
export function Filtri({ sistemi = [] }: { sistemi?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const statoAttivo = sp.get("stato") ?? "";
  const sistemaAttivo = sp.get("sistema") ?? "";
  const archiviate = sp.get("archiviate") === "1";
  const [q, setQ] = useState(sp.get("q") ?? "");

  // Debounce della ricerca sull'URL
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(Array.from(sp.entries()));
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(chiave: string, v: string) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (v) params.set(chiave, v);
    else params.delete(chiave);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const chips: { valore: string; etichetta: string; colore?: string }[] = [
    { valore: "", etichetta: "Da fare" }, // default: aperte+in corso
    ...STATI.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO[s as Stato], colore: COLORE_STATO[s as Stato] })),
  ];

  // Un chip di stato riporta sempre alle attività attive; «Archiviate» è la
  // vista di ritorno delle archiviazioni (senza, l'archiviazione sarebbe
  // irreversibile dalla UI — Libro cap.7 P0).
  function setStato(v: string) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (v) params.set("stato", v);
    else params.delete("stato");
    params.delete("archiviate");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="filtri">
      {/* Solo le chip di filtro stanno nella corsia che scorre su mobile
          (Libro §8.9) — il select-chip è un filtro compatto e ci sta anche
          lui; la RICERCA resta fuori, sempre visibile. */}
      <div className="riga-chips-scorri">
      {chips.map((c) => (
        <button
          key={c.valore || "dafare"}
          className={`chip${!archiviate && statoAttivo === c.valore ? " attivo" : ""}`}
          onClick={() => setStato(c.valore)}
        >
          {c.colore && <span className="dot" style={{ background: c.colore }} />}
          {c.etichetta}
        </button>
      ))}
      <button
        className={`chip${archiviate ? " attivo" : ""}`}
        onClick={() => {
          const params = new URLSearchParams(Array.from(sp.entries()));
          params.delete("stato");
          if (archiviate) params.delete("archiviate");
          else params.set("archiviate", "1");
          router.replace(`${pathname}?${params.toString()}`);
        }}
      >
        Archiviate
      </button>
      {sistemi.length > 0 && (
        <select
          className="chip"
          value={sistemaAttivo}
          onChange={(e) => setParam("sistema", e.target.value)}
          aria-label="Filtra per progetto"
        >
          <option value="">Tutti i progetti</option>
          {sistemi.map((s) => (
            <option key={s} value={s}>
              {etichettaSistema(s)}
            </option>
          ))}
        </select>
      )}
      </div>
      <input
        className="cerca"
        placeholder="Cerca fra le attività…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </div>
  );
}
