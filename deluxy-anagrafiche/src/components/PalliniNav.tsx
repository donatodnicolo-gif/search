"use client";

import { useEffect, useState } from "react";
import { decidiPallini, type Visto } from "@/lib/pallini";
import { avvisaSessioneScaduta } from "./SessioneScaduta";

// ── IL PALLINO GIALLO SULLE VOCI DEL MENU ──
// Libro UX&UI v1.4 §7 (sistema del Customer Service): il pallino dice
// «è arrivato qualcosa da quando HAI guardato» e resta acceso finché non entri
// nella sezione. È un segnalibro personale, non un conteggio: il numero
// accanto (il `sb-count` che la sidebar scrive già dal server) dice quanto
// lavoro c'è, e i due coesistono perché dicono cose diverse.
//
// ⚠️ La sidebar di questa app è un server component e le sue voci sono `<a>`
// a ricaricamento pieno: questo è il pezzetto client che si monta DENTRO la
// voce. Il giro delle chiamate è UNO solo per pagina (singleton di modulo),
// non uno per voce: quattro voci con quattro poll sarebbero quattro volte lo
// stesso lavoro.
//
// ⚠️⚠️ NON SI CONFRONTANO OROLOGI: il server dice la data della cosa più
// recente che c'è, qui ci si ricorda l'ultima GIÀ VISTA (localStorage) e il
// pallino si accende se la prima è più avanti (src/lib/pallini.ts).

const CHIAVE_VISTO = "anagrafiche-sezioni-viste";
// ⚠️ Novanta secondi: l'immediatezza non è del pallino (Libro §7, budget del
// poll). Si chiede anche subito a ogni caricamento pagina — che qui, con la
// navigazione a ricaricamento pieno, è anche «a ogni cambio pagina».
const RESPIRO = 90000;

type Carico = { ultimo: string; quanti: number; urgente: boolean };
type Stato = { accesi: Set<string>; carichi: Record<string, Carico> };

// Lo stato condiviso fra tutte le voci della pagina, fuori da React: parte il
// primo componente che si monta, gli altri si mettono in ascolto.
let stato: Stato = { accesi: new Set(), carichi: {} };
const ascoltatori = new Set<(s: Stato) => void>();
let giroAvviato = false;

async function guarda(): Promise<void> {
  try {
    const res = await fetch("/api/interno/novita/sezioni", { cache: "no-store" });
    // ⚠️ Sessione scaduta: /api/interno risponde 401; ma se un giorno finisse
    // dietro il redirect del middleware, `fetch` lo seguirebbe tornando la
    // pagina di login con stato 200. Si guardano tutte e tre le spie.
    const ct = res.headers.get("content-type") ?? "";
    if (res.status === 401 || res.redirected || !ct.includes("application/json")) {
      // ⚠️⚠️ QUESTO È IL PUNTO CHE SE NE ACCORGE SEMPRE: il poller c'è su ogni
      // pagina, quindi la fascia compare entro un giro qualunque schermata si
      // stia guardando.
      avvisaSessioneScaduta();
      return;
    }
    if (!res.ok) return; // un errore del server non è una sessione scaduta
    const d = (await res.json()) as { sezioni: Record<string, Carico> };

    // ⚠️ Il segnalibro sta nel browser di quella persona: «l'ho guardato io»
    // non è un fatto dell'azienda, e tenerlo sul server vorrebbe dire una
    // tabella in più per un pallino.
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
    // La regola sta in src/lib/pallini.ts, che si prova con dei casi.
    const esito = decidiPallini(d.sezioni, visto, window.location.pathname, mai);
    try {
      localStorage.setItem(CHIAVE_VISTO, JSON.stringify(esito.visto));
    } catch {
      // niente da ricordare: i pallini valgono per questa pagina e basta
    }
    stato = { accesi: new Set(esito.accesi), carichi: d.sezioni };
    for (const dillo of ascoltatori) dillo(stato);
  } catch {
    // rete assente: i pallini restano come stanno
  }
}

function avviaGiro(): void {
  if (giroAvviato) return;
  giroAvviato = true;
  // Il login non ha la sidebar, quindi qui non si arriva mai da /login; la
  // guardia resta per il giorno in cui qualcuno montasse la voce altrove.
  if (window.location.pathname.startsWith("/login")) return;
  void guarda();
  setInterval(() => {
    // ⚠️ Scheda nascosta: non si chiede niente. Al ritorno si chiede subito.
    if (!document.hidden) void guarda();
  }, RESPIRO);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void guarda();
  });
  // Niente smontaggio: la navigazione è a ricaricamento pieno, la pagina che
  // muore si porta via timer e ascoltatori da sola.
}

/**
 * Il pallino di una voce del menu. Si monta DENTRO la `<a class="sb-item">`,
 * dopo il `sb-count`: sta in FONDO alla riga, mai davanti al nome (le voci
 * devono restare allineate).
 */
export function VoceNovita({ href }: { href: string }) {
  const [s, setS] = useState<Stato>(stato);

  useEffect(() => {
    ascoltatori.add(setS);
    avviaGiro();
    setS(stato);
    return () => {
      ascoltatori.delete(setS);
    };
  }, []);

  if (!s.accesi.has(href)) return null;
  return (
    <span
      className="sb-pallino"
      title="È arrivato qualcosa di nuovo da quando l'hai guardata"
      aria-label="novità"
    />
  );
}
