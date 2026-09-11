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
/** Maiuscola iniziale, senza toccare il resto (le sigle restano sigle). */
function conMaiuscola(t: string): string {
  return t ? t.charAt(0).toLocaleUpperCase("it") + t.slice(1) : t;
}

function punto(testo: string, etichettaDiRipiego?: string | null): string {
  const t = testo.trim();
  if (!t) return "";
  const i = t.indexOf(":");
  if (i > 0 && i <= 28) {
    // ⚠️ La maiuscola va sulla PRIMA lettera del punto, cioè sull'etichetta.
    // Mettendola anche dopo i due punti usciva «Consegna: In guanti bianchi»,
    // che in italiano è sbagliato: quello è il seguito della frase, non l'inizio.
    return `<li><b>${html(conMaiuscola(t.slice(0, i).trim()))}</b>: ${html(t.slice(i + 1).trim())}</li>`;
  }
  // ⭐ 09/09/2026 (utente): «per i 3 punti prima lettera maiuscola, manca
  // categoria in grassetto per la categoria». Quando il punto non porta già la
  // sua etichetta — e sono la maggioranza: su 1.905 plus solo 40 ce l'hanno —
  // in grassetto ci va la categoria del prodotto, che è quello che il sito fa
  // già («<b>Champagne</b>: Ruinart Rosé Magnum»).
  if (etichettaDiRipiego?.trim()) {
    return `<li><b>${html(conMaiuscola(etichettaDiRipiego.trim()))}</b>: ${html(t)}</li>`;
  }
  return `<li>${html(conMaiuscola(t))}</li>`;
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
  /**
   * L'etichetta da mettere in grassetto davanti al PRIMO punto quando il plus
   * non ne porta una sua: il nome leggibile della categoria («Torte e dolci»,
   * «Fiori»). Non tocca il secondo e il terzo, che sono del sito e la loro
   * etichetta ce l'hanno già («Inclusi», «Consegna»).
   */
  etichettaCategoria?: string | null;
};

/**
 * Compone l'HTML. Torna stringa vuota se non c'è niente da dire: meglio una
 * descrizione assente che una pagina con dei titoli vuoti sotto.
 */
/**
 * `conVuote`: tiene anche le sezioni senza testo (un titolo e un paragrafo
 * vuoto). Serve SOLO all'editor del modulo: chi aggiunge un «Titolo di
 * sezione» e non ha ancora scritto sotto deve rivederselo al prossimo giro,
 * altrimenti sparisce (segnalato l'11/09/2026 sui prodotti vecchi a cui il
 * titolo «era andato via»). Sul negozio una tab vuota non si manda mai.
 */
export function componiDescrizioneHtml(d: DescrizionePerShopify, opzioni?: { conVuote?: boolean }): string {
  const pezzi: string[] = [];

  const punti = [d.plusProdotto, d.plusUno, d.plusDue].map((x) => (x ?? "").trim()).filter(Boolean);
  if (punti.length) {
    const primoEilPlus = !!(d.plusProdotto ?? "").trim();
    pezzi.push(
      `<ul>${punti.map((p, i) => punto(p, i === 0 && primoEilPlus ? d.etichettaCategoria : null)).join("")}</ul>`,
    );
  }

  // ⭐⭐ 11/09/2026 (utente): «il testo che scrivo su Descrizione vada in
  // automatico nella prima sezione (Dettagli…) invece che apparire due volte
  // uguale». La descrizione È la prima sezione della scheda: se la prima
  // sezione prevista è vuota, ci va lei; se ha già lo stesso testo, non si
  // stampa una seconda volta in cima. Solo quando la prima sezione porta un
  // testo SUO, diverso, la descrizione resta come introduzione — buttarla via
  // sarebbe cancellare dal sito un testo che qualcuno ha scritto.
  const sezioniOrdinate = [...(d.sezioni ?? [])].sort((a, b) => a.ordine - b.ordine).map((s) => ({ ...s }));
  let testo = (d.descrizione ?? "").trim();
  const prima = sezioniOrdinate[0];
  if (testo && prima) {
    const suo = (prima.valore ?? "").trim();
    if (!suo) {
      prima.valore = testo;
      prima.tipo = "testo";
      testo = "";
    } else if (stessoTesto(suo, testo)) {
      testo = "";
    }
  }
  if (testo) {
    // I paragrafi si separano sulla riga vuota; dentro un paragrafo l'a capo
    // resta un a capo. Buttare tutto in un `<p>` solo appiattirebbe testi
    // scritti a mano che vanno a capo di proposito.
    const paragrafi = testo.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    // ⚠️⚠️ 10/09/2026 (utente): «sulle sezioni della descrizione appare
    // "descrizione" che non si dovrebbe vedere» e «i dettagli non risultano
    // come prima categoria». Sono la stessa cosa: qui si scriveva un
    // `<h6>DESCRIZIONE</h6>`, e **ogni `<h6>` per il tema è una tab** — quindi
    // il testo libero diventava la PRIMA tab e spingeva «Dettagli» in seconda.
    // Ora il testo sta prima del primo titolo, insieme ai tre punti: lì il tema
    // non costruisce nessuna tab e si legge subito. Che è quello che è —
    // l'introduzione della scheda, non una sezione fra le altre.
    for (const par of paragrafi) pezzi.push(`<p>${html(par).replace(/\n/g, "<br>")}</p>`);
  }

  for (const s of sezioniOrdinate) {
    const valore = (s.valore ?? "").trim();
    if (!valore) {
      if (opzioni?.conVuote) pezzi.push(`<h6>${html(s.nome)}</h6>`, "<p></p>");
      continue;
    }
    pezzi.push(`<h6>${html(s.nome)}</h6>`);
    const r = righe(valore);
    // ⚠️⚠️ **La forma la decide il TIPO della sezione, non quante righe ha.**
    // Prima bastava un a capo perché un campo «testo» diventasse un elenco
    // puntato: chi scriveva due frasi si ritrovava due pallini sulla scheda del
    // cliente (segnalato il 10/09/2026). Le righe restano separate lo stesso —
    // ma come paragrafi, che è quello che sono.
    // Il tipo si cambia in «Sezioni della scheda», dove è anche scritto cosa
    // vuol dire: testo = un paragrafo, elenco = una voce per riga, coppie =
    // «Nome: valore» col nome in grassetto.
    // ⭐ 11/09/2026 (utente): «le descrizioni sotto le sezioni risultano a
    // elenco puntato su deluxy ma non dovrebbero». Un elenco di UNA voce non è
    // un elenco: è un paragrafo con un pallino davanti. Quindi la forma a lista
    // vale solo se il tipo la chiede E le righe sono almeno due; una riga sola
    // esce come paragrafo (con l'etichetta in grassetto se è una coppia).
    if ((s.tipo === "elenco" || s.tipo === "coppie") && r.length > 1) {
      pezzi.push(`<ul>${r.map((x) => (s.tipo === "coppie" ? punto(x) : `<li>${html(x)}</li>`)).join("")}</ul>`);
    } else if (s.tipo === "coppie" && r.length === 1) {
      pezzi.push(`<p>${punto(r[0]).replace(/^<li>/, "").replace(/<\/li>$/, "")}</p>`);
    } else {
      for (const riga of r.length ? r : [valore]) pezzi.push(`<p>${html(riga)}</p>`);
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

// ─────────────────────────────────────────────────────────────────────────────
// **Il verso opposto: spezzare la descrizione che arriva da Shopify.**
//
// Richiesta dell'utente (08/09/2026): «spezza l'HTML importato nelle sue parti».
// Serve perché l'import appiattiva tutta la descrizione — tre punti, testo,
// sezioni — in un unico campo `descrizione`: ricomponendola si sarebbe
// stampato ogni pezzo due volte.
//
// ⚠️ **Il formato è stato misurato, non supposto**: censite 160 descrizioni
// vere sui quattro negozi (`scripts/censimento-descrizioni.ts`) — **159 usano
// `<h6>`**, una `<h5>`, una non ha nessun titolo. I titoli sono i nostri
// (Dettagli, Significato, Conservazione, Ingredienti e Allergeni, Pesi e
// Misure, Come Funziona, Perfetto per…), scritti a volte in maiuscolo. Quindi:
// si accettano h4-h6, e i nomi si confrontano senza maiuscole né accenti.

export type PezziDescrizione = {
  /** I punti dell'elenco in cima, prima del primo titolo. */
  punti: string[];
  /** Il testo libero: il blocco sotto «DESCRIZIONE», o quello che sta in cima senza titolo. */
  descrizione: string;
  /** Le sezioni, nell'ordine in cui stanno nella pagina. */
  sezioni: { nome: string; testo: string }[];
};

/** Da HTML a testo leggibile: gli elenchi diventano righe, i paragrafi restano. */
function testoDa(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<\/li>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;/gi, "'")
    .split("\n")
    .map((r) => r.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const senzaAccenti = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** È il titolo del testo libero e non di una sezione? */
function eDescrizione(nome: string): boolean {
  const n = senzaAccenti(nome);
  return n === "descrizione" || n === "descrizione e dettagli" || n === "la descrizione";
}

/**
 * Spezza la descrizione di Shopify nei suoi pezzi. Non butta niente: quello che
 * non è un elenco in cima né un titolo finisce nel testo libero, così
 * ricomponendo si ritrova tutto.
 */
export function spezzaDescrizioneHtml(html: string | null | undefined, opzioni?: { conVuote?: boolean }): PezziDescrizione {
  const sorgente = (html ?? "").trim();
  if (!sorgente) return { punti: [], descrizione: "", sezioni: [] };

  const titolo = /<(h[4-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const tagli: { indice: number, fine: number, nome: string }[] = [];
  for (const m of sorgente.matchAll(titolo)) {
    const nome = m[2].replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
    if (nome) tagli.push({ indice: m.index ?? 0, fine: (m.index ?? 0) + m[0].length, nome });
  }

  const testa = sorgente.slice(0, tagli.length ? tagli[0].indice : sorgente.length);
  const voci = [...testa.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => testoDa(m[1]).replace(/\n+/g, " ").trim())
    .filter(Boolean);
  // ⚠️ **L'elenco in cima è «i tre punti» solo se ha al massimo tre voci.**
  // Misurato su 224 descrizioni vere: 205 ne hanno esattamente tre, ma 19 ne
  // hanno da quattro a tredici — e lì il primo elenco non è il riassunto, è
  // contenuto (gli ingredienti, le voci di un menù). Prendendone comunque i
  // primi tre si perdevano gli altri **senza dirlo**: è successo nella prima
  // prova, su «luxury-crema-viso-nutriente».
  const sonoPunti = voci.length > 0 && voci.length <= 3;
  const punti = sonoPunti ? voci : [];
  // Quello che in cima non sono i punti resta testo libero: non si butta niente.
  const restoTesta = sonoPunti ? testoDa(testa.replace(/<ul[\s\S]*?<\/ul>/gi, "")) : testoDa(testa);

  const sezioni: { nome: string; testo: string }[] = [];
  let descrizione = restoTesta;
  tagli.forEach((t, i) => {
    const finePezzo = i + 1 < tagli.length ? tagli[i + 1].indice : sorgente.length;
    const testo = testoDa(sorgente.slice(t.fine, finePezzo));
    // Una sezione senza testo si butta — tranne nell'editor (`conVuote`), dove
    // il titolo appena scritto deve restare finché si scrive sotto.
    if (!testo && !opzioni?.conVuote) return;
    if (eDescrizione(t.nome)) {
      descrizione = descrizione ? `${descrizione}\n\n${testo}` : testo;
      return;
    }
    const gia = sezioni.find((s) => senzaAccenti(s.nome) === senzaAccenti(t.nome));
    if (gia) gia.testo = `${gia.testo}\n${testo}`;
    else sezioni.push({ nome: t.nome, testo });
  });

  return { punti, descrizione, sezioni };
}

/**
 * Due testi sono «lo stesso» se coincidono a meno di spazi, a capo e maiuscole
 * — oppure se **cominciano allo stesso modo** (primi 50 caratteri) e sono
 * entrambi lunghi almeno 50: è il caso misurato l'11/09/2026 sui prodotti
 * scritti dal modulo, dove la descrizione e «Dettagli» differivano per un
 * refuso corretto in uno solo dei due («macaros»/«macarons») o per una
 * rifinitura fatta su un sito. Sono la stessa scheda, e stamparli tutti e due
 * è il doppione che l'utente ha segnalato. I testi che cominciano diversi
 * (la vecchia tab «DESCRIZIONE» dei prodotti importati contro i loro
 * «Dettagli») restano due testi, e si stampano entrambi.
 */
function stessoTesto(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const na = n(a), nb = n(b);
  if (na === nb) return true;
  return na.length >= 50 && nb.length >= 50 && na.slice(0, 50) === nb.slice(0, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// **Quali sezioni scrivere per un prodotto su un sito, e in che ordine.**
// Vive qui, in un file puro, perché la usano sia il server (la scheda che va su
// Shopify) sia il modulo nel browser (l'anteprima che si vede mentre si
// scrive): due copie di questa regola sarebbero due schede diverse.

export type SezioneDefinita = { categoria: string; negozio: string | null; nome: string; tipo: string; ordine: number };

export type SchedaComponibile = {
  plusProdotto?: string | null;
  descrizione?: string | null;
  categoria: string;
  /** `{ "Gifts": { "Menù": "…" } }` */
  sezioniScheda?: unknown;
};

/**
 * La «famiglia» di un nome di sezione: le grafie di «Dettagli» — Dettagli,
 * Dettagli Prodotto, Dettagli prodotti — sono la stessa sezione. Senza questa
 * regola un prodotto con «Dettagli» su una categoria che prevede «Dettagli
 * Prodotto» finiva con la sezione in coda, o con la casella vuota accanto a un
 * testo che c'era.
 */
export function famigliaSezione(nome: string): string {
  const n = senzaAccenti(nome);
  return n.startsWith("dettagli") ? "dettagli" : n;
}

/** I valori delle sezioni di un sito, dal JSON `sezioniScheda`. */
export function valoriSezioni(sezioniScheda: unknown, sito: string): Record<string, string> {
  if (!sezioniScheda || typeof sezioniScheda !== "object" || Array.isArray(sezioniScheda)) return {};
  const perSito = (sezioniScheda as Record<string, unknown>)[sito];
  if (!perSito || typeof perSito !== "object" || Array.isArray(perSito)) return {};
  const fuori: Record<string, string> = {};
  for (const [k, v] of Object.entries(perSito as Record<string, unknown>)) if (typeof v === "string") fuori[k] = v;
  return fuori;
}

/**
 * Le sezioni da scrivere per questo prodotto su questo negozio: **quelle
 * previste** per la categoria su quel sito, nel loro ordine (la prima anche se
 * vuota: è lì che va la descrizione), **più quelle che il prodotto ha ma che il
 * sito non prevede**.
 *
 * ⚠️ Il secondo gruppo non è un dettaglio: le sezioni previste cambiano nel
 * tempo, e su alcuni siti la lista è corta (Gifts per i fiori prevede solo
 * «Come Funziona»). Componendo solo le previste, un testo scritto sotto
 * un'altra sezione **sparirebbe dalla scheda online** al primo salvataggio.
 *
 * ⭐ 11/09/2026 (utente: «"Dettagli" o scompare o risulta l'ultima»): prima la
 * coda finiva sempre in fondo. Ora una sezione fuori previsione **eredita il
 * posto** dalla definizione con lo stesso nome nella categoria (comune o di un
 * altro sito): «Dettagli», ordine 0 ovunque, torna prima; solo chi non ha
 * nessuna definizione resta in coda.
 */
export function sezioniDaScrivere(p: SchedaComponibile, sito: string, definite: SezioneDefinita[], opzioni?: { conVuote?: boolean }): SezioneDaScrivere[] {
  const valori = valoriSezioni(p.sezioniScheda, sito);
  const previste = sezioniDelSito(definite, p.categoria, sito).slice().sort((a, b) => a.ordine - b.ordine);
  const chiavi = Object.keys(valori);
  const trova = (nome: string) => {
    const esatta = chiavi.find((k) => senzaAccenti(k) === senzaAccenti(nome));
    const diFamiglia = esatta ?? chiavi.find((k) => famigliaSezione(k) === famigliaSezione(nome));
    return diFamiglia ? valori[diFamiglia] : "";
  };
  const fuori: SezioneDaScrivere[] = [];
  const usate = new Set<string>();
  previste.forEach((s, i) => {
    const v = trova(s.nome);
    let esplicita = false;
    for (const k of chiavi) if (famigliaSezione(k) === famigliaSezione(s.nome)) { usate.add(k); esplicita = true; }
    if (v.trim() || i === 0 || (opzioni?.conVuote && esplicita)) fuori.push({ nome: s.nome, tipo: s.tipo, ordine: s.ordine, valore: v });
  });
  const dellaCategoria = definite.filter((d) => d.categoria === p.categoria);
  let coda = 1000;
  for (const [nome, valore] of Object.entries(valori)) {
    if (usate.has(nome)) continue;
    if (!valore.trim() && !opzioni?.conVuote) continue;
    const def = dellaCategoria.find((d) => famigliaSezione(d.nome) === famigliaSezione(nome));
    fuori.push({ nome, tipo: def?.tipo ?? "testo", ordine: def ? def.ordine - 0.5 : coda++, valore });
  }
  return fuori.sort((a, b) => a.ordine - b.ordine);
}
