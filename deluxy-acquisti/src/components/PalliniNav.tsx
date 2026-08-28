"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { decidiPallini, type Visto } from "@/lib/pallini";

// ── IL PALLINO GIALLO SULLA VOCE «RICHIESTE»: «qui è arrivato qualcosa» ──
//
// Sistema di notifiche in-app canonico Deluxy (Libro UX&UI §7); implementazione
// di riferimento: la Sidebar del Customer Service (deluxy-messaging).
//
// ⚠️⚠️ IL NUMERO E IL PALLINO DICONO COSE DIVERSE, e per questo ci sono tutti e
// due: il numero è **quante richieste aspettano una decisione**, il pallino è
// **è arrivato qualcosa da quando hai guardato**. Con un segnale solo, uno dei
// due casi sparisce.
//
// ⚠️⚠️ NON SI CONFRONTANO OROLOGI. Il server dice la data della cosa più
// recente **che c'è**; qui ci si ricorda **l'ultima già vista** (localStorage)
// e si accende il pallino se la prima è più recente. La regola sta in
// `src/lib/pallini.ts`, in un file suo perché si possa provare.

const CHIAVE_VISTO = "acquisti-sezioni-viste";
// ⚠️ Novanta secondi: l'immediatezza ce l'hanno i riquadri in basso a destra
// (Novita.tsx, ogni 25 s); qui basta essere aggiornati, non istantanei.
const RESPIRO = 90000;

type Carico = { ultimo: string; quanti: number; urgente: boolean };

/**
 * Fa comparire la fascia «Sessione scaduta» in cima all'app.
 *
 * ⚠️ Un evento e non uno stato condiviso: lo usano anche i riquadri delle
 * novità, e un evento non lega i due componenti l'uno all'altro.
 */
export function avvisaSessioneScaduta(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("deluxy:sessione-scaduta"));
}

function usaPallini(path: string): { accesi: Set<string>; carichi: Record<string, Carico> } {
  const [accesi, setAccesi] = useState<Set<string>>(new Set());
  const [carichi, setCarichi] = useState<Record<string, Carico>>({});

  const guarda = useCallback(async () => {
    // ⚠️ Sulla pagina di login non si bussa: non c'è ancora una sessione, e il
    // 401 che tornerebbe accenderebbe la fascia «Sessione scaduta» a chi deve
    // ancora entrare.
    if (path === "/login") return;
    try {
      const res = await fetch("/api/novita/sezioni", { cache: "no-store" });
      // ⚠️ Sessione scaduta: la rotta risponde 401, ma se un giorno finisse
      // dietro il redirect del middleware `fetch` lo seguirebbe da solo
      // tornando la pagina di login con stato 200. Si guardano quindi anche il
      // redirect e il tipo di contenuto, o si continuerebbe a bussare.
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || res.redirected || !ct.includes("application/json")) {
        // ⚠️⚠️ QUESTO È IL PUNTO CHE SE NE ACCORGE SEMPRE: la barra c'è su ogni
        // pagina e chiede i carichi a intervalli, quindi la fascia compare
        // entro un giro qualunque schermata si stia guardando.
        avvisaSessioneScaduta();
        return;
      }
      const d = (await res.json()) as { sezioni: Record<string, Carico> };
      setCarichi(d.sezioni);
      // ⚠️ Il segnalibro sta nel browser di quella persona: «l'ho guardato io»
      // non è un fatto dell'azienda.
      let visto: Visto = {};
      let mai = false;
      try {
        const grezzo = localStorage.getItem(CHIAVE_VISTO);
        if (grezzo) visto = JSON.parse(grezzo) as Visto;
        else mai = true;
      } catch {
        // finestra privata o dati bloccati: come la prima volta, cioè niente
        // pallini. Meglio muti che tutti accesi.
        mai = true;
      }
      const esito = decidiPallini(d.sezioni, visto, path, mai);
      try {
        localStorage.setItem(CHIAVE_VISTO, JSON.stringify(esito.visto));
      } catch {
        // niente da ricordare: i pallini valgono per questa pagina e basta
      }
      setAccesi(new Set(esito.accesi));
    } catch {
      // rete assente: i pallini restano come stanno
    }
  }, [path]);

  useEffect(() => {
    // ⚠️ Si guarda a ogni cambio di pagina, non solo a tempo: entrando in una
    // sezione il suo pallino deve spegnersi subito, non dopo un minuto.
    void guarda();
    const t = setInterval(() => {
      // Scheda nascosta: non si chiede niente. Al ritorno si chiede subito.
      if (!document.hidden) void guarda();
    }, RESPIRO);
    const alRitorno = () => {
      if (!document.hidden) void guarda();
    };
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [guarda]);

  return { accesi, carichi };
}

/** La voce «Richieste» della topbar, con numero e pallino; e la fascia di sessione scaduta. */
export function PalliniNav() {
  const path = usePathname();
  const { accesi, carichi } = usaPallini(path);
  const [scaduta, setScaduta] = useState(false);

  useEffect(() => {
    const su = () => setScaduta(true);
    window.addEventListener("deluxy:sessione-scaduta", su);
    return () => window.removeEventListener("deluxy:sessione-scaduta", su);
  }, []);

  // Sul login la voce non ha senso: niente numeri prima di essere entrati.
  if (path === "/login") return null;

  const c = carichi["/"];
  return (
    <>
      <a className="topbar-link con-pallini" href="/" aria-current={path === "/" ? "page" : undefined}>
        Richieste
        {c?.quanti ? (
          <span
            className={`sb-quanti${c.urgente ? " urgente" : ""}`}
            title={
              c.urgente
                ? `${c.quanti} da approvare, e a qualcuna serve entro tre giorni`
                : `${c.quanti} da approvare`
            }
          >
            {c.quanti}
          </span>
        ) : null}
        {accesi.has("/") ? (
          <span
            className="sb-pallino"
            title="È arrivato qualcosa di nuovo da quando hai guardato"
            aria-label="novità"
          />
        ) : null}
      </a>
      {scaduta ? (
        <div className="fascia-sessione" role="alert">
          Sessione scaduta — <a href="/login">Rientra</a>
        </div>
      ) : null}
    </>
  );
}
