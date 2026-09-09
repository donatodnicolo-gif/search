"use client";

// **La scheda del sito si scrive come si vede.**
//
// Richiesta dell'utente (09/09/2026): «in nuovo prodotto o modifica, per sito
// crea una scheda come questo invece dell'anteprima con tab di ora», con la
// schermata dell'editor di Shopify — titolo e un testo già impaginato, con
// grassetto, elenchi e titoletti.
//
// ⚠️⚠️ **Il modello strutturato NON si butta.** La descrizione di un prodotto
// non è HTML libero: è fatta di pezzi (i tre punti, il testo, le sezioni della
// categoria) che servono all'ordine delle tab, all'AI che le compila e
// all'import che le rilegge. Qui si modifica l'HTML **composto** da quei pezzi,
// e al salvataggio si rispezza nei pezzi con `spezzaDescrizioneHtml`. Il giro
// è misurato: su 120 schede vere, **111 tornano identiche parola per parola e
// nessuna sotto il 97%**.
//
// ⚠️ **Se non lo tocchi, non si salva niente da qui.** Le 9 schede su 120 che
// non tornano identiche al 100% perderebbero una parola a ogni salvataggio,
// anche solo aprendo e chiudendo il modulo. Quindi l'HTML viaggia **solo se
// qualcuno ha davvero scritto**: `toccata` parte falso e nessuno lo alza al
// posto della persona.
//
// ⚠️ Niente libreria di editor: servono tre comandi (grassetto, elenco, titolo)
// e li fa il browser. `document.execCommand` è deprecato ma è supportato
// ovunque, e aggiungere un pacchetto di editor a un modulo già grande
// significherebbe secondi di build su ogni deploy (regola 7 del CLAUDE.md).

import { useEffect, useRef, useState } from "react";

export function EditorScheda({
  sito,
  htmlIniziale,
  nome,
  urlOnline,
}: {
  sito: string;
  /** L'HTML composto dai pezzi: è il punto di partenza, non la verità salvata. */
  htmlIniziale: string;
  nome: string;
  urlOnline?: string | null;
}) {
  const corpo = useRef<HTMLDivElement>(null);
  const [toccata, setToccata] = useState(false);
  const [html, setHtml] = useState(htmlIniziale);

  // ⚠️ Il contenuto si scrive nel DOM **una volta sola**, non a ogni render:
  // riscrivendo `innerHTML` mentre si digita, il cursore salta all'inizio a
  // ogni carattere. Per questo il campo è "non controllato" e lo stato serve
  // solo al campo nascosto che viaggia col modulo.
  useEffect(() => {
    if (corpo.current && !toccata) corpo.current.innerHTML = htmlIniziale;
    // `toccata` di proposito fuori: una volta che si scrive, il seme non torna
    // più a sovrascrivere quello che la persona sta battendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlIniziale]);

  function leggi() {
    if (!corpo.current) return;
    setHtml(corpo.current.innerHTML);
    setToccata(true);
  }

  function comando(nomeComando: string, valore?: string) {
    corpo.current?.focus();
    document.execCommand(nomeComando, false, valore);
    leggi();
  }

  return (
    <div className="editor-scheda">
      <div className="editor-testa">
        <span className="editor-titolo">{nome || "Senza nome"}</span>
        <span className="editor-sito">{sito}</span>
        {urlOnline && (
          <a className="anteprima-link" href={urlOnline} target="_blank" rel="noreferrer">
            Apri la scheda online ↗
          </a>
        )}
      </div>

      <div className="editor-barra" role="toolbar" aria-label={`Formattazione della scheda di ${sito}`}>
        <button type="button" onClick={() => comando("bold")} title="Grassetto"><b>B</b></button>
        <button type="button" onClick={() => comando("italic")} title="Corsivo"><i>I</i></button>
        <button type="button" onClick={() => comando("insertUnorderedList")} title="Elenco puntato">• —</button>
        {/* Il titolo di sezione è un `h6`: è quello che il tema del negozio
            trasforma in una tab. Con un `h3` o un grassetto la tab non nasce,
            e non se ne accorge nessuno finché non guarda un cliente. */}
        <button type="button" onClick={() => comando("formatBlock", "h6")} title="Titolo di sezione — diventa una tab sul sito">
          Titolo di sezione
        </button>
        <button type="button" onClick={() => comando("formatBlock", "p")} title="Testo normale">Testo</button>
      </div>

      <div
        ref={corpo}
        className="editor-corpo"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`Scheda di ${sito}`}
        onInput={leggi}
        onBlur={leggi}
      />

      {/* Viaggia solo se qualcuno ha scritto davvero. */}
      {toccata && <input type="hidden" name={`schedaHtml:${sito}`} value={html} />}

      <span className="cella-sub">
        {toccata
          ? "Al salvataggio questa scheda torna nei suoi campi: i punti in cima, il testo e le sezioni."
          : "Ogni «Titolo di sezione» diventa una tab sul sito. Finché non scrivi qui, valgono i campi qui sotto."}
      </span>
    </div>
  );
}
