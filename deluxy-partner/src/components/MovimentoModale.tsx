"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { euro, dataIt } from "@/lib/format";

// IL DETTAGLIO DI UN MOVIMENTO SI APRE IN UNA FINESTRA, SENZA CAMBIARE PAGINA
// (chiesto dall'utente il 04/09/2026, sulla scheda partner).
//
// Perché una finestra e non la pagina `/movimenti/[id]`: nella scheda partner i
// movimenti si guardano UNO DOPO L'ALTRO per capire quali sono davvero del
// partner. Cambiare pagina fa perdere il posto nell'elenco e obbliga a tornare
// indietro a ogni riga; la finestra si chiude e l'elenco è ancora lì, con le
// stesse righe e lo stesso scorrimento.
//
// La pagina intera resta e resta raggiungibile: dalla finestra c'è «Apri la
// scheda intera», che porta a `/movimenti/[id]` (dove ci sono anche gli altri
// movimenti della stessa controparte). La finestra non è il solo posto dove
// vive il dato: è una scorciatoia di lettura, e non ci si decide niente.
//
// Regole del Libro UX&UI v1.7 §9 rispettate qui: ✕ obbligatoria in testata
// sticky, chiusura con ESC e col click sullo scrim, fuoco che entra nella
// finestra e TORNA al punto di partenza alla chiusura, fuoco che non esce dalla
// finestra col Tab, tetto d'altezza dentro la viewport (classi `modal-*` del
// foglio di stile, già collaudate a 375×812 e 1366×768).

export type MovimentoDettaglio = {
  id: string;
  data: Date | string;
  importo: number;
  divisa: string;
  descrizione: string;
  controparte: string | null;
  ibanControparte: string | null;
  fonte: string | null;
  stato: string;
  esito: string | null;
  createdAt: Date | string;
  partnerId: string | null;
  partnerNome: string | null;
  categoriaNome: string | null;
  categoriaDa: string | null;
  categoriaNota: string | null;
  // Colore e nome del tipo di costo li calcola il server con la mappa di
  // `categorie-spesa.ts`: quel file importa `env` (roba di server), e tirarlo
  // dentro un componente client si porterebbe appresso codice che qui non deve
  // stare. Meglio due campi già pronti che una mappa ricopiata.
  categoriaBadge: string | null;
  categoriaEtichetta: string | null;
};

// Clic che NON aprono la finestra: sono comandi con una vita loro (i bottoni
// «Scollega», «Non è di questo partner», «Ripristina» e le loro conferme).
const COMANDI = "a, button, input, select, textarea, label, details, summary, dialog, [role='dialog']";

const ApriContesto = createContext<() => void>(() => {});

/** Il testo dentro la riga che apre la finestra: serve alla tastiera e ai
 *  lettori di schermo, che sulla riga non arriverebbero. */
export function ApriDettaglio({ children, title, forte }: { children: ReactNode; title?: string; forte?: boolean }) {
  const apri = useContext(ApriContesto);
  return (
    <button type="button" className="btn-testo" style={forte ? { fontWeight: 500 } : undefined} title={title} onClick={apri}>
      {children}
    </button>
  );
}

/** La riga della tabella: tutta cliccabile, apre la finestra del movimento. */
export function RigaMovimento({ movimento, children }: { movimento: MovimentoDettaglio; children: ReactNode }) {
  const [aperto, setAperto] = useState(false);
  return (
    <ApriContesto.Provider value={() => setAperto(true)}>
      <tr
        className="riga-link"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(COMANDI)) return;
          // selezionare del testo nella riga non deve aprire niente
          if (window.getSelection()?.toString()) return;
          setAperto(true);
        }}
      >
        {children}
      </tr>
      {aperto && <Finestra m={movimento} chiudi={() => setAperto(false)} />}
    </ApriContesto.Provider>
  );
}

function Riga({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, padding: "9px 0", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ width: 170, flexShrink: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>{etichetta}</div>
      <div style={{ fontSize: 13.5, minWidth: 0, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

function BadgeStato({ stato }: { stato: string }) {
  if (stato === "registrata") return <span className="badge green"><span className="dot" />registrata</span>;
  if (stato === "ignorata") return <span className="badge neutral"><span className="dot" />ignorata</span>;
  return <span className="badge orange"><span className="dot" />da lavorare</span>;
}

function Finestra({ m, chiudi }: { m: MovimentoDettaglio; chiudi: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [montata, setMontata] = useState(false);

  useEffect(() => setMontata(true), []);

  useEffect(() => {
    // da dove veniva il fuoco: alla chiusura ci torna (ARIA APG)
    const partenza = document.activeElement as HTMLElement | null;
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        chiudi();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const fuocabili = Array.from(
        box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (fuocabili.length === 0) return;
      const primo = fuocabili[0];
      const ultimo = fuocabili[fuocabili.length - 1];
      if (e.shiftKey && document.activeElement === primo) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primo.focus();
      }
    };
    document.addEventListener("keydown", suTasto, true);
    const t = setTimeout(() => box.current?.querySelector<HTMLElement>(".modal-chiudi")?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", suTasto, true);
      clearTimeout(t);
      partenza?.focus?.();
    };
  }, [chiudi]);

  if (!montata) return null;

  const uscita = m.importo < 0;
  const daQonto = (m.fonte ?? "").startsWith("Qonto");

  // Fuori dalla tabella: dentro un <td> la finestra erediterebbe gli overflow
  // del contenitore che scorre, e verrebbe tagliata.
  return createPortal(
    <div className="modal-overlay" onClick={chiudi} role="dialog" aria-modal="true" aria-label="Dettaglio del movimento bancario">
      <div className="modal-box" ref={box} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{m.controparte ?? "Movimento senza controparte"}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {uscita ? "Uscita" : "Entrata"} di <strong className={uscita ? "neg" : "pos"}>{euro(Math.abs(m.importo))}</strong>{" "}
              del {dataIt(m.data)} · {daQonto ? "arrivata da Qonto" : "caricata da file"}
            </div>
          </div>
          <button className="modal-chiudi" type="button" aria-label="Chiudi" onClick={chiudi}>✕</button>
        </div>

        <div className="modal-body">
          <Riga etichetta="Data">{dataIt(m.data)}</Riga>
          <Riga etichetta="Importo">
            <span className={uscita ? "neg" : "pos"} style={{ fontWeight: 600 }}>
              {uscita ? "−" : "+"}
              {euro(Math.abs(m.importo))}
            </span>{" "}
            <span className="muted">{m.divisa}</span>
          </Riga>
          <Riga etichetta="Controparte">{m.controparte ?? <span className="muted">non indicata</span>}</Riga>
          <Riga etichetta="IBAN controparte">
            {m.ibanControparte ?? <span className="muted">non presente nell&apos;estratto</span>}
          </Riga>
          <Riga etichetta="Causale (per intero)">{m.descrizione}</Riga>
          <Riga etichetta="Da dove arriva">{m.fonte ?? <span className="muted">non indicata</span>}</Riga>
          <Riga etichetta="Registrato in archivio il">{dataIt(m.createdAt)}</Riga>
          <Riga etichetta="Stato in riconciliazione">
            <BadgeStato stato={m.stato} />
            {m.esito && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{m.esito}</div>}
          </Riga>
          <Riga etichetta="Partner collegato">
            {m.partnerId && m.partnerNome ? (
              <Link href={`/partner/${m.partnerId}`}>{m.partnerNome}</Link>
            ) : (
              // ⚠️ La differenza che conta in questa scheda: un movimento senza
              // partner è un CANDIDATO trovato per somiglianza di nome, non una
              // cosa del partner. Detto qui, dove si guarda il singolo caso.
              <span className="muted">
                nessuno — questo movimento non è attribuito a nessun partner: compare in questa scheda solo
                perché la controparte somiglia al nome
              </span>
            )}
          </Riga>
          {uscita && (
            <>
              <Riga etichetta="Categoria di costo">
                {m.categoriaNome ? (
                  <>
                    {m.categoriaEtichetta && (
                      <span className={`badge ${m.categoriaBadge ?? "neutral"}`} style={{ marginRight: 8 }}>
                        <span className="dot" />
                        {m.categoriaEtichetta}
                      </span>
                    )}
                    {m.categoriaNome}
                  </>
                ) : (
                  <span className="muted">ancora senza categoria</span>
                )}
              </Riga>
              <Riga etichetta="Chi l'ha decisa">
                {m.categoriaDa === "manuale" ? (
                  <span className="badge green"><span className="dot" />a mano</span>
                ) : m.categoriaDa === "regola" ? (
                  <span className="badge neutral"><span className="dot" />una regola di Budgets</span>
                ) : m.categoriaDa === "ai" ? (
                  <span className="badge purple"><span className="dot" />l&apos;AI — è una proposta</span>
                ) : (
                  <span className="muted">nessuno</span>
                )}
                {m.categoriaNota && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{m.categoriaNota}</div>}
              </Riga>
            </>
          )}
        </div>

        <div className="modal-foot">
          <Link href={`/movimenti/${m.id}`} className="btn secondary small">Apri la scheda intera →</Link>
          {uscita && (
            <Link href={`/spese/${m.id}`} className="btn secondary small">
              {m.categoriaNome ? "Cambia categoria in Spese →" : "Assegna una categoria in Spese →"}
            </Link>
          )}
          <button className="btn small" type="button" onClick={chiudi} style={{ marginLeft: "auto" }}>Chiudi</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
