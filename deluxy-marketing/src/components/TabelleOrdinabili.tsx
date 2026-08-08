"use client";

import { useEffect } from "react";

// Rende ordinabile OGNI tabella dell'app, senza toccarle una per una.
//
// Le tabelle sono decine, generate da pagine diverse, e riscriverle tutte per
// aggiungere `?ord=` a ognuna sarebbe stato lungo e fragile — oltre che
// inutilmente costoso: sono già tutte in pagina, l'ordinamento non ha bisogno
// del database. Qui un solo componente, montato nel layout, aggancia il
// comportamento a tutte quelle presenti e a quelle che verranno.
//
// Ordina quello che vede: se una tabella è paginata dal server, riordina la
// pagina corrente, non l'intero elenco. Dove serve l'ordinamento vero su tutti
// i dati (campagne, keyword, termini) resta quello a parametri, che vince
// perché rifà la query — questo è il fallback universale, non il sostituto.
//
// Escluse le tabelle marcate `data-no-ordina`: dove le righe hanno un ordine
// che è esso stesso l'informazione (una cronologia, una classifica di
// posizione) riordinarle la distrugge.

// Numeri all'italiana ("1.234,50 €", "12,3×", "45%") e date ("31/07/2026")
// devono ordinarsi come numeri e date, non come testo: altrimenti "1.000" sta
// prima di "9" e nessuno si fida più della colonna.
function valore(cella: HTMLTableCellElement): number | string {
  const t = (cella.textContent ?? "").trim();
  if (t === "" || t === "—" || t === "–" || t === "n/d") return -Infinity;

  const data = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (data) return new Date(+data[3], +data[2] - 1, +data[1]).getTime();

  // Toglie valuta, simboli e separatori di migliaia; la virgola è decimale
  const pulito = t
    .replace(/[×x%€$]/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".")
    .replace(/[^\d.+-]/g, "");
  if (pulito !== "" && !isNaN(Number(pulito)) && /\d/.test(t)) return Number(pulito);

  return t.toLowerCase();
}

function ordina(tabella: HTMLTableElement, indice: number, crescente: boolean) {
  const corpo = tabella.tBodies[0];
  if (!corpo) return;
  const righe = [...corpo.rows];
  righe.sort((a, b) => {
    const va = valore(a.cells[indice] as HTMLTableCellElement);
    const vb = valore(b.cells[indice] as HTMLTableCellElement);
    // ⚠️ Le celle vuote valgono -Infinity, e `-Infinity - (-Infinity)` fa
    // **NaN**: un comparatore che restituisce NaN non ordina niente e lascia
    // le righe dov'erano. Su una tabella con molte celle vuote — 337 keyword
    // su 491 senza numeri, misurato il 07/08/2026 — ordinare per spesa in giù
    // lasciava i trattini in cima, e sembrava che l'ordinamento fosse rotto.
    // I vuoti vanno in fondo SEMPRE, in qualunque verso: «nessun dato» non è
    // né il massimo né il minimo.
    const vuotoA = va === -Infinity;
    const vuotoB = vb === -Infinity;
    if (vuotoA || vuotoB) return vuotoA && vuotoB ? 0 : vuotoA ? 1 : -1;
    if (typeof va === "number" && typeof vb === "number") return crescente ? va - vb : vb - va;
    return crescente
      ? String(va).localeCompare(String(vb), "it")
      : String(vb).localeCompare(String(va), "it");
  });
  for (const r of righe) corpo.appendChild(r);
}

export function TabelleOrdinabili() {
  useEffect(() => {
    const pulizie: (() => void)[] = [];

    const attiva = () => {
      const tabelle = document.querySelectorAll<HTMLTableElement>("main table");
      for (const tabella of tabelle) {
        if (tabella.dataset.ordinabile === "si" || tabella.hasAttribute("data-no-ordina")) continue;
        const testa = tabella.tHead?.rows[0];
        // Serve una riga di intestazione e almeno due righe da riordinare
        if (!testa || (tabella.tBodies[0]?.rows.length ?? 0) < 2) continue;
        tabella.dataset.ordinabile = "si";

        [...testa.cells].forEach((cella, i) => {
          if (cella.hasAttribute("data-no-ordina")) return;
          cella.classList.add("th-ordinabile");
          cella.setAttribute("role", "button");
          cella.setAttribute("tabindex", "0");
          cella.title = "Ordina per questa colonna";

          const click = () => {
            // Primo click: decrescente sui numeri (il più grande in cima, che è
            // quasi sempre quello che si cerca), crescente sul testo.
            const prima = cella.dataset.verso;
            const primaCella = tabella.tBodies[0]?.rows[0]?.cells[i];
            const numerica = primaCella ? typeof valore(primaCella as HTMLTableCellElement) === "number" : false;
            const crescente = prima ? prima === "desc" : !numerica;

            // ⚠️ Riordinare sposta OGNI riga della tabella, e il browser perde
            // l'ancoraggio dello scroll: su una tabella lunga si finiva a inizio
            // pagina, cioè lontano dalla colonna appena cliccata. Si tiene
            // l'intestazione ferma dov'era: prima e dopo il riordino si misura
            // dove sta rispetto alla finestra e si recupera la differenza.
            const primaY = cella.getBoundingClientRect().top;
            ordina(tabella, i, crescente);
            const dopoY = cella.getBoundingClientRect().top;
            if (dopoY !== primaY) window.scrollBy(0, dopoY - primaY);
            // E il focus torna sulla colonna: chi ordina da tastiera altrimenti
            // ripartirebbe da capo nella pagina a ogni click.
            cella.focus({ preventScroll: true });

            for (const c of testa.cells) {
              delete c.dataset.verso;
              c.classList.remove("th-asc", "th-desc");
            }
            cella.dataset.verso = crescente ? "asc" : "desc";
            cella.classList.add(crescente ? "th-asc" : "th-desc");
          };

          const tasto = (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              click();
            }
          };

          cella.addEventListener("click", click);
          cella.addEventListener("keydown", tasto);
          pulizie.push(() => {
            cella.removeEventListener("click", click);
            cella.removeEventListener("keydown", tasto);
          });
        });

        // Una tabella che il server ha già ordinato lo dichiara con
        // `data-ordinata-per` (il testo dell'intestazione) e
        // `data-ordinata-verso`. Qui si accende solo la freccia: le righe sono
        // già nell'ordine giusto e riordinarle sarebbe lavoro per niente.
        //
        // ⚠️ Serve soprattutto al PRIMO click: senza questo `verso`, la colonna
        // risultava "mai ordinata" e il click rifaceva lo stesso ordine — la
        // tabella non cambiava e sembrava che l'ordinamento non funzionasse.
        const ordinataPer = tabella.dataset.ordinataPer?.trim().toLowerCase();
        if (ordinataPer) {
          const verso = tabella.dataset.ordinataVerso === "desc" ? "desc" : "asc";
          const cella = [...testa.cells].find(
            (c) => !c.hasAttribute("data-no-ordina") && (c.textContent ?? "").trim().toLowerCase() === ordinataPer
          );
          if (cella) {
            cella.dataset.verso = verso;
            cella.classList.add(verso === "asc" ? "th-asc" : "th-desc");
          }
        }
      }
    };

    attiva();
    // Le tabelle dentro <details> nascono quando si apre il mese, e le pagine
    // ne aggiungono altre dopo il primo render: si resta in ascolto.
    const osservatore = new MutationObserver(() => attiva());
    osservatore.observe(document.body, { childList: true, subtree: true });
    pulizie.push(() => osservatore.disconnect());

    return () => pulizie.forEach((p) => p());
  }, []);

  return null;
}
