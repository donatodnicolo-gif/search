/**
 * Su mobile le tabelle diventano SCHEDE (come in Deluxy Scout): il CSS globale
 * (styles.css, media ≤800px) smonta le righe di `.table-wrap table` in card e
 * mostra l'etichetta di colonna con `td::before { content: attr(data-label) }`.
 *
 * Le etichette non si scrivono a mano in 27 pagine: questo modulo le ricava
 * dai `<th>` già renderizzati (quindi già tradotti) e le appoggia su ogni `<td>`
 * della stessa colonna. Un MutationObserver ripassa a ogni re-render di Angular
 * (ordinamenti, filtri, paginazione). Osserva solo childList: scrivere un
 * attributo non lo risveglia, niente cicli.
 */

function testoEtichetta(th: Element): string {
  // Il th può contenere l'indicatore di ordinamento (span.sort-ind): non è
  // parte del nome della colonna.
  const clone = th.cloneNode(true) as Element;
  clone.querySelectorAll('.sort-ind').forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function etichettaTabella(table: Element): void {
  const ths = Array.from(table.querySelectorAll(':scope > thead th'));
  if (!ths.length) return;
  const labels = ths.map(testoEtichetta);
  for (const tr of Array.from(table.querySelectorAll(':scope > tbody > tr'))) {
    let col = 0;
    for (const cell of Array.from(tr.children)) {
      if (!(cell instanceof HTMLTableCellElement)) continue;
      // Una cella che copre più colonne (righe espanse, sotto-tabelle) non ha
      // UNA colonna: niente etichetta, il CSS la mostra a tutta larghezza.
      const label = cell.colSpan > 1 ? '' : (labels[col] ?? '');
      if (cell.getAttribute('data-label') !== label) {
        cell.setAttribute('data-label', label);
      }
      col += cell.colSpan || 1;
    }
  }
}

function etichettaTutte(): void {
  document.querySelectorAll('.table-wrap table').forEach(etichettaTabella);
}

/** Da chiamare una volta al bootstrap. */
export function avviaTabelleASchede(): void {
  let richiesto = false;
  const ripassa = () => {
    if (richiesto) return;
    richiesto = true;
    requestAnimationFrame(() => {
      richiesto = false;
      etichettaTutte();
    });
  };
  new MutationObserver(ripassa).observe(document.body, {
    childList: true,
    subtree: true,
  });
  ripassa();
}
