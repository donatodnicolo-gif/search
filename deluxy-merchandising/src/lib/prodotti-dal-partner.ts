// **I prodotti che un partner carica nella piattaforma consegne (app delivery).**
//
// Richiesta dell'utente (11/09/2026): «aggiungi uno stato al prodotto: attesa
// approvazione per i prodotti inseriti dai partner attraverso app delivery» ·
// «assicurati di importare da app delivery categoria e tutte le informazioni sul
// prodotto, comprese le varianti, plus del prodotto ecc» · «l'utente deve mettere
// il prodotto come approvato se va bene e restituire approvato anche all'app
// delivery» · «assicurati che per essere approvato ci siano i campi obbligatori
// come prezzo pubblico» · «riempi in automatico le regole seo» ·
// «classificazione interna è già unico per default» · «partner.id viene già da
// app delivery».
//
// ⚠️⚠️ **I nomi dei campi non sono inventati: sono letti dal codice della
// piattaforma** (`api/prisma/schema.prisma`, model `Product` e `ProductVariant`,
// e `api/src/merchandising-sync/merchandising-sync.module.ts`, che è il punto da
// cui ci manda i prodotti). Il contratto completo — quello che oggi arriva
// davvero e quello che manca ancora dall'altra parte — sta in
// `docs/CONTRATTO-APP-DELIVERY.md`.
//
// La regola che governa tutto il file: **quello che il partner manda è la sua
// offerta, non una decisione nostra**. Si prende com'è, si mette in attesa di
// approvazione, e nessun campo si inventa: una categoria che non riconosciamo
// resta «Da classificare», un prezzo che non c'è resta zero e blocca
// l'approvazione invece di passare per buono.

import { seoDaRegole } from "./seo-regole";

/** Il prodotto come lo manda la piattaforma. Nomi suoi (inglese) e nostri: si accettano entrambi. */
export type ProdottoDaPiattaforma = {
  // — identità —
  sku?: unknown; codice?: unknown;
  name?: unknown; nome?: unknown;
  id?: unknown; idEsterno?: unknown;
  // — testi —
  description?: unknown; descrizione?: unknown;
  /** `shortDesc` sulla piattaforma è **il plus del prodotto** (max 80 caratteri): lo dice il commento della colonna. */
  shortDesc?: unknown; plusProdotto?: unknown;
  /** Le note di specifica: «20-25 fiori», «6/8 porzioni». */
  note?: unknown;
  // — soldi —
  /** `price` = quanto va al partner (per noi è il costo). */
  price?: unknown; costoProduzione?: unknown;
  /** `publicPrice` = **il prezzo pubblico**: senza, non si approva. */
  publicPrice?: unknown; prezzoVendita?: unknown;
  // — classificazione —
  category?: { name?: unknown } | null; categoryName?: unknown; categoria?: unknown;
  /** `type`: UNICO | NON_UNICO. */
  type?: unknown;
  tipologiaVendita?: unknown;
  line?: unknown; linea?: unknown;
  // — partner —
  partnerId?: unknown;
  partner?: { insegna?: unknown; legacyId?: unknown } | null;
  partnerLegacyId?: unknown;
  partnerInsegna?: unknown;
  // — consegna e magazzino —
  prepDays?: unknown;
  notPhysical?: unknown;
  controlStock?: unknown;
  stock?: unknown;
  // — nome per il partner —
  alternateName?: unknown; nomePartner?: unknown;
  useAlternateName?: unknown; nomePartnerAttivo?: unknown;
  // — foto —
  imageUrl?: unknown; immagine?: unknown;
  /** `images`: array di URL, o la stringa JSON che la piattaforma salva in colonna. */
  images?: unknown;
  // — varianti —
  hasVariants?: unknown;
  optionTitle?: unknown;
  variants?: unknown; varianti?: unknown;
  // — altro —
  origine?: unknown; createdFrom?: unknown;
  fase?: unknown;
  noteSviluppo?: unknown;
};

export type VarianteDaPiattaforma = {
  name?: unknown; nome?: unknown;
  sku?: unknown;
  price?: unknown; publicPrice?: unknown;
  note?: unknown;
  stock?: unknown;
  imageUrl?: unknown;
  prepDays?: unknown;
};

const testo = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s : null;
};
const numero = (v: unknown): number => {
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const numeroOpzionale = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
};
const intero = (v: unknown): number | null => {
  const n = numeroOpzionale(v);
  return n == null ? null : Math.round(n);
};
const booleano = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

export const senzaAccenti = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * La nostra categoria, dal nome che manda la piattaforma.
 *
 * ⚠️ **Non si indovina.** Si confronta col nome delle categorie che abbiamo
 * (senza maiuscole né accenti) e con la chiave; quello che non combacia resta
 * `DA_CLASSIFICARE`, che è una domanda aperta e si vede. È la stessa regola che
 * la piattaforma applica a noi quando tira i nostri prodotti («meglio senza
 * categoria che in quella sbagliata»).
 */
export function categoriaDaPiattaforma(
  nomeDiLà: string | null,
  nostre: { chiave: string; nome: string }[],
): string {
  if (!nomeDiLà) return "DA_CLASSIFICARE";
  const cercata = senzaAccenti(nomeDiLà);
  const perChiave = nostre.find((c) => senzaAccenti(c.chiave.replace(/_/g, " ")) === cercata);
  const perNome = nostre.find((c) => senzaAccenti(c.nome) === cercata);
  return (perNome ?? perChiave)?.chiave ?? "DA_CLASSIFICARE";
}

/** Gli URL delle foto, sia come array sia come stringa JSON (la piattaforma li salva così). */
export function fotoDaPiattaforma(p: ProdottoDaPiattaforma): string[] {
  const prima = testo(p.imageUrl) ?? testo(p.immagine);
  const altre: string[] = [];
  const grezzo = p.images;
  const lista = Array.isArray(grezzo)
    ? grezzo
    : typeof grezzo === "string" && grezzo.trim().startsWith("[")
      ? (() => { try { return JSON.parse(grezzo) as unknown[]; } catch { return []; } })()
      : [];
  for (const x of lista) {
    const u = testo(x);
    if (u) altre.push(u);
  }
  return [...new Set([prima, ...altre].filter((x): x is string => !!x))];
}

export type VarianteConvertita = { nome: string; sku: string | null; prezzo: number | null; prezzoPartner: number | null; note: string | null; giacenza: number };

/** Le varianti, con i nomi della piattaforma o i nostri. */
export function variantiDaPiattaforma(p: ProdottoDaPiattaforma): VarianteConvertita[] {
  const grezze = (Array.isArray(p.variants) ? p.variants : Array.isArray(p.varianti) ? p.varianti : []) as VarianteDaPiattaforma[];
  const fuori: VarianteConvertita[] = [];
  const visti = new Set<string>();
  for (const v of grezze) {
    if (!v || typeof v !== "object") continue;
    const nome = testo(v.nome) ?? testo(v.name);
    if (!nome) continue;
    const chiave = senzaAccenti(nome);
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    fuori.push({
      nome: nome.slice(0, 120),
      sku: testo(v.sku),
      // Il prezzo pubblico della variante è il prezzo; `price` è quanto va al partner.
      prezzo: numeroOpzionale(v.publicPrice),
      prezzoPartner: numeroOpzionale(v.price),
      note: testo(v.note)?.slice(0, 500) ?? null,
      giacenza: Math.max(0, intero(v.stock) ?? 0),
    });
  }
  return fuori;
}

/** Quello che si scrive sul prodotto, già pronto per Prisma (senza varianti e senza fase). */
export type CampiProdotto = {
  nome: string;
  descrizione: string | null;
  plusProdotto: string | null;
  note: string | null;
  categoria: string;
  costoProduzione: number;
  prezzoVendita: number;
  prezzoPartner: number | null;
  immagine: string | null;
  tipologiaVendita: string;
  ggDispMin: number | null;
  nonFisicoShopify: boolean | null;
  nomePartner: string | null;
  nomePartnerAttivo: boolean;
  partnerPiattaformaId: string | null;
  partnerInsegna: string | null;
  partnerIdShopify: string | null;
  origine: string;
  idEsterno: string | null;
  noteSviluppo: string | null;
};

/**
 * Dal corpo che manda la piattaforma ai nostri campi.
 *
 * ⭐ **La classificazione interna parte da «unico»** (regola dell'utente): un
 * prodotto caricato da un partner lo vende quel partner, col suo listino — che
 * è la definizione di `unico`. La piattaforma manda `type: UNICO | NON_UNICO` e
 * a volte la `tipologiaVendita` già decisa: se c'è si rispetta, altrimenti
 * `unico`. Resta cambiabile dal modulo: è una classificazione nostra.
 */
export function campiDaPiattaforma(
  p: ProdottoDaPiattaforma,
  categorieNostre: { chiave: string; nome: string }[],
): CampiProdotto {
  const foto = fotoDaPiattaforma(p);
  const nomePartner = testo(p.nomePartner) ?? testo(p.alternateName);
  const tipologiaChiesta = testo(p.tipologiaVendita);
  const partnerLegacy = testo(p.partnerLegacyId) ?? testo(p.partner?.legacyId);
  return {
    nome: (testo(p.nome) ?? testo(p.name) ?? "").slice(0, 300),
    descrizione: testo(p.descrizione) ?? testo(p.description),
    // Il «plus del prodotto»: la riga in cima alla scheda del cliente.
    plusProdotto: (testo(p.plusProdotto) ?? testo(p.shortDesc))?.slice(0, 140) ?? null,
    note: testo(p.note)?.slice(0, 500) ?? null,
    categoria: categoriaDaPiattaforma(
      testo(p.categoria) ?? testo(p.categoryName) ?? testo(p.category?.name),
      categorieNostre,
    ),
    // `price` di là è quello che va al partner: per noi è il costo, e si scrive
    // anche nel campo che lo dice — un numero solo, due letture diverse.
    costoProduzione: numero(p.costoProduzione ?? p.price),
    prezzoVendita: numero(p.prezzoVendita ?? p.publicPrice),
    prezzoPartner: numeroOpzionale(p.price) ?? null,
    immagine: foto[0] ?? null,
    tipologiaVendita: tipologiaChiesta ?? "unico",
    ggDispMin: intero(p.prepDays),
    nonFisicoShopify: booleano(p.notPhysical),
    nomePartner: nomePartner?.slice(0, 200) ?? null,
    // Se il partner ha dato un nome suo, si usa: è il nome con cui lui lo conosce.
    nomePartnerAttivo: booleano(p.nomePartnerAttivo) ?? booleano(p.useAlternateName) ?? !!nomePartner,
    partnerPiattaformaId: testo(p.partnerId),
    partnerInsegna: testo(p.partnerInsegna) ?? testo(p.partner?.insegna),
    // Solo se è un numero: il metafield `custom.partner_id` su Shopify è
    // `number_integer`, e un cuid là dentro farebbe rifiutare tutto il prodotto.
    partnerIdShopify: partnerLegacy && /^\d+$/.test(partnerLegacy) ? partnerLegacy : null,
    origine: testo(p.origine) ?? testo(p.createdFrom) ?? "platform",
    idEsterno: testo(p.idEsterno) ?? testo(p.id),
    noteSviluppo: testo(p.noteSviluppo),
  };
}

/**
 * Viene dalla piattaforma consegne? (l'origine la scrive chi manda).
 *
 * ⚠️ 11/09/2026 — **«partner» ci voleva.** «Torta Damiano», il primo prodotto
 * vero arrivato da un partner (Chanel Test, 09:26), porta `origine: "partner"`,
 * non `platform`: con l'elenco di prima sarebbe finita in «prototipo» invece
 * che in attesa di approvazione, cioè fuori dalla coda che questa funzione
 * esiste per riempire. Un elenco di parole chiave si controlla su un dato vero,
 * non sul nome che ci si aspetta.
 */
export function daPiattaforma(origine: string | null | undefined): boolean {
  const o = (origine ?? "").toLowerCase().trim();
  return ["platform", "piattaforma", "partner", "app-delivery", "delivery", "consegne"].includes(o);
}

/**
 * ⭐ La SEO si riempie da sola (regola dell'utente: «riempi in automatico le
 * regole seo»). Sono le stesse regole del modulo — nome + firma per il titolo,
 * le prime frasi della descrizione (o il plus) per il testo — e **non si
 * inventa niente**: senza materiale i campi restano vuoti, perché una
 * descrizione SEO scritta a caso è quella che finisce su Google.
 */
export function seoAutomatica(c: { nome: string; descrizione: string | null; plusProdotto: string | null }) {
  const { titolo, descrizione } = seoDaRegole({ nome: c.nome, descrizione: c.descrizione, plusProdotto: c.plusProdotto });
  return { seoTitolo: titolo || null, seoDescrizione: descrizione || null };
}

/**
 * **Che cosa manca per poter approvare.** Torna le frasi da mostrare: vuota
 * vuol dire che si può.
 *
 * ⚠️ Il **prezzo pubblico** è il primo (richiesta esplicita dell'utente): un
 * prodotto approvato senza prezzo finisce in vetrina a zero euro, oppure non ci
 * finisce affatto e nessuno capisce perché. Uno zero qui non è un prezzo: è un
 * dato che manca — la stessa regola con cui la piattaforma tiene `approved:
 * false` i prodotti nostri senza costo.
 */
export function mancanzePerApprovare(p: {
  nome: string;
  codice: string;
  prezzoVendita: number;
  categoria: string;
  tipologiaVendita: string | null;
  descrizione?: string | null;
  plusProdotto?: string | null;
}): string[] {
  const mancano: string[] = [];
  // ⚠️ Niente grassetto con gli asterischi: questa frase finisce anche in un
  // messaggio di errore nell'indirizzo, dove il markdown si legge com'è scritto.
  if (!(p.prezzoVendita > 0)) mancano.push("il prezzo pubblico (oggi è 0: senza, il prodotto non si può vendere)");
  if (!p.nome?.trim()) mancano.push("il nome");
  if (!p.codice?.trim()) mancano.push("lo SKU");
  if (!p.categoria || p.categoria === "DA_CLASSIFICARE") mancano.push("la categoria (è «Da classificare»: decide le sezioni della scheda sul sito)");
  if (!p.tipologiaVendita?.trim()) mancano.push("la classificazione interna (la piattaforma consegne la legge per scegliere il fornitore)");
  if (!(p.descrizione ?? "").trim() && !(p.plusProdotto ?? "").trim()) {
    mancano.push("una descrizione o almeno il plus del prodotto (è quello che legge il cliente, ed è la base della SEO)");
  }
  return mancano;
}
