"use client";

import { useRouter } from "next/navigation";
import { ETICHETTE_STATO, STATI } from "@/lib/stati";

// Barra di macro-filtri della dashboard: ogni scelta aggiorna subito tutti i
// grafici (navigazione con i parametri in querystring). I filtri si combinano
// in AND, così si isola una fetta precisa del registro.
export function FiltriDashboard({
  categorie,
  regioni,
  interessi,
  valori,
}: {
  categorie: string[];
  regioni: string[];
  interessi: string[];
  valori: { categoria?: string; regione?: string; stato?: string; interesse?: string };
}) {
  const router = useRouter();
  const attivi = Object.values(valori).filter(Boolean).length;

  function cambia(chiave: string, valore: string) {
    const p = new URLSearchParams(window.location.search);
    if (valore) p.set(chiave, valore);
    else p.delete(chiave);
    const qs = p.toString();
    router.push(qs ? `/dashboard?${qs}` : "/dashboard");
  }

  return (
    <div className="filtri filtri-dashboard">
      <select value={valori.categoria ?? ""} onChange={(e) => cambia("categoria", e.target.value)}>
        <option value="">Tutte le tipologie</option>
        {categorie.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select value={valori.regione ?? ""} onChange={(e) => cambia("regione", e.target.value)}>
        <option value="">Tutte le regioni</option>
        {regioni.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <select value={valori.stato ?? ""} onChange={(e) => cambia("stato", e.target.value)}>
        <option value="">Tutti gli stati</option>
        {STATI.map((s) => (
          <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>
        ))}
      </select>
      <select value={valori.interesse ?? ""} onChange={(e) => cambia("interesse", e.target.value)}>
        <option value="">Tutti gli interessi</option>
        {interessi.map((i) => (
          <option key={i} value={i}>{i}</option>
        ))}
      </select>
      {attivi > 0 && (
        <button type="button" className="btn btn-secondario" onClick={() => router.push("/dashboard")}>
          Azzera{attivi > 1 ? ` (${attivi})` : ""}
        </button>
      )}
    </div>
  );
}
