"use server";

// **Far nascere e modificare un prodotto dal modulo unico** (04/09/2026).
//
// Le decisioni di sostanza, nell'ordine in cui contano:
// 1. **Lo SKU è unico**: quello del form si tiene se libero, se no se ne genera
//    un altro finché non lo è — e devono essere liberi anche gli SKU derivati
//    delle varianti («-1», «-2»…). Un doppione non entra mai.
// 2. **Pubblico = su Shopify.** Con la fase «Pubblico» il prodotto si crea
//    PRIMA sul negozio e poi qui, collegato (`shopifyId`): se il negozio
//    rifiuta, qui nasce lo stesso come «approvato», con l'errore scritto nella
//    cronaca e nel banner.
// 3. Alla pubblicazione: foto e video già nei Files del negozio si agganciano;
//    la collezione scelta lo accoglie; i campi del negozio (metafield) si
//    scrivono; se si è chiesto, titolo e descrizione si traducono. Ogni passo
//    può fallire per conto suo: si va avanti e si riporta tutto nell'esito.
// 4. **Modifica** (`aggiornaProdottoCompleto`): la scheda si aggiorna qui e,
//    se il prodotto è sul negozio, anche là (titolo, descrizione, stato,
//    campi, varianti per SKU, foto nuove, collezione). Se non era sul negozio
//    e passa a Pubblico, si pubblica come un nuovo.
// 5. **Finestra di pubblicazione**: le date si salvano sempre; con «dal» nel
//    futuro il prodotto è bozza sul negozio e il cron delle 04:05 lo accende.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { traduciScheda } from "./ai-traduzioni";
import { TIPOLOGIE_VENDITA } from "./dominio";
import { prisma } from "./db";
import { giornoRoma, isoGiornoValido, mezzanotteRomaDi } from "./fuso";
import { definizioniInCache, metafieldPerShopify, scartiMetafield } from "./metafield-definizioni";
import { descrizionePerNegozio } from "./descrizione-prodotto";
import { seoDaRegole } from "./seo-regole";
import { elencoNegozi, tokenDi } from "./negozi";
import { aggiornaProdottoSuShopify, cambiaStatoSuNegozio, creaProdottoSuShopify } from "./shopify-admin";
import { colonneDaMetafield } from "./shopify-collezioni";
import { agganciaFileAlProdotto, aggiungiProdottoACollezione, rimuoviProdottoDaCollezione } from "./shopify-media";
import { registraTraduzioniProdotto } from "./shopify-traduzioni-scrittura";

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
function numero(fd: FormData, k: string): number {
  const n = parseFloat(testo(fd, k).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function soldiDa(v: string): number {
  const n = parseFloat((v || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function skuCasuale(): string {
  return String(Math.floor(1_000_000 + Math.random() * 9_000_000));
}

type MediaDalForm = {
  shopifyFileId: string;
  tipo: "immagine" | "video";
  url: string | null;
  anteprima: string | null;
  stato: "pronto" | "in-elaborazione" | "fallito";
  nome: string;
  negozio: string;
};
type VarianteDalForm = { nome: string; sku: string | null; prezzo: string; costo: string; giacenza: string; prezzoPartner?: string; note?: string };
const partnerDa = (v: string | undefined): number | null => (v && v.trim() ? soldiDa(v) : null);

/** È preso da un altro prodotto/variante (escludendo, in modifica, il prodotto stesso). */
async function preso(codice: string, esclusoProdottoId?: string): Promise<boolean> {
  const p = await prisma.prodotto.findUnique({ where: { codice }, select: { id: true } });
  if (p && p.id !== esclusoProdottoId) return true;
  const v = await prisma.variante.findUnique({ where: { sku: codice }, select: { prodottoId: true } });
  return !!v && v.prodottoId !== esclusoProdottoId;
}

/** Il codice libero: quello chiesto se non è preso (con i derivati), altrimenti uno nuovo. */
async function codiceLibero(chiesto: string, quanteVarianti = 0, esclusoProdottoId?: string): Promise<{ codice: string; cambiato: boolean }> {
  const tuttiLiberi = async (c: string) => {
    if (await preso(c, esclusoProdottoId)) return false;
    for (let i = 1; i <= quanteVarianti; i++) if (await preso(`${c}-${i}`, esclusoProdottoId)) return false;
    return true;
  };
  const iniziale = chiesto || skuCasuale();
  if (await tuttiLiberi(iniziale)) return { codice: iniziale, cambiato: false };
  for (let i = 0; i < 25; i++) {
    const c = skuCasuale();
    if (await tuttiLiberi(c)) return { codice: c, cambiato: true };
  }
  throw new Error("Non ho trovato un codice libero dopo 25 tentativi.");
}

function leggiJson<T>(fd: FormData, chiave: string, vuoto: T): T {
  try {
    return (JSON.parse(testo(fd, chiave) || "null") as T) ?? vuoto;
  } catch {
    return vuoto;
  }
}

/**
 * **Le fasi che arrivano su Shopify, e con quale stato.**
 *
 * ⭐ 09/09/2026 (utente): «lo stato approvato fa finire il prodotto in Shopify
 * in bozza». Prima ci arrivava solo «in vendita»: un prodotto approvato restava
 * soltanto qui, e per vederlo sul negozio bisognava dichiararlo in vendita —
 * cioè accenderlo davanti ai clienti per poterlo guardare.
 *
 * ⚠️ **ACTIVE solo con «in vendita» E la finestra aperta.** «Approvato» crea la
 * scheda ma la lascia DRAFT: il cliente non la vede. Se questa regola si
 * allentasse, un prodotto approvato finirebbe in vendita senza che nessuno
 * l'abbia deciso.
 */
const FASI_SU_SHOPIFY = ["in_vendita", "approvato"] as const;
const vaSuShopify = (fase: string) => (FASI_SU_SHOPIFY as readonly string[]).includes(fase);
const statoPerShopify = (fase: string, finestraAperta: boolean): "ACTIVE" | "DRAFT" =>
  fase === "in_vendita" && finestraAperta ? "ACTIVE" : "DRAFT";

/** Quello che il modulo manda, letto una volta per entrambe le azioni. */
async function leggiModulo(fd: FormData, indietro: (e: string) => never) {
  const nome = testo(fd, "nome");
  if (!nome) indietro("Il nome del prodotto è obbligatorio.");
  const negozi = await elencoNegozi();
  const negozio = negozi.find((n) => n.id === testo(fd, "negozioId")) ?? null;
  if (!negozio) indietro("Scegli il brand / negozio.");
  const negozioOk = negozio as NonNullable<typeof negozio>;
  // ⭐ 07/09/2026 (chiesto dall'utente): il prodotto si pubblica su PIÙ negozi, nuovo o
  // esistente. Il negozio scelto sopra resta il **principale** (categorie, Files delle
  // foto, `shopifyId`); gli altri sono «anche su»: ognuno riceve la sua copia e la riga
  // in `PubblicazioneNegozio` dice dove sta e con quale id. Un negozio che non esiste o
  // è spento non passa: meglio fermarsi che pubblicare a metà senza dirlo.
  const altriId = [...new Set(leggiJson<string[]>(fd, "negoziPubblicazioneJson", []).map(String))].filter((x) => x !== negozioOk.id);
  const altriNegozi = altriId.map((x) => negozi.find((n) => n.id === x && n.attivo)).filter((n): n is NonNullable<typeof n> => !!n);
  if (altriNegozi.length !== altriId.length) indietro("Uno dei negozi scelti per la pubblicazione non esiste o non è attivo.");
  const negoziScelti = new Set([negozioOk.nome, ...altriNegozi.map((n) => n.nome)]);

  const fase = testo(fd, "fase") || "concept";
  const categoria = testo(fd, "categoria") || "DA_CLASSIFICARE";
  // ⭐ 09/09/2026 (utente): «per i nuovi prodotti non appare su Shopify "Tipo di
  // prodotto"». Era vero alla lettera: i tre punti che creano la scheda
  // passavano `tipo: ""` e `vendor: ""`.
  //
  // ⚠️ **Non si deduce dalla categoria.** Misurato sulle schede vive di Gifts:
  // la nostra REGALI là diventa «Cosmetici», «Gioielli», «Gift Card», «Box
  // Regalo», «Palloncini»; TORTE_DOLCI diventa «Torte», «Cake Design»,
  // «Dolci», «Cioccolateria». Il tipo di Shopify è più fine della nostra
  // categoria: dedurlo vorrebbe dire appiattire sette valori in uno. Lo scrive
  // chi compila, e per i prodotti importati è già in `tipoShopify` (3.542 su
  // 5.069), che il modulo ripropone.
  const tipoShopify = testo(fd, "tipoShopify").trim().slice(0, 120);
  // ⭐ 06/09/2026 (regola utente): la tipologia di vendita è OBBLIGATORIA — è lei a dire
  // alla piattaforma consegne come si sceglie il fornitore e come si fa il prezzo. Un
  // valore inventato non passa: si accettano solo le quattro voci della legenda.
  const tipologiaVendita = testo(fd, "tipologiaVendita");
  if (!tipologiaVendita) indietro("Scegli la classificazione interna: serve alla piattaforma consegne per assegnare il fornitore.");
  if (!(TIPOLOGIE_VENDITA as readonly string[]).includes(tipologiaVendita)) indietro("Classificazione interna non valida.");
  // Le collezioni: più d'una (chiesto dall'utente), solo manuali del negozio scelto.
  const collezioniId = [...new Set(leggiJson<string[]>(fd, "collezioniJson", []).map(String).filter(Boolean))];
  const collezioni = collezioniId.length
    ? await prisma.collezioneShopify.findMany({ where: { id: { in: collezioniId } }, select: { id: true, shopifyId: true, titolo: true, tipo: true, negozio: true } })
    : [];
  if (collezioni.length !== collezioniId.length) indietro("Una delle collezioni scelte non esiste più: rifai l'import o scegline un'altra.");
  if (collezioni.some((c) => !negoziScelti.has(c.negozio))) indietro("Una delle collezioni scelte è di un negozio in cui il prodotto non si pubblica.");

  const media = leggiJson<MediaDalForm[]>(fd, "mediaJson", []).filter((m) => m && m.shopifyFileId && m.stato !== "fallito" && m.negozio === negozioOk.nome);
  const variantiForm = leggiJson<VarianteDalForm[]>(fd, "variantiJson", []).filter((v) => v && v.nome?.trim());
  const nomeOpzione = testo(fd, "nomeOpzione") || "Formato";
  const controllaStock = fd.get("controllaStock") != null;
  const giacenza = controllaStock ? Math.max(0, Math.round(numero(fd, "giacenza"))) : 0;

  // Le date valgono solo con la fase Pubblico (deciso dall'utente): senza,
  // si azzerano. La fine è facoltativa.
  const dalIso = fase === "in_vendita" ? testo(fd, "pubblicatoDal") : "";
  const alIso = fase === "in_vendita" ? testo(fd, "pubblicatoFinoAl") : "";
  const pubblicatoDal = isoGiornoValido(dalIso) ? mezzanotteRomaDi(dalIso) : null;
  const pubblicatoFinoAl = isoGiornoValido(alIso) ? mezzanotteRomaDi(alIso) : null;
  // I tag: puliti e senza doppioni; vanno sul negozio e in `tagShopify`.
  const tags = [...new Set(leggiJson<string[]>(fd, "tagsJson", []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 250);
  if (pubblicatoDal && pubblicatoFinoAl && pubblicatoFinoAl < pubblicatoDal) indietro("La fine della pubblicazione viene prima dell'inizio.");
  const oggi = giornoRoma(new Date());
  const finestraAperta = (!pubblicatoDal || pubblicatoDal <= oggi) && (!pubblicatoFinoAl || pubblicatoFinoAl >= oggi);

  // I campi del negozio: si tengono solo le chiavi definite dal negozio.
  const definizioni = await definizioniInCache(negozioOk.nome);
  const metafieldGrezzi = leggiJson<Record<string, string>>(fd, "metafieldJson", {});
  const chiaviValide = new Set(definizioni.map((d) => `${d.namespace}.${d.key}`));
  const metafield: Record<string, string> = {};
  for (const [k, v] of Object.entries(metafieldGrezzi)) if (chiaviValide.has(k) && typeof v === "string" && v.trim() !== "") metafield[k] = v;

  // **Lo stato voluto, negozio per negozio** (08/09/2026: «lo stato può essere
  // diverso per ogni negozio», e la decisione è nostra). I campi arrivano come
  // `stato:<nome del negozio>`; vuoto vuol dire «lascia com'è», che non è la
  // stessa cosa di «mettilo attivo» — per questo si tiene la distinzione
  // invece di far cadere il vuoto su un valore di comodo.
  const statiVoluti: Record<string, string> = {};
  for (const [chiave, valore] of fd.entries()) {
    if (!chiave.startsWith("stato:") || typeof valore !== "string") continue;
    const v = valore.trim();
    if (v === "ACTIVE" || v === "DRAFT" || v === "ARCHIVED") statiVoluti[chiave.slice(6)] = v;
  }

  // **I tre punti e le sezioni della scheda** (08/09/2026, richiesta
  // dell'utente). Il plus del prodotto è una riga sola: gli altri due punti
  // sono del sito e stanno sul negozio, non qui — ricopiarli su ogni prodotto
  // avrebbe voluto dire cambiarli in mille posti il giorno che cambiano.
  // ⭐ 08/09/2026 (utente): il nome per i partner. Il testo si tiene anche a
  // spunta spenta — chi la riaccende ritrova quello che aveva scritto — ma
  // vale solo se la spunta è accesa: è la spunta a dire «ho deciso».
  const nomePartnerAttivo = testo(fd, "nomePartnerAttivo") === "1";
  const nomePartner = testo(fd, "nomePartner").slice(0, 200).trim() || null;
  const plusProdotto = testo(fd, "plusProdotto").slice(0, 140).trim() || null;
  // Le sezioni arrivano come { "Gifts": { "Significato": "…" } }: si tiene solo
  // ciò che è testo, si buttano i vuoti e si limita la lunghezza. Non si
  // valida contro le sezioni previste: la categoria può cambiare dopo, e un
  // testo scritto da una persona non si cancella perché non lo aspettavamo.
  const sezioniGrezze = leggiJson<Record<string, Record<string, string>>>(fd, "sezioniJson", {});
  const sezioniScheda: Record<string, Record<string, string>> = {};
  for (const [sito, campi] of Object.entries(sezioniGrezze)) {
    if (typeof sito !== "string" || !campi || typeof campi !== "object") continue;
    const puliti: Record<string, string> = {};
    for (const [nomeSezione, valore] of Object.entries(campi)) {
      if (typeof valore !== "string") continue;
      const v = valore.trim();
      if (v) puliti[String(nomeSezione).slice(0, 80)] = v.slice(0, 4000);
    }
    if (Object.keys(puliti).length) sezioniScheda[sito.slice(0, 80)] = puliti;
  }

  // ⭐ 09/09/2026 (utente): «porta la SEO ad essere autocompilata con delle
  // regole anche in sede di creazione del prodotto». Se chi compila l'ha
  // scritta, vince la sua; se l'ha lasciata vuota, la scrive la regola.
  // ⚠️ Solo la nostra **bozza** (`seoTitolo`/`seoDescrizione`): i campi
  // `…Shopify` sono quello che sta sul negozio, e da qui non si tocca. Il testo
  // che i clienti leggono su Google cambia solo quando qualcuno lo manda.
  const seoScritta = { titolo: testo(fd, "seoTitolo").trim(), descrizione: testo(fd, "seoDescrizione").trim() };
  const seoRegola = seoDaRegole({
    nome,
    descrizione: testo(fd, "descrizione") || null,
    plusProdotto: testo(fd, "plusProdotto") || null,
    sezioni: [...new Set(Object.values(sezioniScheda ?? {}).flatMap((v) => Object.keys((v ?? {}) as Record<string, string>)))],
  });
  const seo = {
    titolo: (seoScritta.titolo || seoRegola.titolo).slice(0, 300) || null,
    descrizione: (seoScritta.descrizione || seoRegola.descrizione).slice(0, 600) || null,
  };

  return {
    nome,
    negozio: negozioOk,
    altriNegozi,
    statiVoluti,
    nomePartner,
    nomePartnerAttivo,
    plusProdotto,
    sezioniScheda,
    tuttiNegozi: negozi.filter((n) => n.attivo),
    fase,
    categoria,
    tipoShopify,
    seo,
    tipologiaVendita,
    note: testo(fd, "note") || null,
    collezioni,
    media,
    variantiForm,
    nomeOpzione,
    controllaStock,
    giacenza,
    pubblicatoDal,
    pubblicatoFinoAl,
    finestraAperta,
    dalIso,
    descrizione: testo(fd, "descrizione") || null,
    brief: testo(fd, "brief") || null,
    materiali: testo(fd, "materiali") || null,
    palette: testo(fd, "palette") || null,
    costo: numero(fd, "costoProduzione"),
    prezzoScritto: numero(fd, "prezzoVendita"),
    // Quanto va al partner: dato interno, vuoto = non indicato (non zero).
    prezzoPartner: testo(fd, "prezzoPartner") ? numero(fd, "prezzoPartner") : null,
    // ⭐ 08/09/2026: la spunta è **per negozio** (`traduci:<nome>`), perché le
    // lingue attive cambiano da un sito all'altro. Resta accettata anche la
    // vecchia chiave senza nome: un modulo aperto prima del cambiamento e
    // salvato dopo non deve perdere la scelta.
    traduci: fd.get("traduci") != null || [...fd.keys()].some((k) => k.startsWith("traduci:")),
    traduciSu: new Set([...fd.keys()].filter((k) => k.startsWith("traduci:")).map((k) => k.slice(8))),
    definizioni,
    metafield,
    tags,
    codiceChiesto: testo(fd, "codice").replace(/\D/g, ""),
  };
}

type Modulo = Awaited<ReturnType<typeof leggiModulo>>;

function prezzoBaseDa(m: Modulo, varianti: { prezzo: number }[]): number {
  if (varianti.length && m.prezzoScritto === 0) {
    const min = Math.min(...varianti.map((v) => v.prezzo).filter((p) => p > 0), Infinity);
    return Number.isFinite(min) ? min : 0;
  }
  return m.prezzoScritto;
}

/** Le traduzioni si fanno UNA volta e si scrivono su ogni negozio: la cache passa di mano in mano. */
type CacheTraduzioni = { valore?: Awaited<ReturnType<typeof traduciScheda>> };
async function traduzioniDi(m: Modulo, cache: CacheTraduzioni) {
  if (!cache.valore) cache.valore = await traduciScheda({ titolo: m.nome, descrizione: m.descrizione ?? "" });
  return cache.valore;
}

/** I passi comuni dopo la creazione sul negozio: foto, collezioni, traduzioni. Torna le collezioni in cui è entrato. */
async function completaSulNegozio(
  m: Modulo,
  negozioToken: { dominio: string; token: string },
  shopifyId: string,
  media: MediaDalForm[],
  cronaca: string[],
  avvisi: string[],
  traduzioni: CacheTraduzioni = {},
  nomeNegozio: string = m.negozio.nome,
): Promise<{ entrate: string[] }> {
  const entrate: string[] = [];
  // ⚠️⚠️ **Un id di file vale solo nel negozio che lo ospita.** Dal 09/09 le
  // foto si caricano prima di scegliere dove va il prodotto (richiesta
  // dell'utente: «la foto è un elemento comune, falle già inserire prima»),
  // quindi possono stare nei Files di un negozio diverso da questo. Quelle si
  // agganciano per **indirizzo** alla creazione, non per id: passarle qui
  // farebbe fallire l'aggancio di tutto il lotto, comprese le foto giuste.
  const suoi = media.filter((x) => x.negozio === nomeNegozio);
  if (suoi.length) {
    const r = await agganciaFileAlProdotto(negozioToken, suoi.map((x) => x.shopifyFileId), shopifyId);
    if (r.ok) cronaca.push(`${suoi.length} file agganciati al prodotto.`);
    else avvisi.push(`Foto/video non agganciati: ${r.errore}`);
  }
  for (const c of m.collezioni) {
    if (c.tipo !== "manuale") {
      avvisi.push(`«${c.titolo}» è una collezione automatica: chi ci entra lo decide la regola del negozio.`);
      continue;
    }
    const r = await aggiungiProdottoACollezione(negozioToken, c.shopifyId, shopifyId);
    if (r.ok) {
      cronaca.push(`Messo nella collezione «${c.titolo}».`);
      entrate.push(c.id);
    } else avvisi.push(`Non entrato in «${c.titolo}»: ${r.errore}`);
  }
  // ⚠️ Si traduce **su questo negozio** solo se la sua spunta è accesa: le
  // lingue sono sue, e chi non le ha non deve pagare una chiamata all'AI.
  if (m.traduci && (m.traduciSu.size === 0 || m.traduciSu.has(m.negozio.nome))) {
    const t = await traduzioniDi(m, traduzioni);
    if (!t.ok) avvisi.push(`Traduzioni non fatte: ${t.errore}`);
    else {
      const r = await registraTraduzioniProdotto(negozioToken, shopifyId, t.traduzioni);
      if (r.scritte > 0) cronaca.push(`Traduzioni scritte sul negozio: ${r.scritte} voci.`);
      if (r.errori.length) avvisi.push(`Traduzioni rifiutate: ${r.errori.join(" · ")}`);
    }
  }
  return { entrate };
}

type EsitoAltroNegozio = {
  negozio: string;
  shopifyId: string | null;
  handle: string | null;
  statoShopify: string | null;
  errore: string | null;
  /** Le collezioni (id nostri) in cui è entrato su quel negozio. */
  entrate: string[];
};

/**
 * **Pubblica il prodotto anche su un altro negozio** (07/09/2026). Stessa scheda del
 * principale — titolo, descrizione, tag, varianti con gli stessi SKU (lo stesso
 * prodotto su due negozi tiene lo stesso SKU: è la regola del 06/09), finestra —
 * ma coi campi (metafield) filtrati sulle definizioni di QUEL negozio, le sue
 * collezioni manuali, e le foto passate per URL (i file stanno nei Files del
 * principale: Shopify le copia da lì). Ogni negozio è un giro a sé: se uno
 * rifiuta, gli altri vanno avanti e l'esito lo dice negozio per negozio.
 */
async function pubblicaSuAltroNegozio(
  m: Modulo,
  negozio: Modulo["altriNegozi"][number],
  dati: {
    codice: string;
    varianti: { nome: string; sku: string; prezzo: number; giacenza: number }[];
    prezzoBase: number;
    stato: "ACTIVE" | "DRAFT";
    immagini: string[];
  },
  traduzioni: CacheTraduzioni,
  cronaca: string[],
  avvisi: string[]
): Promise<EsitoAltroNegozio> {
  const base = { negozio: negozio.nome, shopifyId: null, handle: null, statoShopify: null, entrate: [] as string[] };
  if (!negozio.permessi.includes("write_products")) {
    avvisi.push(`${negozio.nome}: manca il permesso write_products, non pubblicato là.`);
    return { ...base, errore: "manca write_products" };
  }
  const token = await tokenDi(negozio.id).catch(() => null);
  if (!token) {
    avvisi.push(`${negozio.nome}: il negozio non sa autenticarsi su Shopify, non pubblicato là.`);
    return { ...base, errore: "credenziali non valide" };
  }
  const defs = await definizioniInCache(negozio.nome);
  const valide = new Set(defs.map((d) => `${d.namespace}.${d.key}`));
  const metafield = Object.fromEntries(Object.entries(m.metafield).filter(([k]) => valide.has(k)));
  // ⚠️ È QUI che si rompeva: la chiave esiste anche su questo negozio, ma le
  // scelte ammesse sono le sue. Un valore fuori elenco faceva rifiutare
  // **l'intero prodotto** («Business Deluxy non ha creato il prodotto»), non
  // solo il campo. Ora il valore si scarta e si dice; la scheda nasce.
  for (const riga of scartiMetafield(metafield, defs)) avvisi.push(`${negozio.nome}: ${riga}`);
  const esito = await creaProdottoSuShopify(token, {
    titolo: m.nome,
    descrizioneHtml: await descrizionePerNegozio(m, negozio.nome),
    tipo: m.tipoShopify,
    vendor: "Deluxy",
    tags: m.tags,
    stato: dati.stato,
    prezzo: String(dati.prezzoBase),
    prezzoConfronto: "",
    sku: dati.codice,
    immagini: dati.immagini,
    fisico: true,
    controllaStock: m.controllaStock,
    giacenza: String(m.giacenza),
    nomeOpzione: m.nomeOpzione,
    varianti: dati.varianti.map((v) => ({ nome: v.nome, sku: v.sku, prezzo: String(v.prezzo || dati.prezzoBase), prezzoConfronto: "", giacenza: String(v.giacenza) })),
    metafield: metafieldPerShopify(metafield, defs).map((x) => ({ chiave: x.key, valore: x.value, namespace: x.namespace, tipo: x.type })),
  });
  cronaca.push(...esito.passi.map((p) => `${negozio.nome}: ${p}`));
  if (!esito.prodottoId) {
    const motivo = esito.errori.map((e) => (e.campo ? `${e.campo}: ${e.messaggio}` : e.messaggio)).join(" · ") || "esito sconosciuto";
    avvisi.push(`${negozio.nome} non ha creato il prodotto: ${motivo}`);
    return { ...base, errore: motivo };
  }
  if (esito.errori.length) avvisi.push(...esito.errori.map((e) => `${negozio.nome}: ${e.messaggio}`));
  const entrate: string[] = [];
  for (const c of m.collezioni.filter((c) => c.negozio === negozio.nome)) {
    if (c.tipo !== "manuale") continue;
    const r = await aggiungiProdottoACollezione(token, c.shopifyId, esito.prodottoId);
    if (r.ok) {
      cronaca.push(`${negozio.nome}: messo nella collezione «${c.titolo}».`);
      entrate.push(c.id);
    } else avvisi.push(`${negozio.nome}: non entrato in «${c.titolo}»: ${r.errore}`);
  }
  // ⚠️ Si traduce **su questo negozio** solo se la sua spunta è accesa: le
  // lingue sono sue, e chi non le ha non deve pagare una chiamata all'AI.
  if (m.traduci && (m.traduciSu.size === 0 || m.traduciSu.has(negozio.nome))) {
    const t = await traduzioniDi(m, traduzioni);
    if (t.ok) {
      const r = await registraTraduzioniProdotto(token, esito.prodottoId, t.traduzioni);
      if (r.scritte > 0) cronaca.push(`${negozio.nome}: traduzioni scritte, ${r.scritte} voci.`);
      if (r.errori.length) avvisi.push(`${negozio.nome}: traduzioni rifiutate: ${r.errori.join(" · ")}`);
    }
  }
  return { negozio: negozio.nome, shopifyId: esito.prodottoId, handle: esito.handle, statoShopify: dati.stato, errore: null, entrate };
}

/** Il messaggio di esito: su quali negozi è andato. */
function doveEAndato(principale: string | null, altri: EsitoAltroNegozio[]): string {
  return [principale, ...altri.filter((p) => p.shopifyId).map((p) => p.negozio)].filter(Boolean).join(", ");
}

function vaiAllaScheda(id: string, avvisi: string[], okMessaggio: string): never {
  for (const path of ["/", "/prodotti", "/sviluppo", "/sviluppo/calendario", "/shopify", "/anagrafica", `/prodotti/${id}`]) revalidatePath(path);
  const q = new URLSearchParams();
  if (avvisi.length) q.set("esito", "avviso");
  else q.set("esito", "ok");
  q.set("messaggio", avvisi.length ? avvisi.join(" · ") : okMessaggio);
  redirect(`/prodotti/${id}?${q}`);
}

// ---------------------------------------------------------------- CREAZIONE

export async function creaProdottoCompleto(fd: FormData) {
  const indietro = (errore: string): never => redirect(`/prodotti/nuovo?errore=${encodeURIComponent(errore)}`);
  return creaProdotto(fd, indietro, null);
}

/**
 * ⭐ 07/09/2026 (utente: «duplicare un prodotto da modifica importando gli stessi
 * dati e rigenerare le SKU»). È la stessa creazione: il modulo arriva già
 * compilato dalla pagina `/prodotti/[id]/duplica` col codice vuoto, quindi il
 * codice nasce nuovo e le varianti prendono «-1», «-2»… da lui. Qui cambia solo
 * dove si torna in caso di errore e la riga di cronaca, che dice da chi nasce.
 */
export async function duplicaProdottoCompleto(origineId: string, fd: FormData) {
  const indietro = (errore: string): never => redirect(`/prodotti/${origineId}/duplica?errore=${encodeURIComponent(errore)}`);
  return creaProdotto(fd, indietro, origineId);
}

async function creaProdotto(fd: FormData, indietro: (e: string) => never, origineId: string | null) {
  const origine = origineId ? await prisma.prodotto.findUnique({ where: { id: origineId }, select: { nome: true, codice: true } }) : null;
  const m = await leggiModulo(fd, indietro);
  const vuolePubblicare = vaSuShopify(m.fase);

  const { codice, cambiato } = await codiceLibero(m.codiceChiesto, m.variantiForm.length);
  const varianti = m.variantiForm.map((v, i) => ({
    nome: v.nome.trim(),
    note: (v.note ?? "").trim() || null,
    sku: `${codice}-${i + 1}`,
    prezzo: soldiDa(v.prezzo),
    costo: soldiDa(v.costo),
    prezzoPartner: partnerDa(v.prezzoPartner),
    giacenza: m.controllaStock ? Math.max(0, Math.round(Number(v.giacenza) || 0)) : 0,
  }));
  const prezzoBase = prezzoBaseDa(m, varianti);
  const avvisi: string[] = [];
  const cronaca: string[] = [];
  const traduzioni: CacheTraduzioni = {};
  if (cambiato) avvisi.push(`Lo SKU scelto era già in uso: assegnato ${codice}.`);

  let shopifyId: string | null = null;
  let handle: string | null = null;
  let fase = m.fase;
  let shopifyStato = "non_pubblicato";
  let statoShopify: string | null = null;
  let entrate: string[] = [];

  if (vuolePubblicare) {
    if (!m.negozio.permessi.includes("write_products")) indietro(`Il negozio ${m.negozio.nome} non ha il permesso write_products: non posso pubblicare.`);
    const token = await tokenDi(m.negozio.id).catch(() => null);
    if (!token) indietro(`Il negozio ${m.negozio.nome} non sa autenticarsi su Shopify: controlla le credenziali.`);
    const negozioToken = token as NonNullable<typeof token>;
    const stato = statoPerShopify(m.fase, m.finestraAperta);
    const esito = await creaProdottoSuShopify(negozioToken, {
      titolo: m.nome,
      descrizioneHtml: await descrizionePerNegozio(m, m.negozio.nome),
      tipo: m.tipoShopify,
      vendor: "Deluxy",
      tags: m.tags,
      stato,
      prezzo: String(prezzoBase),
      prezzoConfronto: "",
      sku: codice,
      // Le foto ospitate in un ALTRO negozio non hanno un id valido qui: si
      // passano per indirizzo. Quelle di casa si agganciano dopo, per id.
      immagini: m.media.filter((x) => x.tipo === "immagine" && x.url && x.negozio !== m.negozio.nome).map((x) => x.url as string),
      fisico: true,
      controllaStock: m.controllaStock,
      giacenza: String(m.giacenza),
      nomeOpzione: m.nomeOpzione,
      varianti: varianti.map((v) => ({ nome: v.nome, sku: v.sku, prezzo: String(v.prezzo || prezzoBase), prezzoConfronto: "", giacenza: String(v.giacenza) })),
      metafield: metafieldPerShopify(m.metafield, m.definizioni).map((x) => ({ chiave: x.key, valore: x.value, namespace: x.namespace, tipo: x.type })),
    });
    cronaca.push(...esito.passi);
    if (!esito.prodottoId) {
      fase = "approvato";
      const motivo = esito.errori.map((e) => (e.campo ? `${e.campo}: ${e.messaggio}` : e.messaggio)).join(" · ");
      avvisi.push(`Shopify non ha creato il prodotto (${motivo || "esito sconosciuto"}): salvato qui come Approvato.`);
      cronaca.push(`Pubblicazione rifiutata: ${motivo}`);
    } else {
      shopifyId = esito.prodottoId;
      handle = esito.handle;
      shopifyStato = stato === "ACTIVE" ? "pubblicato" : "bozza";
      statoShopify = stato;
      if (esito.errori.length) avvisi.push(...esito.errori.map((e) => e.messaggio));
      if (!m.finestraAperta) cronaca.push(`Nasce come bozza: la finestra di pubblicazione si apre il ${m.dalIso}.`);
      entrate = (await completaSulNegozio({ ...m, collezioni: m.collezioni.filter((c) => c.negozio === m.negozio.nome) }, negozioToken, shopifyId, m.media, cronaca, avvisi, traduzioni)).entrate;
    }
  }

  // ---- Anche sugli altri negozi scelti (07/09/2026) ----
  const altri: EsitoAltroNegozio[] = [];
  if (vuolePubblicare && m.altriNegozi.length) {
    const stato = statoPerShopify(m.fase, m.finestraAperta);
    // Prodotto appena nato: le uniche foto sono quelle appena caricate nel
    // modulo, non c'e' ancora una scheda da cui ripescarne una.
    const immaginiUrl = m.media.filter((x) => x.tipo === "immagine" && x.url).map((x) => x.url as string);
    for (const n of m.altriNegozi) altri.push(await pubblicaSuAltroNegozio(m, n, { codice, varianti, prezzoBase, stato, immagini: immaginiUrl }, traduzioni, cronaca, avvisi));
  }

  const immagini = m.media.filter((x) => x.tipo === "immagine" && x.url);
  const p = await prisma.prodotto.create({
    data: {
      codice,
      nome: m.nome,
      categoria: m.categoria,
      tipoShopify: m.tipoShopify || null,
      seoTitolo: m.seo.titolo,
      seoDescrizione: m.seo.descrizione,
      seoModificatoIl: new Date(),
      tipologiaVendita: m.tipologiaVendita,
      note: m.note,
      fase,
      descrizione: m.descrizione,
      brief: m.brief,
      materiali: m.materiali,
      palette: m.palette,
      costoProduzione: m.costo,
      prezzoVendita: prezzoBase,
      immagine: immagini[0]?.url ?? null,
      negozioNome: m.negozio.nome,
      collezioneShopifyId: m.collezioni[0]?.id ?? null,
      collezioniPreviste: m.collezioni.map((c) => c.id),
      prezzoPartner: m.prezzoPartner,
      pubblicatoDal: m.pubblicatoDal,
      pubblicatoFinoAl: m.pubblicatoFinoAl,
      shopifyId,
      shopifyStato,
      statoShopify,
      shopifySyncIl: shopifyId ? new Date() : null,
      handleShopify: handle,
      tagShopify: m.tags.length ? m.tags.join(", ").slice(0, 500) : null,
      nomePartner: m.nomePartner,
      nomePartnerAttivo: m.nomePartnerAttivo,
      plusProdotto: m.plusProdotto,
      sezioniScheda: Object.keys(m.sezioniScheda).length ? m.sezioniScheda : undefined,
      metafieldShopify: Object.keys(m.metafield).length ? m.metafield : undefined,
      ...(Object.keys(m.metafield).length ? colonneDaMetafield(m.metafield) : {}),
      varianti: varianti.length
        ? { create: varianti.map((v, posizione) => ({ nome: v.nome, sku: v.sku, deltaPrezzo: (v.prezzo || prezzoBase) - prezzoBase, deltaCosto: v.costo ? v.costo - m.costo : 0, prezzoPartner: v.prezzoPartner, giacenza: v.giacenza, note: v.note || null, ordine: posizione })) }
        : undefined,
      media: m.media.length
        ? { create: m.media.map((x, i) => ({ tipo: x.tipo, url: x.url, anteprima: x.anteprima, shopifyFileId: x.shopifyFileId, negozio: x.negozio, nome: x.nome, stato: x.stato, ordine: i })) }
        : undefined,
      // Dove sta: il principale (se è andato) e ogni altro negozio, riuscito o no —
      // un rifiuto scritto qui è quello che la scheda mostra e il modulo ripropone.
      pubblicazioni: {
        create: [
          ...(shopifyId ? [{ negozio: m.negozio.nome, shopifyId, handle, statoShopify, spintoIl: new Date() }] : []),
          ...altri.map((a) => ({ negozio: a.negozio, shopifyId: a.shopifyId, handle: a.handle, statoShopify: a.statoShopify, errore: a.errore, spintoIl: a.shopifyId ? new Date() : null })),
        ],
      },
    },
  });
  for (const collezioneId of entrate) {
    await prisma.prodottoInCollezioneShopify
      .create({ data: { collezioneId, prodottoId: p.id, origine: "manuale", posizione: 9999, prodottoShopifyId: shopifyId as string } })
      .catch(() => undefined);
  }
  for (const a of altri) {
    for (const collezioneId of a.entrate) {
      await prisma.prodottoInCollezioneShopify
        .create({ data: { collezioneId, prodottoId: p.id, origine: "manuale", posizione: 9999, prodottoShopifyId: a.shopifyId as string } })
        .catch(() => undefined);
    }
  }
  await prisma.tappaSviluppo.create({
    data: {
      prodottoId: p.id,
      da: "—",
      a: fase,
      nota: [
        origine ? `Duplicato da «${origine.nome}» (${origine.codice}) con SKU nuovo ${codice}.` : "",
        shopifyId ? `Creato su ${m.negozio.nome} (${handle ?? shopifyId}).` : "Prodotto creato.",
        varianti.length ? `${varianti.length} varianti (${varianti.map((v) => v.sku).join(", ")}).` : "",
        ...cronaca,
      ].filter(Boolean).join(" "),
      origine: shopifyId ? "shopify" : "ui",
    },
  });
  const dove = doveEAndato(shopifyId ? m.negozio.nome : null, altri);
  vaiAllaScheda(p.id, avvisi, dove ? `Creato e pubblicato su ${dove}.` : "Prodotto creato.");
}

// ---------------------------------------------------------------- MODIFICA

export async function aggiornaProdottoCompleto(id: string, fd: FormData) {
  const indietro = (errore: string): never => redirect(`/prodotti/${id}/modifica?errore=${encodeURIComponent(errore)}`);
  const esistente = await prisma.prodotto.findUnique({
    where: { id },
    include: {
      varianti: { include: { _count: { select: { vendite: true } } } },
      media: true,
      collezioniShopify: { select: { id: true, collezioneId: true, collezione: { select: { shopifyId: true, titolo: true, tipo: true, negozio: true } } } },
      pubblicazioni: true,
    },
  });
  if (!esistente) indietro("Prodotto non trovato.");
  const prima = esistente as NonNullable<typeof esistente>;
  const m = await leggiModulo(fd, indietro);
  const avvisi: string[] = [];
  const cronaca: string[] = [];
  const traduzioni: CacheTraduzioni = {};

  // SKU: se cambia, deve essere libero (i derivati delle varianti nuove pure).
  const nuoveVarianti = m.variantiForm.filter((v) => !v.sku);
  let codice = prima.codice;
  if (m.codiceChiesto && m.codiceChiesto !== prima.codice) {
    const r = await codiceLibero(m.codiceChiesto, 0, prima.id);
    if (r.cambiato) avvisi.push(`Lo SKU ${m.codiceChiesto} era già in uso: il prodotto tiene ${prima.codice}.`);
    else codice = r.codice;
  }
  // Numerazione delle varianti nuove: dopo l'ultimo «-N» già usato.
  const usati = prima.varianti.map((v) => v.sku ?? "").map((s) => Number(s.split("-").pop())).filter((n) => Number.isFinite(n));
  let prossimo = usati.length ? Math.max(...usati) + 1 : 1;
  const varianti: { nome: string; sku: string; prezzo: number; costo: number; note: string | null; prezzoPartner: number | null; giacenza: number; nuova: boolean }[] = [];
  for (const v of m.variantiForm) {
    let sku = v.sku ?? "";
    if (!sku) {
      do sku = `${codice}-${prossimo++}`;
      while (await preso(sku, prima.id));
    }
    varianti.push({ nome: v.nome.trim(), sku, prezzo: soldiDa(v.prezzo), costo: soldiDa(v.costo), note: (v.note ?? "").trim() || null, prezzoPartner: partnerDa(v.prezzoPartner), giacenza: m.controllaStock ? Math.max(0, Math.round(Number(v.giacenza) || 0)) : 0, nuova: !v.sku });
  }
  // Collezioni: quelle manuali in cui sta già, contro quelle scelte ora.
  const manualiPrima = prima.collezioniShopify.filter((x) => x.collezione.tipo === "manuale");
  const collezioniAggiunte = m.collezioni.filter((c) => !prima.collezioniShopify.some((x) => x.collezioneId === c.id));
  const collezioniTolte = manualiPrima.filter((x) => !m.collezioni.some((c) => c.id === x.collezioneId));
  let entrate: string[] = [];
  const uscite: string[] = [];
  const prezzoBase = prezzoBaseDa(m, varianti);
  const mediaNuovi = m.media.filter((x) => !prima.media.some((y) => y.shopifyFileId === x.shopifyFileId));
  const mediaTolti = prima.media.filter((y) => !m.media.some((x) => x.shopifyFileId === y.shopifyFileId));

  let fase = m.fase;
  let shopifyId = prima.shopifyId;
  let handle = prima.handleShopify;
  let shopifyStato = prima.shopifyStato;
  let statoShopify = prima.statoShopify;
  const vuolePubblico = vaSuShopify(m.fase);

  if (shopifyId) {
    // ---- Già sul negozio: si aggiorna là ----
    const token = await tokenDi(m.negozio.id).catch(() => null);
    if (!token) avvisi.push(`Il negozio ${m.negozio.nome} non sa autenticarsi: salvato solo qui.`);
    else {
      const statoVoluto: "ACTIVE" | "DRAFT" | undefined = vuolePubblico
        ? statoPerShopify(m.fase, m.finestraAperta)
        : prima.statoShopify === "ACTIVE" ? "DRAFT" : undefined;
      const r = await aggiornaProdottoSuShopify(token, {
        shopifyId,
        titolo: m.nome,
        descrizioneHtml: await descrizionePerNegozio(m, m.negozio.nome),
        stato: statoVoluto,
        tags: m.tags,
        metafield: metafieldPerShopify(m.metafield, m.definizioni),
        varianti: varianti.length ? varianti.map((v) => ({ sku: v.sku, nome: v.nome, prezzo: String(v.prezzo || prezzoBase), giacenza: String(v.giacenza) })) : undefined,
        nomeOpzione: m.nomeOpzione,
        prezzo: varianti.length ? undefined : String(prezzoBase),
        sku: varianti.length ? undefined : codice,
      });
      cronaca.push(...r.passi);
      if (r.errori.length) avvisi.push(...r.errori.map((e) => (e.campo ? `${e.campo}: ${e.messaggio}` : e.messaggio)));
      if (statoVoluto && !r.errori.some((e) => e.campo == null)) {
        statoShopify = statoVoluto;
        shopifyStato = statoVoluto === "ACTIVE" ? "pubblicato" : "bozza";
      }
      entrate = (await completaSulNegozio({ ...m, collezioni: collezioniAggiunte.filter((c) => c.negozio === m.negozio.nome) }, token, shopifyId, mediaNuovi, cronaca, avvisi, traduzioni)).entrate;
      for (const x of collezioniTolte.filter((x) => x.collezione.negozio === m.negozio.nome)) {
        const r = await rimuoviProdottoDaCollezione(token, x.collezione.shopifyId, shopifyId);
        if (r.ok) {
          cronaca.push(`Tolto dalla collezione «${x.collezione.titolo}».`);
          uscite.push(x.id);
        } else avvisi.push(`Non tolto da «${x.collezione.titolo}»: ${r.errore}`);
      }
      if (mediaTolti.length) avvisi.push(`${mediaTolti.length} foto tolte qui restano sul prodotto del negozio: si tolgono dall'admin di Shopify.`);
    }
  } else if (vuolePubblico) {
    // ---- Non era sul negozio e diventa Pubblico: si pubblica come un nuovo ----
    if (!m.negozio.permessi.includes("write_products")) indietro(`Il negozio ${m.negozio.nome} non ha il permesso write_products: non posso pubblicare.`);
    const token = await tokenDi(m.negozio.id).catch(() => null);
    if (!token) indietro(`Il negozio ${m.negozio.nome} non sa autenticarsi su Shopify.`);
    const negozioToken = token as NonNullable<typeof token>;
    const stato = statoPerShopify(m.fase, m.finestraAperta);
    const esito = await creaProdottoSuShopify(negozioToken, {
      titolo: m.nome,
      descrizioneHtml: await descrizionePerNegozio(m, m.negozio.nome),
      tipo: m.tipoShopify,
      vendor: "Deluxy",
      tags: m.tags,
      stato,
      prezzo: String(prezzoBase),
      prezzoConfronto: "",
      sku: codice,
      // Le foto ospitate in un ALTRO negozio non hanno un id valido qui: si
      // passano per indirizzo. Quelle di casa si agganciano dopo, per id.
      immagini: m.media.filter((x) => x.tipo === "immagine" && x.url && x.negozio !== m.negozio.nome).map((x) => x.url as string),
      fisico: true,
      controllaStock: m.controllaStock,
      giacenza: String(m.giacenza),
      nomeOpzione: m.nomeOpzione,
      varianti: varianti.map((v) => ({ nome: v.nome, sku: v.sku, prezzo: String(v.prezzo || prezzoBase), prezzoConfronto: "", giacenza: String(v.giacenza) })),
      metafield: metafieldPerShopify(m.metafield, m.definizioni).map((x) => ({ chiave: x.key, valore: x.value, namespace: x.namespace, tipo: x.type })),
    });
    cronaca.push(...esito.passi);
    if (!esito.prodottoId) {
      fase = "approvato";
      const motivo = esito.errori.map((e) => e.messaggio).join(" · ");
      avvisi.push(`Shopify non ha creato il prodotto (${motivo || "esito sconosciuto"}): resta qui come Approvato.`);
    } else {
      shopifyId = esito.prodottoId;
      handle = esito.handle;
      shopifyStato = stato === "ACTIVE" ? "pubblicato" : "bozza";
      statoShopify = stato;
      if (esito.errori.length) avvisi.push(...esito.errori.map((e) => e.messaggio));
      entrate = (await completaSulNegozio({ ...m, collezioni: m.collezioni.filter((c) => c.negozio === m.negozio.nome) }, negozioToken, shopifyId, m.media, cronaca, avvisi, traduzioni)).entrate;
    }
  }

  // ---- Gli altri negozi (07/09/2026): chi c'è già si aggiorna, chi manca si pubblica, chi è stato tolto torna bozza ----
  const altri: EsitoAltroNegozio[] = [];
  const immagineDelProdotto = prima.immagine;
  const immaginiUrl = (() => {
    const daiMedia = m.media.filter((x) => x.tipo === "immagine" && x.url).map((x) => x.url as string);
    // ⭐ 09/09/2026 (utente): «se aggiungo un prodotto esistente a un altro shop
    // appare senza immagine». Misurato: **3.576 prodotti su 5.069 hanno la foto
    // SOLO nel campo `immagine`** e appena 9 hanno righe in `media` — perché
    // `media` si riempie quando la foto passa dai Files del negozio, e i
    // prodotti arrivati dall'import non ci sono mai passati. Partendo dai soli
    // `media`, l'elenco delle foto era vuoto per quasi tutti, e la scheda
    // nasceva nuda sull'altro negozio.
    return daiMedia.length ? daiMedia : [immagineDelProdotto].filter((x): x is string => !!x);
  })();
  for (const n of m.altriNegozi) {
    const riga = prima.pubblicazioni.find((r) => r.negozio === n.nome);
    if (riga?.shopifyId) {
      const token = await tokenDi(n.id).catch(() => null);
      if (!token) {
        avvisi.push(`${n.nome}: il negozio non sa autenticarsi, non aggiornato là.`);
        continue;
      }
      const defs = await definizioniInCache(n.nome);
      const valide = new Set(defs.map((d) => `${d.namespace}.${d.key}`));
      const mf = Object.fromEntries(Object.entries(m.metafield).filter(([k]) => valide.has(k)));
      // ⚠️ Le scelte ammesse cambiano da un negozio all'altro: quello che
      // si scarta va detto, altrimenti è una perdita silenziosa.
      for (const riga of scartiMetafield(mf, defs)) avvisi.push(`${n.nome}: ${riga}`);
      const statoVoluto: "ACTIVE" | "DRAFT" | undefined = vuolePubblico
        ? statoPerShopify(m.fase, m.finestraAperta)
        : riga.statoShopify === "ACTIVE" ? "DRAFT" : undefined;
      const r = await aggiornaProdottoSuShopify(token, {
        shopifyId: riga.shopifyId,
        titolo: m.nome,
        descrizioneHtml: await descrizionePerNegozio(m, n.nome),
        stato: statoVoluto,
        tags: m.tags,
        metafield: metafieldPerShopify(mf, defs),
        varianti: varianti.length ? varianti.map((v) => ({ sku: v.sku, nome: v.nome, prezzo: String(v.prezzo || prezzoBase), giacenza: String(v.giacenza) })) : undefined,
        nomeOpzione: m.nomeOpzione,
        prezzo: varianti.length ? undefined : String(prezzoBase),
        sku: varianti.length ? undefined : codice,
      });
      cronaca.push(...r.passi.map((p) => `${n.nome}: ${p}`));
      if (r.errori.length) avvisi.push(...r.errori.map((e) => `${n.nome}: ${e.campo ? `${e.campo}: ` : ""}${e.messaggio}`));
      const entrateQui: string[] = [];
      for (const c of collezioniAggiunte.filter((c) => c.negozio === n.nome && c.tipo === "manuale")) {
        const rc = await aggiungiProdottoACollezione(token, c.shopifyId, riga.shopifyId);
        if (rc.ok) {
          cronaca.push(`${n.nome}: messo nella collezione «${c.titolo}».`);
          entrateQui.push(c.id);
        } else avvisi.push(`${n.nome}: non entrato in «${c.titolo}»: ${rc.errore}`);
      }
      for (const x of collezioniTolte.filter((x) => x.collezione.negozio === n.nome)) {
        const rc = await rimuoviProdottoDaCollezione(token, x.collezione.shopifyId, riga.shopifyId);
        if (rc.ok) {
          cronaca.push(`${n.nome}: tolto dalla collezione «${x.collezione.titolo}».`);
          uscite.push(x.id);
        } else avvisi.push(`${n.nome}: non tolto da «${x.collezione.titolo}»: ${rc.errore}`);
      }
      if (mediaNuovi.length) avvisi.push(`${n.nome}: le foto nuove non si copiano su un prodotto già pubblicato là; si aggiungono dall'admin di quel negozio.`);
      const fallito = r.errori.some((e) => e.campo == null);
      altri.push({
        negozio: n.nome,
        shopifyId: riga.shopifyId,
        handle: riga.handle,
        statoShopify: statoVoluto && !fallito ? statoVoluto : riga.statoShopify,
        errore: r.errori.length ? r.errori.map((e) => e.messaggio).join(" · ") : null,
        entrate: entrateQui,
      });
    } else if (vuolePubblico) {
      const stato = statoPerShopify(m.fase, m.finestraAperta);
      altri.push(await pubblicaSuAltroNegozio(m, n, { codice, varianti, prezzoBase, stato, immagini: immaginiUrl }, traduzioni, cronaca, avvisi));
    }
  }
  // Un negozio tolto dalla scelta: là il prodotto torna bozza, non si cancella
  // (un prodotto cancellato porta via ordini e statistiche del negozio).
  const tolti: string[] = [];
  for (const riga of prima.pubblicazioni) {
    if (riga.negozio === m.negozio.nome || m.altriNegozi.some((n) => n.nome === riga.negozio) || !riga.shopifyId) continue;
    if (riga.origine === "tolto") continue;
    const n = m.tuttiNegozi.find((x) => x.nome === riga.negozio);
    const token = n ? await tokenDi(n.id).catch(() => null) : null;
    if (!token) {
      avvisi.push(`${riga.negozio}: tolto dalla scelta ma il negozio non risponde: là resta com'era.`);
      continue;
    }
    if (riga.statoShopify === "ACTIVE") {
      const r = await aggiornaProdottoSuShopify(token, { shopifyId: riga.shopifyId, stato: "DRAFT" });
      if (r.errori.length) {
        avvisi.push(`${riga.negozio}: non sono riuscito a metterlo in bozza: ${r.errori.map((e) => e.messaggio).join(" · ")}`);
        continue;
      }
      cronaca.push(`${riga.negozio}: tolto dalla scelta, là torna bozza.`);
    }
    tolti.push(riga.negozio);
  }

  // ---- Qui ----
  const immagini = m.media.filter((x) => x.tipo === "immagine" && x.url);
  await prisma.$transaction(async (tx) => {
    await tx.prodotto.update({
      where: { id },
      data: {
        codice,
        nome: m.nome,
        categoria: m.categoria,
        tipoShopify: m.tipoShopify || null,
        seoTitolo: m.seo.titolo,
        seoDescrizione: m.seo.descrizione,
        seoModificatoIl: new Date(),
        tipologiaVendita: m.tipologiaVendita,
        note: m.note,
        fase,
        descrizione: m.descrizione,
        brief: m.brief,
        materiali: m.materiali,
        palette: m.palette,
        costoProduzione: m.costo,
        prezzoVendita: prezzoBase,
        immagine: immagini[0]?.url ?? prima.immagine,
        negozioNome: m.negozio.nome,
        collezioneShopifyId: m.collezioni[0]?.id ?? null,
        collezioniPreviste: m.collezioni.map((c) => c.id),
        prezzoPartner: m.prezzoPartner,
        pubblicatoDal: m.pubblicatoDal,
        pubblicatoFinoAl: m.pubblicatoFinoAl,
        shopifyId,
        shopifyStato,
        statoShopify,
        shopifySyncIl: shopifyId ? new Date() : null,
        handleShopify: handle,
        tagShopify: m.tags.length ? m.tags.join(", ").slice(0, 500) : null,
        nomePartner: m.nomePartner,
        nomePartnerAttivo: m.nomePartnerAttivo,
        plusProdotto: m.plusProdotto,
        // In modifica si scrive sempre, anche l'oggetto vuoto: se qualcuno
        // svuota una sezione, quel vuoto è la sua decisione e deve arrivare al
        // database. Scrivere solo quando c'è del testo renderebbe impossibile
        // togliere una riga sbagliata.
        sezioniScheda: m.sezioniScheda,
        metafieldShopify: m.metafield,
        ...colonneDaMetafield(m.metafield),
      },
    });
    // Varianti: per SKU. Le nuove nascono, le presenti si aggiornano, quelle
    // sparite dal modulo si tolgono solo se non hanno venduto niente.
    // ⭐ 09/09/2026 (utente): «non conserva l'ordine delle varianti, e in ogni
    // caso permetti di poterle ordinare a piacimento». La posizione nel modulo
    // È l'ordine: si scrive a ogni salvataggio, anche sulle varianti che
    // esistono già, altrimenti spostarne una non avrebbe effetto.
    for (const [posizione, v] of varianti.entries()) {
      const dati = { nome: v.nome, deltaPrezzo: (v.prezzo || prezzoBase) - prezzoBase, deltaCosto: v.costo ? v.costo - m.costo : 0, prezzoPartner: v.prezzoPartner, giacenza: v.giacenza, note: v.note || null, ordine: posizione };
      const gia = prima.varianti.find((x) => x.sku === v.sku);
      if (gia) await tx.variante.update({ where: { id: gia.id }, data: dati });
      else await tx.variante.create({ data: { prodottoId: id, sku: v.sku, ...dati } });
    }
    for (const x of prima.varianti) {
      if (varianti.some((v) => v.sku === x.sku)) continue;
      if (x._count.vendite > 0) avvisi.push(`La variante «${x.nome}» ha venduto: resta in archivio anche se tolta dal modulo.`);
      else await tx.variante.delete({ where: { id: x.id } });
    }
    if (mediaNuovi.length) {
      const base = prima.media.length;
      await tx.mediaProdotto.createMany({
        data: mediaNuovi.map((x, i) => ({ prodottoId: id, tipo: x.tipo, url: x.url, anteprima: x.anteprima, shopifyFileId: x.shopifyFileId, negozio: x.negozio, nome: x.nome, stato: x.stato, ordine: base + i })),
      });
    }
    if (mediaTolti.length) await tx.mediaProdotto.deleteMany({ where: { id: { in: mediaTolti.map((y) => y.id) } } });
    // Le appartenenze locali seguono quello che il negozio ha accettato.
    for (const collezioneId of entrate) {
      await tx.prodottoInCollezioneShopify.create({ data: { collezioneId, prodottoId: id, origine: "manuale", posizione: 9999, prodottoShopifyId: shopifyId as string } }).catch(() => undefined);
    }
    if (uscite.length) await tx.prodottoInCollezioneShopify.deleteMany({ where: { id: { in: uscite } } });
    // La mappa «dove sta»: il principale e gli altri, riusciti o no; i tolti restano
    // segnati come tali, così il modulo non li ripropone spuntati.
    if (shopifyId) {
      await tx.pubblicazioneNegozio.upsert({
        where: { prodottoId_negozio: { prodottoId: id, negozio: m.negozio.nome } },
        create: { prodottoId: id, negozio: m.negozio.nome, shopifyId, handle, statoShopify, spintoIl: new Date() },
        update: { shopifyId, handle, statoShopify, origine: "modulo", spintoIl: new Date(), errore: null },
      });
    }
    for (const a of altri) {
      await tx.pubblicazioneNegozio.upsert({
        where: { prodottoId_negozio: { prodottoId: id, negozio: a.negozio } },
        create: { prodottoId: id, negozio: a.negozio, shopifyId: a.shopifyId, handle: a.handle, statoShopify: a.statoShopify, errore: a.errore, spintoIl: a.shopifyId ? new Date() : null },
        update: { shopifyId: a.shopifyId ?? undefined, handle: a.handle ?? undefined, statoShopify: a.statoShopify, errore: a.errore, origine: "modulo", spintoIl: a.shopifyId ? new Date() : undefined },
      });
      for (const collezioneId of a.entrate) {
        await tx.prodottoInCollezioneShopify.create({ data: { collezioneId, prodottoId: id, origine: "manuale", posizione: 9999, prodottoShopifyId: a.shopifyId as string } }).catch(() => undefined);
      }
    }
    if (tolti.length) {
      await tx.pubblicazioneNegozio.updateMany({ where: { prodottoId: id, negozio: { in: tolti } }, data: { origine: "tolto", statoShopify: "DRAFT" } });
    }
    if (fase !== prima.fase || cronaca.length) {
      await tx.tappaSviluppo.create({
        data: { prodottoId: id, da: prima.fase, a: fase, nota: ["Modificato dal modulo.", ...cronaca].join(" "), origine: shopifyId ? "shopify" : "ui" },
      });
    }
  });
  // **Gli stati decisi negozio per negozio si impongono al sito** (08/09/2026:
  // «comandiamo noi, Shopify si adegua»). Si scrive **solo dove la scelta è
  // diversa da com'è adesso**: una mutation che rimette lo stato che c'era già
  // è tempo speso e una riga di cronaca che confonde.
  //
  // Ogni negozio è un giro a sé: se uno rifiuta, gli altri vanno avanti e il
  // motivo resta scritto sulla riga, come per la pubblicazione.
  const statiDaFare = Object.entries(m.statiVoluti);
  if (statiDaFare.length > 0) {
    const righe = await prisma.pubblicazioneNegozio.findMany({ where: { prodottoId: id }, select: { negozio: true, shopifyId: true, statoShopify: true } });
    for (const [nomeNegozio, voluto] of statiDaFare) {
      const riga = righe.find((r) => r.negozio === nomeNegozio);
      await prisma.pubblicazioneNegozio.updateMany({ where: { prodottoId: id, negozio: nomeNegozio }, data: { statoVoluto: voluto } });
      if (!riga?.shopifyId || riga.statoShopify === voluto) continue;
      const n = m.tuttiNegozi.find((x) => x.nome === nomeNegozio);
      if (!n) { avvisi.push(`«${nomeNegozio}» non è fra i negozi attivi: lo stato resta scritto qui ma non è stato mandato.`); continue; }
      const token = await tokenDi(n.id);
      if (!token) { avvisi.push(`«${nomeNegozio}» non sa autenticarsi: stato non mandato.`); continue; }
      const errore = await cambiaStatoSuNegozio(token, riga.shopifyId, voluto as "ACTIVE" | "DRAFT" | "ARCHIVED");
      if (errore) {
        avvisi.push(`«${nomeNegozio}» ha rifiutato il cambio di stato: ${errore}`);
        await prisma.pubblicazioneNegozio.updateMany({ where: { prodottoId: id, negozio: nomeNegozio }, data: { errore } });
      } else {
        await prisma.pubblicazioneNegozio.updateMany({
          where: { prodottoId: id, negozio: nomeNegozio },
          data: { statoShopify: voluto, spintoIl: new Date(), errore: null },
        });
        cronaca.push(`Stato su ${nomeNegozio}: ${voluto}.`);
      }
    }
  }

  const dove = doveEAndato(shopifyId ? m.negozio.nome : null, altri);
  vaiAllaScheda(id, avvisi, dove ? `Salvato qui e su ${dove}.` : "Modifiche salvate.");
}

