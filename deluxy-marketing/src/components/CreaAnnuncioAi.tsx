"use client";

import { useRef, useState, useTransition } from "react";
import type { EsitoAnnuncioAi } from "@/lib/azioni-annuncio";

// Un annuncio responsive NUOVO per il gruppo: scritto dall'AI sui numeri veri,
// oppure a mano — e in ogni caso modificabile prima di partire.
//
// ⚠️ L'AI RIEMPIE I CAMPI, NON LI SOSTITUISCE. È la differenza che conta: la
// proposta finisce dentro le stesse caselle in cui si scriverebbe a mano, così
// «l'ha scritto l'AI» e «l'ho scritto io» non sono due strade diverse ma la
// stessa strada con un aiuto facoltativo. Chi vuole correggere una parola non
// deve ricominciare da capo, e chi non vuole l'AI non passa da un percorso di
// serie B. È lo stesso disegno del brief AI su «Crea campagna» (17/08/2026).
//
// ⚠️ LA DESTINAZIONE SI CHIEDE PRIMA, non dopo la proposta. Se si sta cambiando
// landing — ed è il caso in cui questo dialogo serve di più — l'AI deve
// scrivere per la pagina NUOVA: mandarla a leggere quella vecchia e poi
// cambiare l'URL in fondo produrrebbe un annuncio che parla di un'altra cosa.
export function CreaAnnuncioAi({
  gruppoId,
  nomeGruppo,
  azione,
  accoda,
  urlSuggerito,
}: {
  gruppoId: string;
  nomeGruppo: string;
  azione: (input: {
    gruppoId: string;
    indicazione: string;
    conFunzioniGoogle: boolean;
  }) => Promise<EsitoAnnuncioAi>;
  /** Mette in coda l'annuncio. Se manca, il dialogo resta di sola proposta. */
  accoda?: (input: {
    gruppoId: string;
    titoli: string[];
    descrizioni: string[];
    finalUrl: string;
  }) => Promise<{ ok: true; operazioneId: string } | { ok: false; errore: string }>;
  /** La destinazione che il gruppo usa già: precompila il campo. */
  urlSuggerito?: string | null;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [indicazione, setIndicazione] = useState("");
  const [conFunzioni, setConFunzioni] = useState(false);
  const [erroreAi, setErroreAi] = useState<string | null>(null);
  const [noteAi, setNoteAi] = useState<string | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [inCorso, avvia] = useTransition();

  const [url, setUrl] = useState(urlSuggerito ?? "");
  // I testi vivono in due caselle, una riga per titolo e una per descrizione:
  // è la forma in cui si incollano da un foglio e in cui l'AI li consegna.
  const [titoliTesto, setTitoliTesto] = useState("");
  const [descrizioniTesto, setDescrizioniTesto] = useState("");
  const [esitoCoda, setEsitoCoda] = useState<
    { ok: true; operazioneId: string } | { ok: false; errore: string } | null
  >(null);
  const [inCoda, avviaCoda] = useTransition();

  const righe = (t: string) => t.split("\n").map((r) => r.trim()).filter(Boolean);
  const titoli = righe(titoliTesto);
  const descrizioni = righe(descrizioniTesto);

  // I limiti sono di Google e non si negoziano: un titolo di 34 caratteri fa
  // rifiutare l'annuncio INTERO. Contarli qui, mentre si scrive, evita di
  // scoprirlo dal registro dopo un giro di script.
  const titoliLunghi = titoli.filter((t) => t.length > 30);
  const descrizioniLunghe = descrizioni.filter((d) => d.length > 90);
  const problemi: string[] = [];
  if (titoli.length < 3) problemi.push(`servono almeno 3 titoli (ce ne sono ${titoli.length})`);
  if (descrizioni.length < 2) problemi.push(`servono almeno 2 descrizioni (ce ne sono ${descrizioni.length})`);
  if (!url.trim()) problemi.push("manca la pagina di destinazione");
  else if (!/^https?:\/\//i.test(url.trim())) problemi.push("la destinazione deve cominciare con http:// o https://");
  if (titoliLunghi.length) problemi.push(`${titoliLunghi.length} titoli oltre i 30 caratteri`);
  if (descrizioniLunghe.length) problemi.push(`${descrizioniLunghe.length} descrizioni oltre i 90`);
  const pronto = problemi.length === 0;

  const chiedi = () => {
    setCopiato(false);
    setErroreAi(null);
    avvia(async () => {
      const e = await azione({ gruppoId, indicazione, conFunzioniGoogle: conFunzioni });
      if (e.ok) {
        // ⚠️ Si RIEMPIONO le caselle: da qui in poi i testi sono modificabili
        // come se li avesse scritti una persona.
        setTitoliTesto(e.titoli.join("\n"));
        setDescrizioniTesto(e.descrizioni.join("\n"));
        setNoteAi(e.note ?? null);
      } else {
        setErroreAi(e.errore);
      }
    });
  };

  const testoDaCopiare = ["TITOLI", ...titoli, "", "DESCRIZIONI", ...descrizioni].join("\n");

  const stileArea: React.CSSProperties = {
    font: "inherit",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--hairline-strong)",
    resize: "vertical",
    width: "100%",
  };

  return (
    <>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          setEsitoCoda(null);
          setCopiato(false);
          dialogo.current?.showModal();
        }}
        title="Scrivi un annuncio nuovo per questo gruppo: a mano, oppure lasciandolo scrivere all'AI sui numeri veri del gruppo"
      >
        Nuovo annuncio
      </button>

      <dialog
        ref={dialogo}
        className="modale"
        onClick={(e) => {
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
      >
        {/* ⚠️ `.modale-elenco` scorre solo se è FIGLIO DIRETTO di
            `.modale-corpo`: un contenitore in mezzo manda il piede fuori
            schermo. Trappola già pagata con PortaKeyword. */}
        <div className="modale-corpo">
          <div className="modale-testa">
            <div>
              <div className="modale-occhiello">Nuovo annuncio responsive</div>
              <div className="modale-titolo">{nomeGruppo}</div>
              <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
                Scrivili tu, oppure falli scrivere all&apos;AI sulle keyword del gruppo e sulle
                ricerche che convertono: in ogni caso restano modificabili qui sotto.
              </div>
            </div>
            <button type="button" className="modale-chiudi" aria-label="Chiudi" onClick={() => dialogo.current?.close()}>
              ✕
            </button>
          </div>

          <div className="modale-elenco" style={{ paddingTop: 14, paddingBottom: 14 }}>
            {/* La destinazione PER PRIMA: è quella che decide cosa deve dire
                l'annuncio, quindi va scelta prima di scriverlo. */}
            <label className="modale-campo" style={{ marginBottom: 14 }}>
              Dove manda (pagina di destinazione)
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                style={{ ...stileArea, resize: undefined }}
              />
              {urlSuggerito && url.trim() !== urlSuggerito && (
                <span className="cella-sub">
                  Il gruppo oggi manda a {urlSuggerito} —{" "}
                  <button
                    type="button"
                    className="link-come-testo"
                    onClick={() => setUrl(urlSuggerito)}
                  >
                    rimetti quella
                  </button>
                </span>
              )}
            </label>

            {/* ── L'aiuto dell'AI, facoltativo ──────────────────────────── */}
            <div className="brief-blocco" style={{ marginTop: 0, marginBottom: 14 }}>
              <div className="brief-sotto">Farli scrivere all&apos;AI (facoltativo)</div>
              <label className="modale-campo" style={{ marginBottom: 8 }}>
                Cosa deve dire
                <textarea
                  value={indicazione}
                  onChange={(e) => setIndicazione(e.target.value)}
                  rows={2}
                  placeholder="es. spingere la consegna in giornata e i compleanni dell'ultimo minuto"
                  style={stileArea}
                />
              </label>
              <label
                className="cella-sub"
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, whiteSpace: "normal" }}
                title="L'inserimento dinamico: Google sostituisce la parola cercata, e il testo di riserva compare quando non ci sta"
              >
                <input type="checkbox" checked={conFunzioni} onChange={(e) => setConFunzioni(e.target.checked)} />
                Usa le funzioni di Google fra graffe — <code>{"{KeyWord:Testo di riserva}"}</code>
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn small btn-secondario" onClick={chiedi} disabled={inCorso}>
                  {inCorso ? "L'AI sta scrivendo…" : titoli.length ? "Riscrivi con l'AI" : "Scrivi con l'AI"}
                </button>
                {noteAi && <span className="cella-sub" style={{ whiteSpace: "normal" }}>{noteAi}</span>}
              </div>
              {erroreAi && <div className="modale-avviso" style={{ marginTop: 8 }}>{erroreAi}</div>}
              {titoli.length > 0 && (
                <div className="cella-sub" style={{ marginTop: 8, whiteSpace: "normal" }}>
                  ⚠️ Riscrivendo con l&apos;AI si sostituisce quello che c&apos;è nelle caselle qui
                  sotto, correzioni comprese.
                </div>
              )}
            </div>

            {/* ── I testi, sempre modificabili ──────────────────────────── */}
            <label className="modale-campo" style={{ marginBottom: 4 }}>
              Titoli — uno per riga, massimo 30 caratteri l&apos;uno
              <textarea
                value={titoliTesto}
                onChange={(e) => setTitoliTesto(e.target.value)}
                rows={8}
                placeholder={"Consegna Fiori a Milano\nBouquet Firmati\nOrdina Entro Mezzogiorno"}
                style={stileArea}
              />
            </label>
            <div className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
              {titoli.length} su 15{titoli.length > 15 ? " — oltre i primi 15 non partono" : ""}
              {titoliLunghi.length > 0 && (
                <span style={{ color: "var(--orange)" }}>
                  {" "}· troppo lunghi: {titoliLunghi.map((t) => `«${t}» (${t.length})`).join(", ")}
                </span>
              )}
            </div>

            <label className="modale-campo" style={{ marginBottom: 4 }}>
              Descrizioni — una per riga, massimo 90 caratteri l&apos;una
              <textarea
                value={descrizioniTesto}
                onChange={(e) => setDescrizioniTesto(e.target.value)}
                rows={5}
                placeholder={"Bouquet composti a mano dai nostri fioristi e consegnati con cura."}
                style={stileArea}
              />
            </label>
            <div className="cella-sub" style={{ whiteSpace: "normal" }}>
              {descrizioni.length} su 4{descrizioni.length > 4 ? " — oltre le prime 4 non partono" : ""}
              {descrizioniLunghe.length > 0 && (
                <span style={{ color: "var(--orange)" }}>
                  {" "}· troppo lunghe: {descrizioniLunghe.map((d) => `«${d.slice(0, 30)}…» (${d.length})`).join(", ")}
                </span>
              )}
            </div>
          </div>

          {/* ⚠️ Cosa succede davvero premendo: non va in asta adesso. */}
          <div className="modale-avviso">
            {accoda ? (
              <>
                Mettendolo in coda <b>non va subito in asta</b>: resta da approvare in Operazioni,
                poi lo script lo crea nel gruppo <b>{nomeGruppo}</b> e Google lo mette in
                revisione. Passa anche dal lint di tono (7.2/7.3), come il lancio di una campagna.
              </>
            ) : (
              <>
                Questi testi <b>non vanno su Google da qui</b>: copiali e incollali in Google Ads,
                nel gruppo <b>{nomeGruppo}</b>.
              </>
            )}
          </div>

          {esitoCoda && (
            <div className={esitoCoda.ok ? "avviso-ok" : "modale-avviso"} style={{ margin: "0 18px 10px" }}>
              {esitoCoda.ok
                ? "Annuncio messo in coda: ora va approvato in Operazioni."
                : esitoCoda.errore}
            </div>
          )}
          {!pronto && (titoli.length > 0 || descrizioni.length > 0) && (
            <div className="cella-sub" style={{ margin: "0 18px 10px", whiteSpace: "normal" }}>
              Manca ancora: {problemi.join(" · ")}.
            </div>
          )}

          <div className="modale-piede">
            <button type="button" className="btn small btn-secondario" onClick={() => dialogo.current?.close()}>
              Chiudi
            </button>
            <button
              type="button"
              className="btn small btn-secondario"
              disabled={titoli.length === 0}
              onClick={async () => {
                await navigator.clipboard.writeText(testoDaCopiare);
                setCopiato(true);
              }}
            >
              {copiato ? "Copiato ✓" : "Copia tutto"}
            </button>
            {accoda && (
              <button
                type="button"
                className="btn small"
                disabled={!pronto || inCoda || esitoCoda?.ok === true}
                onClick={() => {
                  setEsitoCoda(null);
                  avviaCoda(async () => {
                    setEsitoCoda(
                      await accoda({ gruppoId, titoli, descrizioni, finalUrl: url.trim() })
                    );
                  });
                }}
              >
                {esitoCoda?.ok ? "In coda ✓" : inCoda ? "Metto in coda…" : "Metti in coda su Google"}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
