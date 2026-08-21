"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { EsitoAnnuncioAi } from "@/lib/azioni-annuncio";
import { misuraTesto, oltreIlLimite } from "@/lib/funzioni-annuncio";

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
  ritorno,
  leggiBozza,
  salvaBozza,
  scartaBozza,
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
  /** Dove tornare dopo aver approvato: finisce nel link di Operazioni. */
  ritorno?: string;
  /** Rilegge la bozza salvata per questo gruppo, se c'è. */
  leggiBozza?: (gruppoId: string) => Promise<{ titoli: string; descrizioni: string; finalUrl: string; indicazione: string; aggiornataIl: string } | null>;
  /** Salva la bozza mentre si scrive. */
  salvaBozza?: (input: { gruppoId: string; titoli: string; descrizioni: string; finalUrl: string; indicazione: string }) => Promise<{ salvataIl: string } | { vuota: true }>;
  /** Butta la bozza: dopo la messa in coda, o su richiesta. */
  scartaBozza?: (gruppoId: string) => Promise<void>;
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
  // La bozza: quando è stata salvata l'ultima volta, e se ne è stata ripresa
  // una all'apertura. Sono due informazioni diverse e servono entrambe —
  // «salvata» rassicura mentre si scrive, «ripresa» spiega perché le caselle
  // non erano vuote.
  const [salvataIl, setSalvataIl] = useState<string | null>(null);
  const [ripresaDel, setRipresaDel] = useState<string | null>(null);
  const [caricata, setCaricata] = useState(false);

  const righe = (t: string) => t.split("\n").map((r) => r.trim()).filter(Boolean);
  const titoli = righe(titoliTesto);
  const descrizioni = righe(descrizioniTesto);

  // I limiti sono di Google e non si negoziano: un titolo di 34 caratteri fa
  // rifiutare l'annuncio INTERO. Contarli qui, mentre si scrive, evita di
  // scoprirlo dal registro dopo un giro di script.
  // ⚠️ La lunghezza si misura con le funzioni di Google RESE, non sulla
  // stringa scritta: «{KeyWord:Fresh Flower Delivery}» sono 21 caratteri e non
  // 31, e contarli male qui BLOCCAVA il bottone su titoli perfetti.
  const titoliLunghi = titoli.filter((t) => oltreIlLimite(t, 30));
  const descrizioniLunghe = descrizioni.filter((d) => oltreIlLimite(d, 90));
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

  // ⚠️ Il salvataggio è RITARDATO di un secondo dall'ultima battuta: salvare a
  // ogni tasto vorrebbe dire una scrittura sul database per lettera, e su
  // questo Postgres (connection_limit 5) è il modo migliore per far cadere la
  // pagina mentre si scrive. Il timer si azzera a ogni modifica, quindi
  // scrivendo di seguito si salva una volta sola alla fine.
  //
  // ⚠️ E NON prima che la bozza sia stata caricata: partire a salvare con le
  // caselle ancora vuote cancellerebbe la bozza che si sta per leggere.
  useEffect(() => {
    if (!salvaBozza || !caricata || !dialogo.current?.open) return;
    const t = setTimeout(() => {
      salvaBozza({ gruppoId, titoli: titoliTesto, descrizioni: descrizioniTesto, finalUrl: url, indicazione })
        .then((r) => setSalvataIl("salvataIl" in r ? r.salvataIl : null))
        .catch(() => {
          // Un salvataggio fallito non deve fermare la scrittura: si tace qui
          // e lo si riprova alla battuta dopo. Quello che NON si fa è dire
          // «salvata» quando non lo è.
          setSalvataIl(null);
        });
    }, 1000);
    return () => clearTimeout(t);
  }, [titoliTesto, descrizioniTesto, url, indicazione, caricata, gruppoId, salvaBozza]);

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
          // ⚠️ Si rilegge a OGNI apertura, non una volta sola: la bozza può
          // essere stata scritta da un'altra postazione o in un altro giorno,
          // e mostrarne una vecchia tenuta in memoria sarebbe peggio che non
          // averla.
          if (leggiBozza) {
            leggiBozza(gruppoId).then((b) => {
              setCaricata(true);
              if (!b) return;
              setTitoliTesto(b.titoli);
              setDescrizioniTesto(b.descrizioni);
              if (b.finalUrl) setUrl(b.finalUrl);
              setIndicazione(b.indicazione);
              setRipresaDel(b.aggiornataIl);
              setSalvataIl(b.aggiornataIl);
            });
          } else {
            setCaricata(true);
          }
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
            {/* Perché le caselle non erano vuote: senza dirlo, chi riapre
                pensa che l'app abbia inventato qualcosa. */}
            {ripresaDel && (
              <div className="avviso-ok" style={{ marginBottom: 14 }}>
                Ripresa la bozza lasciata il{" "}
                {new Date(ripresaDel).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.
                {scartaBozza && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="link-come-testo"
                      onClick={async () => {
                        await scartaBozza(gruppoId);
                        setTitoliTesto("");
                        setDescrizioniTesto("");
                        setIndicazione("");
                        setUrl(urlSuggerito ?? "");
                        setRipresaDel(null);
                        setSalvataIl(null);
                      }}
                    >
                      ricomincia da capo
                    </button>
                  </>
                )}
              </div>
            )}
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
                  {" "}· troppo lunghi: {titoliLunghi.map((t) => `«${t}» (${misuraTesto(t).lunghezza})`).join(", ")}
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
                  {" "}· troppo lunghe: {descrizioniLunghe.map((d) => `«${d.slice(0, 30)}…» (${misuraTesto(d).lunghezza})`).join(", ")}
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
              {esitoCoda.ok ? (
                <>
                  {/* ⚠️ Il link, non solo la frase: dire «va approvato in
                      Operazioni» e lasciare l utente a cercarsela e'un vicolo
                      cieco — e da fuori sembra che non sia successo niente. */}
                  Annuncio messo in coda: ora va approvato.{" "}
                  <a href={`/operazioni?torna=${encodeURIComponent(ritorno ?? "/operazioni")}`} style={{ textDecoration: "underline" }}>
                    Vai ad approvarlo
                  </a>
                </>
              ) : (
                esitoCoda.errore
              )}
            </div>
          )}
          {!pronto && (titoli.length > 0 || descrizioni.length > 0) && (
            <div className="cella-sub" style={{ margin: "0 18px 10px", whiteSpace: "normal" }}>
              Manca ancora: {problemi.join(" · ")}.
            </div>
          )}

          <div className="modale-piede">
            {/* Lo stato della bozza sta nel piede, accanto ai bottoni: è lì
                che si guarda prima di chiudere, che è il momento in cui uno si
                chiede se perderà il lavoro. */}
            <span className="cella-sub" style={{ marginRight: "auto" }}>
              {salvataIl
                ? `Bozza salvata alle ${new Date(salvataIl).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} — puoi chiudere e riprendere dopo`
                : titoli.length || descrizioni.length
                ? ""
                : ""}
            </span>
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
                    const r = await accoda({ gruppoId, titoli, descrizioni, finalUrl: url.trim() });
                    setEsitoCoda(r);
                    // ⚠️ La bozza si butta SOLO se è andata in coda davvero:
                    // buttarla su un errore vorrebbe dire perdere il lavoro
                    // proprio nel momento in cui serve riprovare.
                    if (r.ok && scartaBozza) {
                      await scartaBozza(gruppoId);
                      setSalvataIl(null);
                      setRipresaDel(null);
                    }
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
