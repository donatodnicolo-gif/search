"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { euro, dataIt } from "@/lib/format";

// LA FATTURA SI APRE IN UNA FINESTRA, COL DOCUMENTO DI FIC DENTRO
// (chiesto dall'utente l'08/09/2026, sulla scheda partner: «al click su fattura
// non aprire la pagina ma un pop-up con anche la schermata di FIC così da non
// cambiare pagina»).
//
// Perché una finestra: nella scheda partner le fatture si guardano mese per
// mese, spesso una dopo l'altra, per controllare che i conti tornino. Aprire
// `/fatture/[id]` fa perdere il posto nei dodici mesi e obbliga a tornare
// indietro ogni volta; la finestra si chiude e la scheda è ancora lì, allo
// stesso punto. È la stessa deroga al §8 del Libro già approvata il 05/09 per i
// movimenti bancari di questa scheda ([MovimentoModale.tsx]) — stesso posto,
// stesso motivo, stesse regole del §9.
//
// ⚠️ COSA C'È DENTRO, E PERCHÉ NON È LA SCHERMATA DI FIC. L'app web di Fatture
// in Cloud NON è incorporabile: `secure.fattureincloud.it` risponde con
// `X-Frame-Options: deny` (verificato l'08/09/2026) ed è giusto così — è la sua
// difesa contro il clickjacking. Dentro la finestra c'è quindi il DOCUMENTO
// come lo stampa FIC (il PDF firmato su `compute.fattureincloud.it`, che non ha
// quella restrizione): cioè la cosa che si va davvero a guardare. Per
// modificare, incassare o mandare allo SDI resta «Apri su Fatture in Cloud», che
// apre FIC in una scheda nuova — quelle sono decisioni, e si prendono a casa
// loro.
//
// ⚠️ Il documento si chiede QUANDO SI APRE la finestra, non quando si carica la
// pagina: una scheda partner ha decine di fatture su dodici mesi, e risolverle
// tutte a monte sarebbe una chiamata di rete a FIC per ognuna — quasi sempre per
// niente. In più l'URL del PDF è firmato (chi ce l'ha lo apre senza password):
// non deve stare nell'HTML di ogni riga, ma arrivare dietro la sessione.

export type FatturaInFinestra = {
  id: string;
  numero: string | null;
  anno: number;
  mese: number;
  tipologia: string;
  imponibile: number;
  aliquotaIva: number;
  scadenza: Date | string | null;
  emissione: Date | string | null;
  pagata: boolean;
  dataPagamento: Date | string | null;
  compensata: boolean;
  incassato: number;
  descrizione: string | null;
  partnerNome: string;
};

type Doc =
  | { stato: "carico" }
  | { stato: "ok"; urlPdf: string | null; urlFic: string; cliente: string | null; totale: number | null; data: string | null }
  | { stato: "no"; motivo: string };

/** Il numero della fattura, che apre la finestra. Resta un <button>: una riga
 *  cliccabile da sola col Tab non si raggiunge (Libro UX&UI §8/§9). */
export function FatturaLink({ fattura, children }: { fattura: FatturaInFinestra; children: React.ReactNode }) {
  const [aperta, setAperta] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-testo"
        title="Apri la fattura in una finestra, col documento di Fatture in Cloud"
        onClick={() => setAperta(true)}
      >
        {children}
      </button>
      {aperta && <Finestra f={fattura} chiudi={() => setAperta(false)} />}
    </>
  );
}

function Riga({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, padding: "9px 0", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ width: 150, flexShrink: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>{etichetta}</div>
      <div style={{ fontSize: 13.5, minWidth: 0, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

function Finestra({ f, chiudi }: { f: FatturaInFinestra; chiudi: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [montata, setMontata] = useState(false);
  const [doc, setDoc] = useState<Doc>({ stato: "carico" });

  useEffect(() => setMontata(true), []);

  // Il documento: una chiamata sola, all'apertura. Se la finestra si chiude
  // prima che risponda, la risposta si butta senza toccare lo stato.
  useEffect(() => {
    if (!f.numero) {
      setDoc({ stato: "no", motivo: "Questa riga non ha un numero di fattura: non c'è un documento su Fatture in Cloud da mostrare." });
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/fic/documento?numero=${encodeURIComponent(f.numero!)}&anno=${f.anno}`);
        const j = await r.json();
        if (!vivo) return;
        if (r.ok && j.ok) {
          setDoc({ stato: "ok", urlPdf: j.urlPdf ?? null, urlFic: j.urlFic, cliente: j.cliente ?? null, totale: j.totale ?? null, data: j.data ?? null });
        } else {
          setDoc({ stato: "no", motivo: j.errore ?? "Fatture in Cloud non ha risposto." });
        }
      } catch {
        if (vivo) setDoc({ stato: "no", motivo: "Non sono riuscito a contattare Fatture in Cloud." });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [f.numero, f.anno]);

  useEffect(() => {
    const partenza = document.activeElement as HTMLElement | null;
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        chiudi();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const fuocabili = Array.from(
        box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])')
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

  const ivato = f.imponibile * (1 + f.aliquotaIva / 100);
  const residuo = Math.max(0, ivato - f.incassato);

  return createPortal(
    <div className="modal-overlay" onClick={chiudi} role="dialog" aria-modal="true" aria-label={`Fattura ${f.numero ?? "senza numero"}`}>
      <div className="modal-box larga" ref={box} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              Fattura {f.numero ?? "s.n."} · {f.tipologia}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {f.partnerNome} · {euro(f.imponibile)} +IVA {f.aliquotaIva}% → <strong>{euro(ivato)}</strong>
            </div>
          </div>
          <button className="modal-chiudi" type="button" aria-label="Chiudi" onClick={chiudi}>✕</button>
        </div>

        <div className="modal-body">
          <Riga etichetta="Stato">
            {f.pagata ? (
              <span className="badge green">
                <span className="dot" />
                Saldata{f.dataPagamento ? ` ${dataIt(f.dataPagamento)}` : ""}
              </span>
            ) : f.compensata ? (
              <span className="badge blue"><span className="dot" />In compensazione</span>
            ) : f.scadenza && new Date(f.scadenza) < new Date() ? (
              <span className="badge red"><span className="dot" />Scaduta</span>
            ) : (
              <span className="badge orange"><span className="dot" />Da incassare</span>
            )}
            {!f.pagata && f.incassato > 0.005 && (
              <span className="muted" style={{ marginLeft: 8 }}>
                incassati {euro(f.incassato)} · restano {euro(residuo)}
              </span>
            )}
          </Riga>
          <Riga etichetta="Competenza">{`${String(f.mese).padStart(2, "0")}/${f.anno}`}</Riga>
          <Riga etichetta="Emissione">{f.emissione ? dataIt(f.emissione) : <span className="muted">non indicata</span>}</Riga>
          <Riga etichetta="Scadenza">{f.scadenza ? dataIt(f.scadenza) : <span className="muted">non indicata</span>}</Riga>
          {f.descrizione && <Riga etichetta="Descrizione">{f.descrizione}</Riga>}

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Il documento su Fatture in Cloud</div>
              {doc.stato === "ok" && doc.cliente && (
                <div className="muted" style={{ fontSize: 12 }}>
                  intestata a {doc.cliente}
                  {doc.totale != null ? ` · ${euro(doc.totale)}` : ""}
                </div>
              )}
            </div>

            {doc.stato === "carico" && (
              <div className="doc-fic" style={{ display: "grid", placeItems: "center" }}>
                <span className="muted" style={{ fontSize: 13 }}>Sto chiedendo il documento a Fatture in Cloud…</span>
              </div>
            )}

            {doc.stato === "no" && (
              // ⚠️ Il motivo si riporta com'è: «non c'è» e «non riesco a
              // leggerlo» portano a due azioni diverse, e nasconderlo dietro un
              // «non disponibile» costringe a rifare tutto per scoprirlo.
              <div className="doc-fic" style={{ display: "grid", placeItems: "center", padding: 20, textAlign: "center" }}>
                <span className="muted" style={{ fontSize: 13 }}>{doc.motivo}</span>
              </div>
            )}

            {doc.stato === "ok" && doc.urlPdf && (
              <iframe className="doc-fic" src={doc.urlPdf} title={`Documento della fattura ${f.numero ?? ""} su Fatture in Cloud`} />
            )}
            {doc.stato === "ok" && !doc.urlPdf && (
              <div className="doc-fic" style={{ display: "grid", placeItems: "center", padding: 20, textAlign: "center" }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  Fatture in Cloud ha il documento ma non ne pubblica la stampa: si apre di là.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <Link href={`/fatture/${f.id}`} className="btn secondary small">Apri la scheda intera →</Link>
          {doc.stato === "ok" && (
            // La schermata di FIC non si può incorporare (X-Frame-Options):
            // si apre in una scheda nuova, così questa resta dov'era.
            <a href={doc.urlFic} target="_blank" rel="noopener noreferrer" className="btn secondary small">
              Apri su Fatture in Cloud ↗
            </a>
          )}
          <button className="btn small" type="button" onClick={chiudi} style={{ marginLeft: "auto" }}>Chiudi</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
