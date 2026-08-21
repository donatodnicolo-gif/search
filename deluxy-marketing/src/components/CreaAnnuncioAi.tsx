"use client";

import { useRef, useState, useTransition } from "react";
import type { EsitoAnnuncioAi } from "@/lib/azioni-annuncio";

// «Crea con AI»: propone un annuncio responsive nuovo (15 titoli, 4
// descrizioni) per il gruppo, scritto sui suoi numeri veri.
//
// ⚠️ Si ferma alla proposta, e lo dice: creare un annuncio non è fra le
// operazioni che lo script sa eseguire su Google. I testi si copiano — c'è
// il bottone per prenderli tutti — e si incollano in Google Ads.
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
  /** Mette in coda l annuncio proposto. Se manca, il dialogo resta di sola proposta. */
  accoda?: (input: { gruppoId: string; titoli: string[]; descrizioni: string[]; finalUrl: string }) => Promise<{ ok: true; operazioneId: string } | { ok: false; errore: string }>;
  /** La destinazione che il gruppo usa gia: precompila il campo. */
  urlSuggerito?: string | null;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [indicazione, setIndicazione] = useState("");
  const [conFunzioni, setConFunzioni] = useState(false);
  const [esito, setEsito] = useState<EsitoAnnuncioAi | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [inCorso, avvia] = useTransition();
  const [url, setUrl] = useState(urlSuggerito ?? "");
  const [esitoCoda, setEsitoCoda] = useState<{ ok: true; operazioneId: string } | { ok: false; errore: string } | null>(null);
  const [inCoda, avviaCoda] = useTransition();

  const chiedi = () => {
    setCopiato(false);
    avvia(async () => {
      setEsito(await azione({ gruppoId, indicazione, conFunzioniGoogle: conFunzioni }));
    });
  };

  const proposta = esito?.ok ? esito : null;
  const testoDaCopiare = proposta
    ? [
        "TITOLI",
        ...proposta.titoli,
        "",
        "DESCRIZIONI",
        ...proposta.descrizioni,
      ].join("\n")
    : "";

  return (
    <>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          setEsito(null);
          setCopiato(false);
          dialogo.current?.showModal();
        }}
        title="L'AI scrive un annuncio nuovo sui numeri di questo gruppo: keyword, ricerche che convertono e testi già in asta"
      >
        Crea con AI
      </button>

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
              <div className="modale-occhiello">Crea un annuncio con AI</div>
              <div className="modale-titolo">{nomeGruppo}</div>
              <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
                15 titoli e 4 descrizioni scritti sulle keyword del gruppo, sulle ricerche che
                convertono e sui testi già in asta.
              </div>
            </div>
            <button type="button" className="modale-chiudi" aria-label="Chiudi" onClick={() => dialogo.current?.close()}>
              ✕
            </button>
          </div>

          <label className="modale-campo" style={{ margin: "0 18px 10px" }}>
            Cosa deve dire (facoltativo)
            <textarea
              value={indicazione}
              onChange={(e) => setIndicazione(e.target.value)}
              rows={2}
              placeholder="es. spingere la consegna in giornata e i compleanni dell'ultimo minuto"
              style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)", resize: "vertical" }}
            />
          </label>

          <label
            className="cella-sub"
            style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 18px 10px", whiteSpace: "normal" }}
            title="L'inserimento dinamico: Google sostituisce la parola cercata, e il testo di riserva compare quando non ci sta"
          >
            <input type="checkbox" checked={conFunzioni} onChange={(e) => setConFunzioni(e.target.checked)} />
            Usa le funzioni di Google fra graffe — <code>{"{KeyWord:Testo di riserva}"}</code>, al
            massimo in due titoli
          </label>

          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 18px 10px" }}>
            <button type="button" className="btn small" onClick={chiedi} disabled={inCorso}>
              {inCorso ? "L'AI sta scrivendo…" : proposta ? "Riscrivi" : "Scrivi l'annuncio"}
            </button>
            {proposta?.note && (
              <span className="cella-sub" style={{ whiteSpace: "normal" }}>{proposta.note}</span>
            )}
          </div>

          {esito && !esito.ok && <div className="modale-avviso">{esito.errore}</div>}

          {proposta && (
            <>
              <div className="modale-elenco">
                <div className="ga-annuncio" style={{ marginBottom: 6 }}>
                  Titoli <span className="cella-sub">{proposta.titoli.length} su 15</span>
                </div>
                {proposta.titoli.map((t, i) => (
                  <div key={`t${i}`} className="modale-riga" style={{ justifyContent: "space-between" }}>
                    <span className="modale-riga-nome">{t}</span>
                    <span className="cella-sub">{t.length} / 30</span>
                  </div>
                ))}
                <div className="ga-annuncio" style={{ margin: "12px 0 6px" }}>
                  Descrizioni <span className="cella-sub">{proposta.descrizioni.length} su 4</span>
                </div>
                {proposta.descrizioni.map((d, i) => (
                  <div key={`d${i}`} className="modale-riga" style={{ justifyContent: "space-between" }}>
                    <span className="modale-riga-nome">{d}</span>
                    <span className="cella-sub">{d.length} / 90</span>
                  </div>
                ))}
              </div>

              {/* Dove manda l'annuncio: senza, Google non lo crea. Si arriva
                  precompilato con la destinazione che il gruppo usa già — è
                  quasi sempre quella giusta, ed è comunque modificabile. */}
              <label className="modale-campo" style={{ margin: "0 18px 10px" }}>
                Dove manda (pagina di destinazione)
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)" }}
                />
              </label>

              {/* ⚠️ Dal 19/08/2026 l'annuncio si può creare davvero: lo script
                  usa il builder RSA dell'API. Restano i tre cancelli — l'AI
                  propone, la persona sceglie, la coda approva — e qui NON si
                  scrive su Google: si mette in coda. */}
              <div className="modale-avviso">
                Mettendolo in coda <b>non va subito in asta</b>: l&apos;operazione resta da
                approvare in Operazioni, poi la esegue lo script nel gruppo <b>{nomeGruppo}</b> e
                Google la mette in revisione. Se preferisci farlo a mano, i testi si copiano.
              </div>

              {accoda && esitoCoda && (
                <div className={esitoCoda.ok ? "avviso-ok" : "modale-avviso"} style={{ margin: "0 18px 10px" }}>
                  {esitoCoda.ok ? "Annuncio messo in coda: va approvato in Operazioni." : esitoCoda.errore}
                </div>
              )}

              <div className="modale-piede">
                <button type="button" className="btn small btn-secondario" onClick={() => dialogo.current?.close()}>
                  Chiudi
                </button>
                <button
                  type="button"
                  className="btn small btn-secondario"
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
                    disabled={inCoda || esitoCoda?.ok === true}
                    onClick={() => {
                      setEsitoCoda(null);
                      avviaCoda(async () => {
                        setEsitoCoda(
                          await accoda({
                            gruppoId,
                            titoli: proposta.titoli,
                            descrizioni: proposta.descrizioni,
                            finalUrl: url,
                          })
                        );
                      });
                    }}
                  >
                    {esitoCoda?.ok ? "In coda ✓" : inCoda ? "Metto in coda…" : "Metti in coda su Google"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
