"use client";

import { useRouter } from "next/navigation";

// «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2): dal dettaglio si torna
// alla STESSA vista di prima. Da dentro l'app si usa la history (conserva
// querystring e scroll); da fuori (link diretto, refresh) si ripiega
// sull'elenco indicato da `fallback`. Un link cablato sull'URL nudo
// butterebbe i filtri.
//
// ⚠️ Sidebar e Operazioni lo usano senza `fallback` e senza classe: lì vale il
// vecchio contratto (bottone «← Indietro» sulla sola cronologia). Le pagine di
// dettaglio passano `fallback` e `className="torna-indietro"` per vestirsi
// come i link `.ritorno` che hanno sostituito.
export function TornaIndietro({
  fallback,
  etichetta = "← Indietro",
  className = "btn small btn-secondario",
}: {
  fallback?: string;
  etichetta?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else if (fallback) router.push(fallback);
      }}
      title="Torna alla pagina da cui sei arrivato"
    >
      {etichetta}
    </button>
  );
}
