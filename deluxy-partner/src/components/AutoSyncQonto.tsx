"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { sincronizzaQontoAllApertura } from "@/lib/transazioni-actions";

// Sincronizza Qonto quando la pagina /transazioni si apre.
//
// PERCHÉ QUI E NON NEL SERVER: se la sync bloccasse il render, la pagina
// impiegherebbe qualche secondo ad aprirsi OGNI volta. Invece la pagina si
// mostra subito con i movimenti che già ci sono, e questo componente lancia la
// sync in background al montaggio; se torna con qualcosa di nuovo, un
// `router.refresh()` fa comparire le righe senza ricaricare la pagina.
//
// Parte una sola volta per montaggio (`useRef`), così React in Strict Mode non
// la fa doppia. Il freno vero (non richiamare Qonto se la sync è recente) sta
// nella server action: qui ci si limita a chiederla.
export function AutoSyncQonto({
  azione,
}: {
  azione: typeof sincronizzaQontoAllApertura;
}) {
  const router = useRouter();
  const [stato, setStato] = useState<"idle" | "corso" | "fatto">("idle");
  const [nuove, setNuove] = useState(0);
  const partito = useRef(false);

  useEffect(() => {
    if (partito.current) return;
    partito.current = true;
    setStato("corso");
    azione()
      .then((r) => {
        if ("nuove" in r && r.nuove > 0) {
          setNuove(r.nuove);
          router.refresh();
        }
        setStato("fatto");
      })
      .catch(() => setStato("fatto"));
  }, [azione, router]);

  // Mentre gira e per un attimo dopo: una riga discreta, non un blocco. A sync
  // recente (freno) la action torna subito "saltato" e non si vede quasi nulla.
  if (stato === "idle") return null;

  return (
    <div
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12.5,
        color: "var(--text-secondary)",
        padding: "4px 0",
      }}
    >
      {stato === "corso" ? (
        <>
          <span
            style={{
              width: 12,
              height: 12,
              border: "2px solid var(--hairline)",
              borderTopColor: "var(--text-secondary)",
              borderRadius: "50%",
              animation: "autosync-spin 0.7s linear infinite",
            }}
          />
          Sincronizzo con Qonto…
        </>
      ) : nuove > 0 ? (
        <span style={{ color: "var(--green, #1a7f37)" }}>
          ⇅ Qonto sincronizzato — {nuove} {nuove === 1 ? "nuovo movimento" : "nuovi movimenti"}
        </span>
      ) : null}
      <style>{`@keyframes autosync-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
