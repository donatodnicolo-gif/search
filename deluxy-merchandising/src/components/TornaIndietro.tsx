"use client";

import { useRouter } from "next/navigation";

// «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2): dal dettaglio si torna
// alla STESSA vista di prima. Da dentro l'app si usa la history (conserva
// querystring e scroll); da fuori (link diretto, refresh) si ripiega
// sull'elenco. Un link cablato sull'URL nudo butterebbe i filtri.
export function TornaIndietro({ fallback, label = "Indietro" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="torna-indietro"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      ← {label}
    </button>
  );
}
