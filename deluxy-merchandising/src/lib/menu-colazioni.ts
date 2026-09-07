// **Il menù delle colazioni, tirato fuori dalla descrizione** (07/09/2026,
// chiesto dall'utente: «per tutte le colazioni mettere in note variante o
// prodotto il menù indicato, così come per i fiori abbiamo l'indicazione sui
// numeri di fiori»).
//
// La descrizione importata dal negozio è testo piatto (l'import toglie l'HTML e
// schiaccia gli a-capo, vedi `descrizioneDa` in shopify-collezioni.ts): la
// lista puntata del menù è diventata una frase lunga. Qui si cerca il punto in
// cui la descrizione comincia a elencare cosa c'è dentro («Il cofanetto
// comprende: …», «Menù: …», «All'interno troverai …») e si prende quel pezzo,
// fino a dove il testo cambia argomento (consegna, ordine, allergeni…).
//
// È un'euristica, e lo dichiara: lo script che la usa scrive un rapporto con
// il testo scelto per ogni prodotto, e quello che non riconosce lo elenca come
// «da compilare a mano». Meglio una nota vuota da riempire che un menù
// sbagliato scritto come fosse vero.
//
// Funzioni pure (niente Prisma, niente Date): si provano con tsx.

/** Dove comincia il menù: la prima di queste che si trova nel testo. */
const INIZI: RegExp[] = [
  /\bmen[uù]\s*(?:del(?:la)?\s+\w+\s*)?[:\-–—]\s*/i,
  /\b(?:il|la|lo)?\s*(?:cofanetto|box|cesto|cestino|kit|scatola|colazione|brunch|set|pacchetto|confezione)\s+(?:comprende|contiene|include|è composto\s+da|è composta\s+da|prevede)\s*[:\-–—]?\s*/i,
  /\b(?:comprende|contiene|include|composto\s+da|composta\s+da|composizione|contenuto|cosa\s+c['’]è\s+dentro|cosa\s+contiene|cosa\s+comprende|all['’]interno\s+(?:troverai|troverete|trovi|ci\s+sono|c['’]è))\s*[:\-–—]?\s*/i,
];

/** Dove il testo cambia argomento: qui il menù finisce. */
const FINI: RegExp[] = [
  /\b(?:consegna|consegne|consegniamo|spedizione|spediamo|ordina|ordine|ordinando|disponibil[ei]|allergeni|conservazione|conservare|nota\b|note\b|attenzione|importante|orari[oa]?|fascia|tempi|prenot|il servizio|servizio di|deluxy|personalizza|bigliett|packaging|confezionat|presentat)\b/i,
];

const MASSIMO = 600;

export type MenuEstratto = { testo: string; fonte: "metafield" | "descrizione"; chiave?: string };

/** Testo piatto: via l'HTML, gli a-capo e i doppi spazi. */
export function appiattisci(t: string | null | undefined): string {
  return (t ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** Un metafield del negozio che parli di menù o contenuto, se c'è: vale più della descrizione. */
export function menuDaMetafield(mf: Record<string, unknown> | null | undefined): MenuEstratto | null {
  if (!mf || typeof mf !== "object") return null;
  for (const [chiave, valore] of Object.entries(mf)) {
    if (!/men[uù]|contenuto|cosa_comprende|comprende|composizione/i.test(chiave)) continue;
    if (typeof valore !== "string") continue;
    let testo = valore.trim();
    // Le liste di Shopify arrivano come JSON: ["2 cornetti","2 succhi"].
    if (testo.startsWith("[")) {
      try {
        const lista = JSON.parse(testo);
        if (Array.isArray(lista)) testo = lista.map((x) => String(x).trim()).filter(Boolean).join(" · ");
      } catch {
        /* resta com'è */
      }
    }
    testo = appiattisci(testo);
    if (testo) return { testo: testo.slice(0, MASSIMO), fonte: "metafield", chiave };
  }
  return null;
}

/** Il menù dalla descrizione piatta, o `null` se non si riconosce dove comincia. */
export function menuDaDescrizione(descrizione: string | null | undefined): MenuEstratto | null {
  const t = appiattisci(descrizione);
  if (!t) return null;
  let inizio = -1;
  for (const re of INIZI) {
    const m = re.exec(t);
    if (m && (inizio === -1 || m.index + m[0].length < inizio)) inizio = m.index + m[0].length;
  }
  if (inizio === -1) return null;
  let pezzo = t.slice(inizio);
  // Si chiude dove cambia argomento, ma non prima di aver preso qualcosa:
  // «comprende: consegna…» non è un menù, e si scarta sotto.
  let fine = pezzo.length;
  for (const re of FINI) {
    const m = re.exec(pezzo);
    // Se il «menù» comincia già con un altro argomento («comprende: consegna
    // a domicilio…») non è un menù: meglio niente che una nota sbagliata.
    if (m && m.index <= 12) return null;
    if (m && m.index < fine) fine = m.index;
  }
  pezzo = pezzo.slice(0, Math.min(fine, MASSIMO));
  // Si taglia all'ultimo segno di punteggiatura forte, per non lasciare mezza parola.
  const ultimo = Math.max(pezzo.lastIndexOf(". "), pezzo.lastIndexOf("; "), pezzo.lastIndexOf(" · "));
  if (pezzo.length >= MASSIMO - 1 && ultimo > 40) pezzo = pezzo.slice(0, ultimo + 1);
  pezzo = pezzo.replace(/[\s,;:·\-–—]+$/g, "").trim();
  return pezzo.length >= 12 ? { testo: pezzo, fonte: "descrizione" } : null;
}

/** Prima il metafield del negozio, poi la descrizione. */
export function estraiMenu(p: { descrizione: string | null; metafieldShopify?: unknown }): MenuEstratto | null {
  const mf = p.metafieldShopify && typeof p.metafieldShopify === "object" && !Array.isArray(p.metafieldShopify) ? (p.metafieldShopify as Record<string, unknown>) : null;
  return menuDaMetafield(mf) ?? menuDaDescrizione(p.descrizione);
}
