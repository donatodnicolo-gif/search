"use client";

import { useEffect, useRef, useState } from "react";
import { FINESTRE_KW, type FinestrePerKeyword } from "@/lib/finestre-keyword";
import { formattaEuro, formattaNumero } from "@/lib/dominio";

// Le performance di UNA keyword per finestra, a click sulla parola.
//
// ⚠️ Se la storia non c'è, il pannello lo DICE invece di mostrare zeri: una
// keyword senza righe giornaliere non è una keyword che non ha speso — è una
// di cui non sappiamo, e le due cose portano a decisioni opposte.
export function DettaglioKeyword({
  dati,
  attributo = "data-kw-dettaglio",
  occhiello = "Come va questa parola",
  cosa = "parola",
}: {
  dati: FinestrePerKeyword;
  // Lo stesso pannello serve keyword e annunci: cambia solo l attributo che
  // lo apre e come si chiama la cosa che si sta guardando.
  attributo?: string;
  occhiello?: string;
  cosa?: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [testo, setTesto] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  // I testi dell'annuncio, quando il bottone li porta con sé (sugli annunci
  // sì, sulle keyword no: una parola è già tutta nel titolo del pannello).
  const [testiAnn, setTestiAnn] = useState<{ titoli: string[]; descrizioni: string[]; url: string } | null>(null);

  useEffect(() => {
    const apri = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>(`[${attributo}]`);
      if (!b) return;
      const idKw = b.getAttribute("data-kw-id") ?? "";
      setTesto(b.getAttribute("data-kw-testo") ?? "");
      setId(idKw || null);
      // Perché non ci sono numeri: le due cause sono diverse e vanno dette.
      setMotivo(
        !idKw || !/^[\d-]+:\d+:\d+$/.test(idKw)
          ? "vecchio"
          : !dati[idKw]
            ? "assente"
            : null
      );
      // ⚠️ Si legge SEMPRE, anche quando non c'è: senza il reset, aprendo
      // un secondo annuncio si vedrebbero i testi del primo — che è il modo
      // più efficace per far leggere il testo sbagliato a chi decide.
      const grezziT = b.getAttribute("data-ann-titoli");
      const grezziD = b.getAttribute("data-ann-descrizioni");
      if (grezziT || grezziD) {
        try {
          setTestiAnn({
            titoli: JSON.parse(grezziT ?? "[]"),
            descrizioni: JSON.parse(grezziD ?? "[]"),
            url: b.getAttribute("data-ann-url") ?? "",
          });
        } catch {
          setTestiAnn(null);
        }
      } else {
        setTestiAnn(null);
      }
      dialogo.current?.showModal();
    };
    document.addEventListener("click", apri);
    return () => document.removeEventListener("click", apri);
  }, [dati, attributo]);

  const righe = id ? dati[id] : undefined;

  return (
    <dialog
      ref={dialogo}
      className="modale"
      onClick={(e) => {
        if (e.target === dialogo.current) dialogo.current?.close();
      }}
    >
      <div className="modale-corpo">
        <div className="modale-testa">
          <div>
            <div className="modale-occhiello">{occhiello}</div>
            <div className="modale-titolo">{testo}</div>
          </div>
          <button type="button" className="modale-chiudi" aria-label="Chiudi" onClick={() => dialogo.current?.close()}>
            ✕
          </button>
        </div>

        {/* Prima COSA DICE, poi come va: sono le due domande che uno si fa
            aprendo un annuncio, e in quest'ordine. */}
        {testiAnn && (testiAnn.titoli.length > 0 || testiAnn.descrizioni.length > 0) && (
          <div style={{ padding: "0 18px 14px" }}>
            {testiAnn.url && (
              <div className="cella-sub" style={{ overflowWrap: "anywhere", marginBottom: 8 }}>
                Manda a{" "}
                <a href={testiAnn.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>
                  {testiAnn.url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </div>
            )}
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <div className="cella-sub" style={{ marginBottom: 4 }}>Titoli ({testiAnn.titoli.length})</div>
                <ul className="brief-elenco">
                  {testiAnn.titoli.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
              <div style={{ minWidth: 220, flex: 1 }}>
                <div className="cella-sub" style={{ marginBottom: 4 }}>Descrizioni ({testiAnn.descrizioni.length})</div>
                <ul className="brief-elenco">
                  {testiAnn.descrizioni.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {righe ? (
          <div style={{ padding: "0 18px 18px" }}>
            <table>
              <thead>
                <tr>
                  <th>Finestra</th>
                  <th className="num">Spesa</th>
                  <th className="num">Clic</th>
                  <th className="num">Conv.</th>
                  <th className="num">Incasso</th>
                  <th className="num">Resa</th>
                </tr>
              </thead>
              <tbody>
                {FINESTRE_KW.map((f) => {
                  const v = righe[f.chiave];
                  const resa = v && v.spesa > 0 ? v.ricavi / v.spesa : null;
                  return (
                    <tr key={f.chiave}>
                      <td>
                        <b>{f.nome}</b>
                        <div className="cella-sub">
                          {v ? `${v.giorni} giorn${v.giorni === 1 ? "o" : "i"} con dati` : "nessun giorno con dati"}
                        </div>
                      </td>
                      <td className="num">{v && v.spesa > 0 ? formattaEuro(v.spesa) : "—"}</td>
                      <td className="num">{v && v.clic > 0 ? formattaNumero(v.clic) : "—"}</td>
                      <td className="num">{v && v.conversioni > 0 ? formattaNumero(v.conversioni) : "—"}</td>
                      <td className="num">{v && v.ricavi > 0 ? formattaEuro(v.ricavi) : "—"}</td>
                      <td
                        className="num"
                        style={{ fontWeight: 600, color: resa == null ? undefined : resa >= 3 ? "var(--green)" : resa < 1 ? "var(--red)" : undefined }}
                      >
                        {resa != null ? `${resa.toFixed(1)}×` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
              Dalla storia giorno per giorno che lo script manda dal 10/08/2026: prima di quella data
              i giorni non ci sono, quindi le finestre lunghe possono coprire meno di quanto dicono —
              la colonna «giorni con dati» lo dichiara.
            </p>
          </div>
        ) : (
          <div style={{ padding: "0 18px 18px" }}>
            <div className="modale-avviso">
              {motivo === "vecchio" ? (
                <>
                  <b>Di questa {cosa} non c&apos;è la storia giornaliera.</b> La sua riga porta un
                  identificativo vecchio, quindi lo script non riesce
                  ad agganciarla ai giorni. Si sistema da sé al prossimo giro completo su questo
                  account; i numeri della tabella restano validi, ma sono la fotografia a finestra
                  fissa, non il periodo.
                </>
              ) : (
                <>
                  <b>Nessun giorno con dati per questa {cosa}.</b> O non ha avuto impressioni
                  nell&apos;ultimo anno — lo script manda solo i giorni in cui è comparsa — oppure il
                  carico storico non è ancora passato su questo account. Non vuol dire che abbia
                  speso zero: vuol dire che non lo sappiamo.
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
