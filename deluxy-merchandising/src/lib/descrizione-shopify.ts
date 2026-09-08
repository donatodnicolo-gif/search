/**
 * **La descrizione come la vuole Shopify — e come il tema la trasforma in tab.**
 *
 * Richiesta dell'utente (08/09/2026): «le varie sezioni delle categorie devono
 * poi essere caricate su Shopify affinché creino dei tab come già ora fanno i
 * prodotti», con la schermata dell'admin e il prodotto vero come riferimento.
 *
 * ⚠️ **Il formato non è stato dedotto: è stato letto dal prodotto reale**
 * (`https://deluxy.it/products/colazione-luxury-clivati-milano.js`). Il tema
 * costruisce una tab **per ogni `<h6>`** che trova nella descrizione, e prende
 * come contenuto della tab tutto quello che segue fino al `<h6>` successivo.
 * Cambiare il tag — `<h3>`, un `<p><strong>`, un `<div>` — vuol dire una scheda
 * senza tab, e non se ne accorge nessuno finché non la guarda un cliente.
 *
 * La forma esatta, nell'ordine:
 *
 *     <ul><li><b>Colazione</b>: Clivati per 2 persone</li>…</ul>   ← i tre punti
 *     <h6>DESCRIZIONE</h6><p>…</p>                                 ← il testo libero
 *     <h6>Menù</h6><ul><li>…</li></ul>                             ← sezione a elenco
 *     <h6>Regala con Deluxy</h6><p>…</p>                           ← sezione a testo
 *
 * I tre punti stanno **prima** del primo `<h6>`: così non diventano una tab, e
 * restano il riassunto in cima che il cliente legge senza cliccare.
 */

/** Il minimo indispensabile perché un testo scritto a mano non rompa la pagina. */
function html(testo: string): string {
  return testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Le righe non vuote di un valore, senza il puntino iniziale se qualcuno l'ha scritto. */
function righe(valore: string): string[] {
  return valore
    .split(/\r?\n/)
    .map((r) => r.trim().replace(/^[•\-*]\s*/, ""))
    .filter(Boolean);
}

/**
 * Un punto dell'elenco in cima. Se il testo ha la forma «Etichetta: valore»
 * l'etichetta va in grassetto, come sul prodotto vero; altrimenti resta una
 * riga sola. ⚠️ Si divide sul **primo** due punti e solo se l'etichetta è
 * corta: «Consegna: in guanti bianchi» sì, «Un'attenzione: piccola ma vera,
 * pensata per: chi ami» no — grassettare mezza frase è peggio che non farlo.
 */
function punto(testo: string): string {
  const t = testo.trim();
  if (!t) return "";
  const i = t.indexOf(":");
  if (i > 0 && i <= 28) {
    return `<li><b>${html(t.slice(0, i).trim())}</b>: ${html(t.slice(i + 1).trim())}</li>`;
  }
  return `<li>${html(t)}</li>`;
}

export type SezioneDaScrivere = { nome: string; tipo: string; ordine: number; valore: string };

export type DescrizionePerShopify = {
  /** Il primo dei tre punti: è del prodotto. */
  plusProdotto?: string | null;
  /** Il secondo e il terzo: sono del sito. */
  plusUno?: string | null;
  plusDue?: string | null;
  /** Il testo libero, quello che oggi si scrive nel campo Descrizione. */
  descrizione?: string | null;
  /** Le sezioni della categoria **su questo sito**, già coi valori compilati. */
  sezioni?: SezioneDaScrivere[];
};

/**
 * Compone l'HTML. Torna stringa vuota se non c'è niente da dire: meglio una
 * descrizione assente che una pagina con dei titoli vuoti sotto.
 */
export function componiDescrizioneHtml(d: DescrizionePerShopify): string {
  const pezzi: string[] = [];

  const punti = [d.plusProdotto, d.plusUno, d.plusDue].map((x) => (x ?? "").trim()).filter(Boolean);
  if (punti.length) pezzi.push(`<ul>${punti.map(punto).join("")}</ul>`);

  const testo = (d.descrizione ?? "").trim();
  if (testo) {
    // I paragrafi si separano sulla riga vuota; dentro un paragrafo l'a capo
    // resta un a capo. Buttare tutto in un `<p>` solo appiattirebbe testi
    // scritti a mano che vanno a capo di proposito.
    const paragrafi = testo.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    pezzi.push("<h6>DESCRIZIONE</h6>");
    for (const par of paragrafi) pezzi.push(`<p>${html(par).replace(/\n/g, "<br>")}</p>`);
  }

  for (const s of [...(d.sezioni ?? [])].sort((a, b) => a.ordine - b.ordine)) {
    const valore = (s.valore ?? "").trim();
    if (!valore) continue;
    pezzi.push(`<h6>${html(s.nome)}</h6>`);
    const r = righe(valore);
    if (s.tipo === "elenco" || s.tipo === "coppie" || r.length > 1) {
      // ⚠️ Anche un campo «testo» diventa un elenco quando chi compila ha
      // scritto più righe: sul sito quelle righe **devono** restare separate.
      // Le coppie «Nome: valore» tengono il grassetto sull'etichetta, come i
      // tre punti in cima: è la stessa forma, e il tema la mostra uguale.
      pezzi.push(`<ul>${r.map((x) => (s.tipo === "coppie" ? punto(x) : `<li>${html(x)}</li>`)).join("")}</ul>`);
    } else {
      pezzi.push(`<p>${html(r[0] ?? valore)}</p>`);
    }
  }

  return pezzi.join("\n");
}

/**
 * **Le sezioni che valgono su un sito**, fra tutte quelle definite.
 *
 * ⚠️ La regola è «se il negozio ha le sue, le sue vincono; altrimenti valgono
 * quelle comuni» — la stessa che il modulo applica a schermo. Scritta due volte
 * si sarebbe rotta subito: nella prima prova, prendendo comuni **e** specifiche
 * insieme, la descrizione di Business Deluxy usciva con «Menù» e «Allergeni»
 * ripetuti due volte, cioè due tab doppie sulla scheda del cliente.
 */
export function sezioniDelSito<T extends { categoria: string; negozio: string | null; nome: string }>(
  tutte: T[],
  categoria: string,
  sito: string,
): T[] {
  const dellaCategoria = tutte.filter((s) => s.categoria === categoria);
  const sue = dellaCategoria.filter((s) => s.negozio === sito);
  return sue.length ? sue : dellaCategoria.filter((s) => !s.negozio);
}
