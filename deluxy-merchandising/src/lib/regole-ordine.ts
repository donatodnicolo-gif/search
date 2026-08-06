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

/** Una condizione singola su un attributo. */
export type Condizione = { campo: Campo; valori?: string[]; da?: number; a?: number };

/**
 * Un passo della regola. Tre forme, e la terza è quella che si usa:
 *
 * - `metrica` — mette in fila **tutti** i prodotti secondo un numero;
 * - `attr` — una condizione sola (la forma storica, ancora letta);
 * - `cella` — **più condizioni che valgono tutte insieme**: «Fiori *e* Bouquet
 *   *e* urgenti». È il modo in cui si ragiona davvero davanti a una vetrina —
 *   una casella della griglia — e con una condizione per passo non si poteva
 *   esprimere: «prima i Fiori, poi gli urgenti» sono due priorità diverse, non
 *   «i bouquet di fiori urgenti».
 *
 * Dentro una condizione i valori valgono **in alternativa** (Fiori *o* Torte);
 * dentro una cella le condizioni valgono **tutte**; fra celle diverse vale la
 * **priorità**: la prima decide, le successive spezzano i pareggi.
 */
export type Passo =
  | { t: "metrica"; m: RegolaOrdinamento }
  | { t: "attr"; campo: Campo; valori?: string[]; da?: number; a?: number }
  | { t: "cella"; c: Condizione[] };

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
  // Una **cella** corrisponde solo se corrispondono tutte le sue condizioni:
  // è la differenza fra «bouquet di fiori urgenti» e «fiori, oppure bouquet,
  // oppure urgenti». Una cella vuota non corrisponde a niente — non è «tutti».
  if (passo.t === "cella") return passo.c.length > 0 && passo.c.every((x) => corrisponde(p, { t: "attr", ...x }));
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
    return v.filter((x): x is Passo => {
      if (!x || typeof x !== "object") return false;
      if (x.t === "metrica") return typeof x.m === "string";
      if (x.t === "cella") return Array.isArray(x.c) && x.c.every((y: unknown) => !!y && typeof (y as Condizione).campo === "string");
      return x.t === "attr" && typeof x.campo === "string";
    });
  } catch {
    return [];
  }
}

export const serializePassi = (passi: Passo[]) => JSON.stringify(passi);

/** Una condizione singola, letta in italiano: «Categoria del negozio: Fiori». */
export function etichettaCondizione(c: Condizione, nomiValori?: Record<string, string>): string {
  const campo = CAMPI.find((x) => x.chiave === c.campo)?.nome ?? c.campo;
  if (c.campo === "prezzo") {
    if (c.da != null && c.a != null) return `${campo} da ${c.da} a ${c.a} €`;
    if (c.da != null) return `${campo} da ${c.da} €`;
    if (c.a != null) return `${campo} sotto ${c.a} €`;
    return campo;
  }
  const valori = (c.valori ?? []).map((v) => nomiValori?.[v] ?? v);
  if (valori.length === 0) return `${campo} — da completare`;
  return `${campo}: ${valori.slice(0, 3).join(", ")}${valori.length > 3 ? ` +${valori.length - 3}` : ""}`;
}

/**
 * Come si legge un passo in pagina. Una **cella** si legge con le sue condizioni
 * unite da «e», perché è così che vale: tutte insieme, non una qualsiasi.
 */
export function etichettaPasso(passo: Passo, nomiMetriche: Record<string, string>, nomiValori?: Record<string, string>): string {
  if (passo.t === "metrica") return nomiMetriche[passo.m] ?? passo.m;
  if (passo.t === "cella") {
    if (passo.c.length === 0) return "Cella vuota — da completare";
    return `Prima ${passo.c.map((x) => etichettaCondizione(x, nomiValori)).join(" e ")}`;
  }
  return `Prima ${etichettaCondizione(passo, nomiValori)}`;
}

/** «A → B → C», come già si leggono le regole a più criteri. */
export function etichettaPassi(passi: Passo[], nomiMetriche: Record<string, string>, nomiValori?: Record<string, string>): string {
  if (passi.length === 0) return "Nessun passo";
  return passi.map((p) => etichettaPasso(p, nomiMetriche, nomiValori)).join(" → ");
}

/**
 * Il filtro Prisma dei prodotti che **questa regola porterebbe in cima**: serve
 * a proporre cosa aggiungere a una collezione, non a ordinarla.
 *
 * **Le condizioni valgono in alternativa**, non tutte insieme. Nell'ordinamento
 * sono passi in priorità — «prima i Fiori, poi i Tag Compleanno» — e un prodotto
 * che soddisfa solo il secondo è comunque uno che la regola tira su. Chiedere
 * che li soddisfi tutti proporrebbe quasi sempre niente.
 *
 * `null` quando non c'è nessuna condizione: una regola fatta di sole metriche
 * non dice **quali** prodotti, dice solo in che ordine — e proporre l'intero
 * catalogo sarebbe una risposta finta.
 */
export function filtroSuggerimenti(passi: Passo[]): Record<string, unknown> | null {
  const o: Record<string, unknown>[] = [];
  // Una **cella** diventa un AND delle sue condizioni: proporre chi soddisfa
  // solo una parte di «bouquet di fiori urgenti» vorrebbe dire proporre mezzo
  // catalogo. Fra celle diverse resta l'alternativa.
  for (const cella of passi) {
    if (cella.t !== "cella") continue;
    const dentro = cella.c.map((x) => filtroCondizione(x)).filter((x): x is Record<string, unknown> => x != null);
    if (dentro.length) o.push(dentro.length === 1 ? dentro[0] : { AND: dentro });
  }
  for (const p of passi) {
    if (p.t !== "attr") continue;
    const f = filtroCondizione(p);
    if (f) o.push(f);
  }
  return o.length ? { OR: o } : null;
}

/** Il filtro Prisma di **una** condizione. `null` se non seleziona niente. */
function filtroCondizione(p: Condizione): Record<string, unknown> | null {
  const o: Record<string, unknown>[] = [];
  {
    const valori = (p.valori ?? []).filter(Boolean);
    switch (p.campo) {
      case "tipo":
        if (valori.length) o.push({ tipoShopify: { in: valori } });
        break;
      case "categoria":
        if (valori.length) o.push({ categoria: { in: valori } });
        break;
      case "fornitore":
        if (valori.length) o.push({ vendorShopify: { in: valori } });
        break;
      case "linea":
        if (valori.length) o.push({ lineaId: { in: valori } });
        break;
      case "tag":
        if (valori.length) {
          o.push({ OR: valori.map((t) => ({ tagShopify: { contains: t, mode: "insensitive" as const } })) });
        }
        break;
      case "risposta": {
        const fasce = valori
          .map((v) => RISPOSTE.find((r) => r.chiave === v))
          .filter((r): r is (typeof RISPOSTE)[number] => !!r)
          .map((r) => ({ ggDispMin: { gte: r.min, lte: r.max } }));
        if (fasce.length) o.push({ OR: fasce });
        break;
      }
      case "prezzo": {
        const c: Record<string, number> = {};
        if (p.da != null) c.gte = p.da;
        if (p.a != null) c.lt = p.a;
        if (Object.keys(c).length) o.push({ prezzoVendita: c });
        break;
      }
    }
  }
  return o.length ? { OR: o } : null;
}
