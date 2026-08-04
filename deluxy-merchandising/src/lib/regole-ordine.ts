// **Le regole d'ordine salvate.**
//
// Prima l'ordine di una vetrina si poteva esprimere solo con sei metriche fisse
// (più venduti, più fatturato, novità, margine, prezzo ↑/↓), da riscegliere ogni
// volta e collezione per collezione. Qui una regola diventa **una cosa con un
// nome**, che si scrive una volta e si riusa dove serve.
//
// Una regola è una **sequenza di passi in priorità**: il primo decide l'ordine,
// i successivi spezzano i pareggi. Un passo può essere di due nature:
//
//   • **metrica** — le sei di sempre, che mettono in fila tutti i prodotti;
//   • **attributo** — «porta in cima chi corrisponde»: categoria, tipo del
//     negozio, fornitore, linea, tag (che è dove vivono occasione e
//     destinatario), risposta al bisogno, fascia di prezzo.
//
// Un passo di attributo **non toglie nessuno dalla fila**: chi corrisponde sale,
// gli altri restano sotto. È la scelta presa con l'utente, ed è quella giusta
// per una collezione vera: i prodotti che non corrispondono stanno comunque
// nella collezione su Shopify, e una fila che li ignorasse non corrisponderebbe
// più a quello che il cliente vede.

import type { RegolaOrdinamento } from "./ordinamento-vetrina";

/** Gli attributi del prodotto su cui si può dare priorità. */
export const CAMPI = [
  { chiave: "tipo", nome: "Categoria del negozio", spiega: "Il «Tipo» scritto su Shopify: Fiori, Torte, Dolci…" },
  { chiave: "categoria", nome: "Categoria interna", spiega: "Quella decisa da noi in «Imposta categorie e linee»." },
  { chiave: "fornitore", nome: "Fornitore", spiega: "Il «Venditore» di Shopify." },
  { chiave: "linea", nome: "Linea", spiega: "La linea di prodotto, decisa da noi." },
  { chiave: "tag", nome: "Tag (occasione, destinatario)", spiega: "Compleanno, matrimonio, per lei… nei dati vivono qui." },
  { chiave: "risposta", nome: "Risposta al bisogno", spiega: "Quanto in fretta si consegna, dai giorni minimi di evasione." },
  { chiave: "prezzo", nome: "Prezzo", spiega: "Da / a, in euro. Il «da» è compreso, il «a» escluso." },
] as const;

export type Campo = (typeof CAMPI)[number]["chiave"];

export type Passo =
  | { t: "metrica"; m: RegolaOrdinamento }
  | { t: "attr"; campo: Campo; valori?: string[]; da?: number; a?: number };

/** Il minimo che serve per dire se un prodotto corrisponde a un passo. */
export type ProdottoConAttributi = {
  prezzoVendita: number;
  categoria?: string | null;
  tipoShopify?: string | null;
  vendorShopify?: string | null;
  lineaId?: string | null;
  tagShopify?: string | null;
  ggDispMin?: number | null;
};

/** Le fasce di «risposta al bisogno», dai giorni minimi di evasione. */
export const RISPOSTE = [
  { chiave: "urgenze", nome: "Urgenze (oggi)", min: 0, max: 0 },
  { chiave: "domani", nome: "Da domani", min: 1, max: 1 },
  { chiave: "pianificato", nome: "Pianificato (2-3 giorni)", min: 2, max: 3 },
  { chiave: "su_misura", nome: "Su misura (4+ giorni)", min: 4, max: 9999 },
] as const;

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Il prodotto corrisponde al passo?
 *
 * **Un dato mancante non corrisponde**: un prodotto senza tag non è «tutti i
 * tag», e uno senza giorni di consegna non è «urgente». Vale la stessa regola
 * del resto dell'app — quello che non si sa non si inventa, e chi non si sa
 * resta dov'era invece di essere spinto in cima.
 */
export function corrisponde(p: ProdottoConAttributi, passo: Passo): boolean {
  if (passo.t !== "attr") return false;
  const valori = (passo.valori ?? []).map(norm).filter(Boolean);
  switch (passo.campo) {
    case "tipo":
      return !!p.tipoShopify && valori.includes(norm(p.tipoShopify));
    case "categoria":
      return !!p.categoria && valori.includes(norm(p.categoria));
    case "fornitore":
      return !!p.vendorShopify && valori.includes(norm(p.vendorShopify));
    case "linea":
      return !!p.lineaId && valori.includes(norm(p.lineaId));
    case "tag": {
      // I tag arrivano da Shopify in una stringa sola separata da virgole.
      if (!p.tagShopify) return false;
      const suoi = p.tagShopify.split(",").map(norm);
      return valori.some((v) => suoi.includes(v));
    }
    case "risposta": {
      if (p.ggDispMin == null) return false;
      return valori.some((v) => {
        const r = RISPOSTE.find((x) => x.chiave === v);
        return !!r && p.ggDispMin! >= r.min && p.ggDispMin! <= r.max;
      });
    }
    case "prezzo": {
      const prezzo = p.prezzoVendita || 0;
      if (prezzo <= 0) return false; // senza prezzo non si sa: non sale
      // `da` compreso e `a` escluso, come per le fasce di prezzo: così un
      // prodotto da 200 € non cade nel buco fra «fino a 200» e «da 200».
      if (passo.da != null && prezzo < passo.da) return false;
      if (passo.a != null && prezzo >= passo.a) return false;
      return true;
    }
    default:
      return false;
  }
}

/** Legge i passi salvati. Qualunque cosa non si capisca vale «nessun passo». */
export function parsePassi(json: string | null | undefined): Passo[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is Passo =>
        x && typeof x === "object" && (x.t === "metrica" ? typeof x.m === "string" : x.t === "attr" && typeof x.campo === "string"),
    );
  } catch {
    return [];
  }
}

export const serializePassi = (passi: Passo[]) => JSON.stringify(passi);

/** Come si legge un passo in pagina. */
export function etichettaPasso(passo: Passo, nomiMetriche: Record<string, string>, nomiValori?: Record<string, string>): string {
  if (passo.t === "metrica") return nomiMetriche[passo.m] ?? passo.m;
  const campo = CAMPI.find((c) => c.chiave === passo.campo)?.nome ?? passo.campo;
  if (passo.campo === "prezzo") {
    if (passo.da != null && passo.a != null) return `Prima ${campo} da ${passo.da} a ${passo.a} €`;
    if (passo.da != null) return `Prima ${campo} da ${passo.da} €`;
    if (passo.a != null) return `Prima ${campo} sotto ${passo.a} €`;
    return `Prima ${campo}`;
  }
  const valori = (passo.valori ?? []).map((v) => nomiValori?.[v] ?? v);
  if (valori.length === 0) return `Prima ${campo} — da completare`;
  return `Prima ${campo}: ${valori.slice(0, 3).join(", ")}${valori.length > 3 ? ` +${valori.length - 3}` : ""}`;
}

/** «A → B → C», come già si leggono le regole a più criteri. */
export function etichettaPassi(passi: Passo[], nomiMetriche: Record<string, string>, nomiValori?: Record<string, string>): string {
  if (passi.length === 0) return "Nessun passo";
  return passi.map((p) => etichettaPasso(p, nomiMetriche, nomiValori)).join(" → ");
}
