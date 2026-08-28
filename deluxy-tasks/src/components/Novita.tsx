"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { avvisaSessioneScaduta } from "./PalliniNav";

// ── I RIQUADRI IN BASSO A DESTRA: «è appena arrivata un'attività» ──
//
// Versione snella dei riquadri del Customer Service (deluxy-messaging,
// Novita.tsx). Qui hanno senso perché quasi tutte le attività **le manda
// qualcun altro**: un'app Deluxy che scrive via API mentre nessuno guarda
// questa pagina. Il pallino sulla voce di menu resta (segnalibro), il riquadro
// dice cosa è appena successo e sparisce (richiamo).
//
// ⚠️ MAI ERRORI NEI TOAST: se la rete manca o la risposta non si capisce, si
// riprova al giro dopo in silenzio. L'unico caso detto è la sessione scaduta,
// e lo dice la fascia in cima (via avvisaSessioneScaduta), non un riquadro.

/** Quanti riquadri a schermo. Oltre, uno solo che li conta. */
const TETTO = 3;
/** Quanto resta a schermo un riquadro, in millisecondi. */
const DURATA = 9000;
/** Ogni quanto si chiede «è successo qualcosa?». */
const RESPIRO = 25000;

type NovitaDto = {
  id: string;
  titolo: string;
  dettaglio: string;
  quando: string;
  link: string;
  gravita: "info" | "attenzione";
  autore: string | null;
};
type InCoda = NovitaDto & { scadeA: number };

export function Novita() {
  const router = useRouter();
  const pathname = usePathname();
  const [coda, setCoda] = useState<InCoda[]>([]);
  const [fermo, setFermo] = useState(false);

  // ⚠️ La pagina in un ref: `chiedi` non deve rinascere a ogni cambio di
  // schermata, o il giro delle chiamate ripartirebbe da capo — e con lui il
  // primo giro, che azzera il cursore e non mostra niente.
  const dove = useRef(pathname);
  useEffect(() => {
    dove.current = pathname;
  }, [pathname]);

  // ⚠️ In un ref e non nello stato: il cursore cambia a ogni giro e non deve
  // ridisegnare niente, né far ripartire il ciclo delle chiamate.
  const da = useRef<string>("");
  const viste = useRef<Set<string>>(new Set());
  const spento = useRef(false);

  const chiedi = useCallback(async () => {
    if (spento.current) return;
    // ⚠️ Sulla pagina di login non si bussa: non c'è ancora una sessione, e il
    // 401 che tornerebbe spegnerebbe il giro prima ancora di essere entrati.
    if (dove.current === "/login") return;
    try {
      const url = da.current ? `/api/novita?da=${encodeURIComponent(da.current)}` : "/api/novita";
      const res = await fetch(url, { cache: "no-store" });
      // ⚠️⚠️ Sessione scaduta: può non arrivare un 401 ma la pagina di login
      // seguita da `fetch` con stato 200. Si guardano le tre cose che lo dicono
      // davvero, e si smette di bussare: della fascia si occupa PalliniNav.
      const ct = res.headers.get("content-type") ?? "";
      if (res.status === 401 || res.redirected || !ct.includes("application/json")) {
        avvisaSessioneScaduta();
        spento.current = true;
        return;
      }
      if (!res.ok) return;
      const d = (await res.json()) as { adesso: string; novita: NovitaDto[]; troncato: boolean };
      // ⚠️⚠️ Il cursore è l'ora del SERVER, rimandata indietro tale e quale: con
      // `Date.now()` del browser un computer avanti di un minuto salterebbe le
      // novità di quel minuto e uno indietro le ripeterebbe per sempre.
      da.current = d.adesso;

      // Doppia cintura: un id già visto non si rifà vedere nemmeno se due
      // chiamate si accavallano.
      const nuove = (d.novita ?? []).filter((a) => !viste.current.has(a.id));
      for (const a of nuove) viste.current.add(a.id);
      if (!nuove.length) return;

      const adesso = Date.now();
      setCoda((c) => {
        // ⚠️⚠️ SE SONO TANTE, UNA SOLA CHE LE CONTA: sette riquadri in colonna
        // coprono la pagina e non li legge nessuno.
        if (nuove.length > TETTO) {
          return [
            {
              id: `riassunto:${adesso}`,
              titolo: `${nuove.length}${d.troncato ? "+" : ""} attività nuove`,
              dettaglio: "Arrivate dalle app Deluxy mentre non guardavi",
              quando: new Date().toISOString(),
              link: "/",
              gravita: nuove.some((a) => a.gravita === "attenzione")
                ? ("attenzione" as const)
                : ("info" as const),
              autore: null,
              scadeA: adesso + DURATA,
            },
            ...c,
          ].slice(0, TETTO);
        }
        // Le nuove in cima e il taglio in fondo: a sparire è la più vecchia,
        // che è anche quella già letta.
        const conNuove = nuove.map((a) => ({ ...a, scadeA: adesso + DURATA }));
        return [...conNuove, ...c].slice(0, TETTO);
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
      // ⚠️ Scheda nascosta: non si chiede niente. Al ritorno si chiede subito
      // con lo STESSO cursore: ciò che è successo nel frattempo arriva insieme.
      if (!document.hidden) await chiedi();
      if (vivo) t = setTimeout(giro, RESPIRO);
    };
    // La prima chiamata prende solo il segnaposto: non mostra niente.
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
        <div key={a.id} className={`novita novita-${a.gravita}`}>
          {/* Tutto il riquadro porta alla cosa di cui parla. */}
          <button
            type="button"
            className="novita-corpo"
            onClick={() => {
              setCoda((c) => c.filter((x) => x.id !== a.id));
              router.push(a.link);
              router.refresh();
            }}
          >
            <span className="novita-dot" aria-hidden />
            <span className="novita-testo">
              <strong>{a.titolo}</strong>
              {a.dettaglio ? <span className="novita-dettaglio">{a.dettaglio}</span> : null}
            </span>
            <span className="novita-ora">
              {new Date(a.quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
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
