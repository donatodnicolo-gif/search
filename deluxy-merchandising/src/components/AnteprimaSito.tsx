"use client";

// **Com'è la scheda sul sito, mentre la stai scrivendo.**
//
// Richiesta dell'utente (09/09/2026): «sarebbe ideale nelle tab che crei per
// sito avere la vista online del prodotto anche in fase "approvato" con
// possibilità di modifica con una matitina».
//
// ⚠️ **Non è una decorazione: è l'unico posto dove si vede l'ordine vero.**
// Sul negozio il tema costruisce una tab per ogni `<h6>` della descrizione,
// nell'ordine in cui li trova — e quell'ordine viene da `SezioneCategoria`,
// che si imposta in un'altra pagina. Chi compila i campi uno sotto l'altro non
// ha modo di sapere come usciranno; qui li vede nella sequenza giusta.
//
// ⚠️ Si mostra **anche quando il prodotto non è pubblicato**: è in fase
// «approvato» che si decide se la scheda è pronta, e prima d'ora bisognava
// pubblicarla per scoprirlo.
//
// La matitina non apre niente di nuovo: porta al campo che scrive quella tab.
// Due posti dove modificare la stessa cosa sarebbero due verità.

import { useState } from "react";

export type SezioneAnteprima = { nome: string; valore: string; campoId: string };

/** «Etichetta: valore» → l'etichetta in grassetto, come fa il tema. */
function Punto({ testo }: { testo: string }) {
  const i = testo.indexOf(":");
  if (i > 0 && i <= 28) {
    return (
      <>
        <b>{testo.slice(0, i).trim()}</b>: {testo.slice(i + 1).trim()}
      </>
    );
  }
  return <>{testo}</>;
}

export function AnteprimaSito({
  sito,
  punti,
  descrizione,
  sezioni,
  urlOnline,
}: {
  sito: string;
  punti: string[];
  descrizione: string;
  sezioni: SezioneAnteprima[];
  urlOnline?: string | null;
}) {
  // Solo le sezioni **con qualcosa dentro** diventano una tab: è la stessa
  // regola della composizione, che salta i valori vuoti invece di stampare un
  // titolo sotto cui non c'è niente.
  const piene = sezioni.filter((s) => s.valore.trim());
  const tab = [
    ...(descrizione.trim() ? [{ nome: "DESCRIZIONE", valore: descrizione, campoId: "descrizione" }] : []),
    ...piene,
  ];
  const [apertaVoluta, setAperta] = useState<string | null>(null);
  // ⚠️ Lo stato è solo un'intenzione: se la tab scelta sparisce perché si è
  // svuotato il campo, si ricade sulla prima invece di restare su una tab che
  // non c'è più (e mostrare il vuoto senza dire perché).
  const aperta = apertaVoluta && tab.some((t) => t.nome === apertaVoluta) ? apertaVoluta : tab[0]?.nome ?? null;
  const contenuto = tab.find((t) => t.nome === aperta) ?? null;

  function vaiAlCampo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    (el as HTMLElement).focus({ preventScroll: true });
  }

  const puntiVeri = punti.map((p) => p.trim()).filter(Boolean);

  return (
    <div className="anteprima-sito">
      <div className="anteprima-testa">
        <span className="anteprima-etichetta">Come si vede su {sito}</span>
        {urlOnline && (
          <a className="anteprima-link" href={urlOnline} target="_blank" rel="noreferrer">
            Apri la scheda online ↗
          </a>
        )}
      </div>

      {puntiVeri.length > 0 && (
        <ul className="anteprima-punti">
          {puntiVeri.map((p, i) => (
            <li key={i}>
              <Punto testo={p} />
            </li>
          ))}
        </ul>
      )}

      {tab.length === 0 ? (
        <p className="cella-sub">
          Nessuna tab: senza testo libero e senza sezioni compilate, sul sito questa scheda esce solo
          con i punti qui sopra.
        </p>
      ) : (
        <>
          <div className="anteprima-tab" role="tablist">
            {tab.map((t) => (
              <button
                key={t.nome}
                type="button"
                role="tab"
                aria-selected={t.nome === aperta}
                className={`anteprima-tab-voce${t.nome === aperta ? " attiva" : ""}`}
                onClick={() => setAperta(t.nome)}
              >
                {t.nome}
              </button>
            ))}
          </div>
          {contenuto && (
            <div className="anteprima-corpo" role="tabpanel">
              <button
                type="button"
                className="anteprima-matita"
                title={`Modifica «${contenuto.nome}»`}
                aria-label={`Modifica «${contenuto.nome}»`}
                onClick={() => vaiAlCampo(contenuto.campoId)}
              >
                ✎
              </button>
              {contenuto.valore
                .split("\n")
                .map((r) => r.trim())
                .filter(Boolean)
                .map((r, i) => (
                  <p key={i}>
                    <Punto testo={r} />
                  </p>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
