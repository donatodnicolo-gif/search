"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { decidiPallini, type Visto } from "@/lib/pallini";
import { avvisaSessioneScaduta } from "./SessioneScaduta";

// Menu laterale. Client component solo per evidenziare la voce attiva
// (usePathname); i conteggi arrivano dal layout (server).
export function Sidebar({
  conteggi,
}: {
  conteggi: { ordini: number; daClassificare: number; clienti: number; liste: number; automazioni: number; script: number; eventi: number; daRiconciliare: number };
}) {
  const path = usePathname();

  // Pallino giallo «è arrivato qualcosa da quando hai guardato» sulle voci con
  // arrivi esterni (Libro UX&UI v1.4 §7, sistema del CS). ⚠️ I NUMERI restano
  // quelli del layout (sb-count, ricalcolati a ogni navigazione): il pallino è
  // un segnalibro personale, non un altro conteggio.
  const accesi = usaPallini(path);

  // Le voci raggruppate per COSA SI STA FACENDO, non per come è fatta l'app.
  // Tre mestieri diversi, che di solito fanno persone diverse in momenti
  // diversi della giornata:
  //  · «Ordini» — quello che è entrato oggi e va lavorato, consegna compresa;
  //  · «Clienti» — chi ha comprato, come si raggruppa, quando ricorrono le sue
  //    occasioni: si guarda quando si pensa, non quando si spedisce;
  //  · «Comunicazione» — i testi e i messaggi che escono verso i clienti. Stanno
  //    insieme perché uno script senza automazione non parte, e un'automazione
  //    senza script non ha niente da dire.
  // «Configurazione» resta in fondo, da sola: ci si va di rado e apposta.
  const sezioni: { titolo: string; voci: { href: string; nome: string; count: number | null; icona: React.ReactNode }[] }[] = [
    {
      titolo: "Ordini",
      voci: [
        { href: "/", nome: "Tutti gli ordini", count: conteggi.ordini, icona: iconaLista },
        { href: "/bacheca", nome: "Bacheca", count: conteggi.daClassificare, icona: iconaBacheca },
        { href: "/consegna", nome: "Consegna", count: null, icona: iconaConsegna },
        { href: "/incassa", nome: "Fatti pagare", count: null, icona: iconaIncassa },
      ],
    },
    {
      // Analisi = i numeri. Il venduto (quanto entra), il margine (quanto resta)
      // e il controllo (se il denaro è arrivato davvero e quanto è uscito).
      titolo: "Analisi",
      voci: [
        { href: "/analisi", nome: "Andamento vendite", count: null, icona: iconaAnalisi },
        { href: "/marketing", nome: "Marketing", count: null, icona: iconaMarketing },
        { href: "/margini", nome: "Margini", count: null, icona: iconaMargini },
        { href: "/controllo", nome: "Controllo incassi", count: conteggi.daRiconciliare, icona: iconaControllo },
      ],
    },
    {
      titolo: "Clienti",
      voci: [
        { href: "/clienti", nome: "Clienti", count: conteggi.clienti, icona: iconaClienti },
        { href: "/liste", nome: "Liste", count: conteggi.liste, icona: iconaListeClienti },
        { href: "/eventi", nome: "Eventi clienti", count: conteggi.eventi, icona: iconaEventi },
      ],
    },
    {
      titolo: "Comunicazione",
      voci: [
        { href: "/script", nome: "Script", count: conteggi.script, icona: iconaScript },
        { href: "/automazioni", nome: "Automazioni", count: conteggi.automazioni, icona: iconaAutomazioni },
      ],
    },
    {
      titolo: "Configurazione",
      voci: [
        { href: "/categorie", nome: "Categorie prodotti", count: null, icona: iconaCategorie },
        { href: "/impostazioni", nome: "Impostazioni", count: null, icona: iconaImpostazioni },
      ],
    },
  ];

  return (
    <nav className="sidebar">
      {sezioni.map((s) => (
        <div className="sb-sezione" key={s.titolo}>
          <div className="sb-label">{s.titolo}</div>
          {s.voci.map((v) => {
            const attiva = v.href === "/" ? path === "/" : path.startsWith(v.href);
            return (
              <a key={v.href} href={v.href} className={`sb-item${attiva ? " attiva" : ""}`} aria-current={attiva ? "page" : undefined}>
                <span className="sb-icona">{v.icona}</span>
                <span className="sb-nome">{v.nome}</span>
                {v.count != null && <span className="sb-count">{v.count.toLocaleString("it-IT")}</span>}
                {/* ⚠️ In FONDO alla riga, mai davanti al nome: le voci devono
                    restare allineate (Libro §7). */}
                {accesi.has(v.href) ? (
                  <span
                    className="sb-pallino"
                    title="È arrivato qualcosa di nuovo da quando l'hai guardata"
                    aria-label="novità"
                  />
                ) : null}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const iconaLista = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
  </svg>
);
const iconaBacheca = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" />
  </svg>
);
const iconaClienti = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M21 20v-1.5a4 4 0 0 0-3-3.87" />
    <path d="M16.5 4.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const iconaListeClienti = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" />
    <path d="m3 6 1.5 1.5L7 5" /><path d="m3 12 1.5 1.5L7 11" /><path d="m3 18 1.5 1.5L7 17" />
  </svg>
);
const iconaEventi = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" />
    <path d="m9 15 1.8 1.8L15 13" />
  </svg>
);
const iconaScript = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" />
    <path d="M9 12h6" /><path d="M9 16h4" />
  </svg>
);
const iconaAutomazioni = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h16v11H7l-3 3z" />
    <path d="M8.5 10.5h.01" /><path d="M12 10.5h.01" /><path d="M15.5 10.5h.01" />
  </svg>
);
const iconaConsegna = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />
    <circle cx="12" cy="15.5" r="2.5" /><path d="M12 14.3v1.4l1 .6" />
  </svg>
);
const iconaAnalisi = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19V5" /><path d="M4 19h16" />
    <path d="M8 16V11" /><path d="M13 16V7" /><path d="M18 16v-4" />
  </svg>
);
const iconaMarketing = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10v4h3l5 3.5v-11L6 10H3z" />
    <path d="M16 9.5a3.5 3.5 0 0 1 0 5" /><path d="M18.5 7a7 7 0 0 1 0 10" />
  </svg>
);
const iconaIncassa = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
    <circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01" /><path d="M18 14.5v.01" />
  </svg>
);
const iconaMargini = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 18 20 6" /><circle cx="7" cy="8" r="2.5" /><circle cx="17" cy="16" r="2.5" />
  </svg>
);
const iconaControllo = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M2.5 10h19" /><path d="m8 14.5 1.6 1.6L13 12.8" />
  </svg>
);
const iconaCategorie = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const iconaImpostazioni = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// ── IL PALLINO GIALLO: «qui è arrivato qualcosa» ──
// Libro UX&UI v1.4 §7 (sistema del Customer Service, `usaPallini` di
// deluxy-messaging/Sidebar.tsx portato qui).
//
// ⚠️⚠️ NON SI CONFRONTANO OROLOGI. Il server dice, per ogni sezione, la data
// della cosa più recente **che c'è**; qui ci si ricorda **l'ultima già vista**
// e si accende il pallino se la prima è più avanti. Se invece si segnasse
// «visto» con `Date.now()` del browser, un computer avanti di un minuto
// avrebbe il pallino sempre acceso e uno indietro non l'avrebbe mai.
//
// ⚠️ «Visto» è una cosa del browser di quella persona, e sta in `localStorage`:
// tenerlo sul server vorrebbe dire una tabella in più per un pallino, e
// «l'ho guardato io» non è un fatto dell'azienda. (Il cookie `orders_visto_fino`
// è un'ALTRA cosa: segna gli ordini nuovi DENTRO la tabella, non nel menu.)
const CHIAVE_VISTO = "orders-sezioni-viste";
// ⚠️ Novanta secondi: il giro gira su ogni pagina, per ogni persona.
// L'immediatezza è dei riquadri in basso a destra (25 s), non del pallino.
const RESPIRO = 90000;

type Carico = { ultimo: string; quanti: number; urgente: boolean };

function usaPallini(path: string): Set<string> {
  const [accesi, setAccesi] = useState<Set<string>>(new Set());

  const guarda = useCallback(async () => {
    // Sul login non c'è sessione: bussare produrrebbe solo la fascia
    // «sessione scaduta» sulla pagina in cui si sta per entrare.
    if (path.startsWith("/login")) return;
    try {
      const res = await fetch("/api/novita/sezioni", { cache: "no-store" });
      // ⚠️ Sessione scaduta: il ramo /api/novita del middleware risponde 401;
      // se un giorno finisse dietro un redirect, `fetch` lo seguirebbe
      // tornando la pagina di login con stato 200: tre spie, non una.
      const ct = res.headers.get("content-type") ?? "";
      if (res.status === 401 || res.redirected || !ct.includes("application/json")) {
        // ⚠️⚠️ QUESTO È IL PUNTO CHE SE NE ACCORGE SEMPRE: la barra laterale
        // c'è su ogni pagina e chiede a intervalli, quindi qualunque schermata
        // si stia guardando la fascia compare entro un giro.
        avvisaSessioneScaduta();
        return;
      }
      if (!res.ok) return; // un errore del server non è una sessione scaduta
      const d = (await res.json()) as { sezioni: Record<string, Carico> };
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
      // La regola sta in src/lib/pallini.ts, che si prova con dei casi
      // (scripts/prova-pallini.mts).
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
    // ⚠️ Si guarda a ogni caricamento di pagina (che qui, con la navigazione a
    // ricaricamento pieno, è anche ogni cambio pagina), poi a tempo.
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

  return accesi;
}
