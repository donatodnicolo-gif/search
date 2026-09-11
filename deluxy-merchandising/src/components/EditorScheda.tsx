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
// all'import che le rilegge. Qui si modifica l'HTML **composto** da quei pezzi.
//
// ⭐⭐ 11/09/2026 — **l'editor non ha più uno stato suo.** Prima teneva un HTML
// nascosto che viaggiava col modulo e al salvataggio vinceva sulle caselle.
// Tre guasti segnalati dall'utente nascevano da lì: (1) l'istanza era una sola
// per tutte le tab, quindi il testo scritto sul primo sito finiva sugli altri
// («Dettagli prodotto» e «Perfetto per» tornavano uguali a quelli del primo
// sito); (2) una sezione corretta nelle caselle tornava com'era, perché
// l'HTML nascosto, più vecchio, la sovrascriveva; (3) le sezioni che il sito
// non prevedeva non stavano nell'HTML e sparivano al salvataggio.
// Ora l'editor **legge dai campi e scrive nei campi**: quello che si batte qui
// viene rispezzato subito (stesso parser dell'import) e aggiorna caselle,
// punti e descrizione; quello che si scrive nelle caselle ricompone l'editor
// appena non ci si sta scrivendo dentro. Una verità sola, e il salvataggio
// manda quella.
//
// ⚠️ Niente libreria di editor: servono tre comandi (grassetto, elenco, titolo)
// e li fa il browser. `document.execCommand` è deprecato ma è supportato
// ovunque, e aggiungere un pacchetto di editor a un modulo già grande
// significherebbe secondi di build su ogni deploy (regola 7 del CLAUDE.md).

import { useEffect, useRef } from "react";

export function EditorScheda({
  sito,
  htmlIniziale,
  nome,
  urlOnline,
  onChange,
}: {
  sito: string;
  /** L'HTML composto dai pezzi: è quello che si vede, ricomposto a ogni cambiamento dei campi. */
  htmlIniziale: string;
  nome: string;
  urlOnline?: string | null;
  /** Chiamato mentre si scrive: il genitore rispezza l'HTML nei campi. */
  onChange?: (html: string) => void;
}) {
  const corpo = useRef<HTMLDivElement>(null);

  // ⚠️ Il contenuto si riscrive nel DOM solo quando NON si sta scrivendo qui:
  // riscrivendo `innerHTML` mentre si digita, il cursore salta all'inizio a
  // ogni carattere. Quando si scrive nelle caselle, invece, l'editor non ha il
  // fuoco e si aggiorna — è così che le due viste restano la stessa cosa.
  // Cambiando tab (`sito`) si riparte dall'HTML di quel sito.
  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML !== htmlIniziale) el.innerHTML = htmlIniziale;
  }, [sito, htmlIniziale]);

  function leggi() {
    if (corpo.current) onChange?.(corpo.current.innerHTML);
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
        {urlOnline ? (
          <a className="anteprima-link" href={urlOnline} target="_blank" rel="noreferrer">
            Apri la scheda online ↗
          </a>
        ) : (
          <span className="cella-sub" title="Il link compare quando il prodotto è sul negozio">non ancora online su {sito}</span>
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

      <span className="cella-sub">
        Ogni «Titolo di sezione» diventa una tab sul sito. Quello che scrivi qui aggiorna subito i campi qui sotto (i punti in cima, il testo, le sezioni) e viceversa: è la stessa scheda vista in due modi. Il grassetto dentro un paragrafo non si conserva.
      </span>
    </div>
  );
}
