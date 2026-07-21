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

  return (
    <div className="filtri">
      {chips.map((c) => (
        <button
          key={c.valore || "dafare"}
          className={`chip${statoAttivo === c.valore ? " attivo" : ""}`}
          onClick={() => setParam("stato", c.valore)}
        >
          {c.colore && <span className="dot" style={{ background: c.colore }} />}
          {c.etichetta}
        </button>
      ))}
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
      <input
        className="cerca"
        placeholder="Cerca fra le attività…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </div>
  );
}
