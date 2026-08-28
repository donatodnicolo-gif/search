"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { avvisaSessioneScaduta } from "./SessioneScaduta";

// ── I RIQUADRI IN BASSO A DESTRA: «è appena successo» ──
// Libro UX&UI v1.4 §7 (sistema del Customer Service): versione snella di
// deluxy-messaging/Novita.tsx. Qui l'unico arrivo esterno vero sono LE
// ANALISI depositate dal Drive (custode o sessione Claude) mentre nessuno
// guarda: finché non si apriva /analisi non lo sapeva nessuno.
//
// ⚠️ Solo arrivi dall'esterno, MAI esiti di azioni tue e MAI errori: gli
// errori vivono in un banner presso il contesto, non in un riquadro che
// sparisce da solo (Libro §7).
//
// ⚠️ La navigazione di quest'app è a ricaricamento pieno: il segnaposto sta
// in `sessionStorage` (per scheda) così un cambio pagina non fa ripartire il
// giro da zero perdendo le novità.

/** Quanti riquadri a schermo. Oltre, uno solo che li conta. */
const TETTO_A_SCHERMO = 3;
/** Quanto resta a schermo un riquadro, in millisecondi. */
const DURATA = 9000;
/** Ogni quanto si chiede «è successo qualcosa?». */
const RESPIRO = 25000;
const CHIAVE_DA = "marketing-novita-da";

type NovitaDto = {
  id: string;
  tipo: string;
  gruppo: string;
  titolo: string;
  dettaglio: string;
  quando: string;
  link: string;
};
type InCoda = NovitaDto & { scadeA: number };

export function Novita() {
  const [coda, setCoda] = useState<InCoda[]>([]);
  const [fermo, setFermo] = useState(false);

  // ⚠️ In un ref e non nello stato: il cursore cambia a ogni giro e non deve
  // ridisegnare niente.
  const da = useRef<string>("");
  const viste = useRef<Set<string>>(new Set());
  const spento = useRef(false);

  // Il segnaposto sopravvive al cambio pagina (ricaricamento pieno).
  useEffect(() => {
    try {
      da.current = sessionStorage.getItem(CHIAVE_DA) ?? "";
    } catch {
      // finestra privata o dati bloccati: si riparte dal segnaposto vuoto
    }
  }, []);

  const chiedi = useCallback(async () => {
    if (spento.current) return;
    // Sul login non c'è sessione: bussare produrrebbe solo la fascia
    // «sessione scaduta» sulla pagina in cui si sta per entrare.
    if (window.location.pathname.startsWith("/login")) return;
    try {
      const url = da.current ? `/api/novita?da=${encodeURIComponent(da.current)}` : "/api/novita";
      const res = await fetch(url, { cache: "no-store" });
      // ── LA SESSIONE È SCADUTA MENTRE LA SCHEDA ERA APERTA ──
      // ⚠️ Il middleware non risponde 401 ma un redirect verso /login, che
      // `fetch` segue da solo tornando la pagina di login con stato 200: si
      // guardano tutte e tre le spie.
      const ct = res.headers.get("content-type") ?? "";
      if (res.status === 401 || res.redirected || !ct.includes("application/json")) {
        avvisaSessioneScaduta();
        spento.current = true;
        return;
      }
      if (!res.ok) return; // mai errori nei riquadri: si riprova al giro dopo
      const d = (await res.json()) as { adesso: string; novita: NovitaDto[]; troncato: boolean };
      // ⚠️⚠️ Il cursore è l'ora del SERVER, rimandata indietro tale e quale.
      // Con `Date.now()` del browser un computer avanti di un minuto
      // salterebbe le novità di quel minuto e uno indietro le ripeterebbe.
      da.current = d.adesso;
      try {
        sessionStorage.setItem(CHIAVE_DA, d.adesso);
      } catch {
        // pazienza: vale solo per questa pagina
      }

      // Doppia cintura: un id già visto non si rifà vedere nemmeno se due
      // chiamate si accavallano.
      const nuove = (d.novita ?? []).filter((a) => !viste.current.has(a.id));
      for (const a of nuove) viste.current.add(a.id);
      if (!nuove.length) return;

      const adesso = Date.now();
      setCoda((c) => {
        // ⚠️ SE SONO TANTE, UNA SOLA CHE LE CONTA: chi torna dopo un'ora vuole
        // sapere QUANTE cose sono successe, non rileggerle una per una.
        if (nuove.length > TETTO_A_SCHERMO) {
          return [
            {
              id: `riassunto:${adesso}`,
              tipo: "riassunto",
              gruppo: "novità",
              titolo: `${nuove.length}${d.troncato ? "+" : ""} nuove analisi`,
              dettaglio: "Depositate dal Drive mentre non guardavi",
              quando: new Date().toISOString(),
              link: "/analisi",
              scadeA: adesso + DURATA,
            },
            ...c,
          ].slice(0, TETTO_A_SCHERMO);
        }
        // Le nuove in cima e il taglio in fondo: a sparire è la più vecchia.
        const conNuove = nuove.map((a) => ({ ...a, scadeA: adesso + DURATA }));
        return [...conNuove, ...c].slice(0, TETTO_A_SCHERMO);
      });
    } catch {
      // rete assente: al giro dopo. Il cursore non si muove, non si perde niente.
    }
  }, []);

  // ── IL GIRO DELLE CHIAMATE ──
  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setTimeout> | null = null;
    const giro = async () => {
      // ⚠️ SCHEDA NASCOSTA: non si chiede niente. Al ritorno si chiede subito
      // con lo STESSO cursore: ciò che è successo arriva come un riassunto.
      if (!document.hidden) await chiedi();
      if (vivo) t = setTimeout(giro, RESPIRO);
    };
    // La prima chiamata (senza segnaposto) prende solo l'ora: non mostra niente.
    void giro();
    const alRitorno = () => {
      if (!document.hidden) void chiedi();
    };
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      vivo = false;
      if (t) clearTimeout(t);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [chiedi]);

  // ── CHI SPARISCE DA SOLO ──
  // ⚠️ Un orologio solo per tutti: col mouse sopra la pila si FERMA — leggere
  // un avviso e vederselo sparire a metà frase fa cliccare a caso.
  useEffect(() => {
    if (!coda.length) return;
    const t = setInterval(() => {
      if (fermo) {
        setCoda((c) => c.map((a) => ({ ...a, scadeA: a.scadeA + 500 })));
        return;
      }
      const ora = Date.now();
      setCoda((c) => (c.some((a) => a.scadeA <= ora) ? c.filter((a) => a.scadeA > ora) : c));
    }, 500);
    return () => clearInterval(t);
  }, [coda.length, fermo]);

  if (!coda.length) return null;

  return (
    <div
      className="novita-pila"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setFermo(true)}
      onMouseLeave={() => setFermo(false)}
    >
      {coda.map((a) => (
        <div key={a.id} className="novita">
          {/* ⚠️ Tutto il riquadro porta alla cosa di cui parla: un avviso che
              dice «nuova analisi» e poi lascia cercare nell'elenco fa
              perdere più tempo del silenzio. */}
          <button
            type="button"
            className="novita-corpo"
            onClick={() => {
              setCoda((c) => c.filter((x) => x.id !== a.id));
              window.location.href = a.link;
            }}
          >
            <span className={`novita-dot novita-dot-${a.tipo}`} aria-hidden />
            <span className="novita-testo">
              <strong>{a.titolo}</strong>
              {a.dettaglio ? <span className="novita-dettaglio">{a.dettaglio}</span> : null}
            </span>
            <span className="novita-ora">
              {new Date(a.quando).toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </button>
          <button
            type="button"
            className="novita-chiudi"
            aria-label="Chiudi l'avviso"
            title="Chiudi"
            onClick={() => setCoda((c) => c.filter((x) => x.id !== a.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
