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
import { prisma } from "./db";
import { giornoRoma, isoGiornoValido, mezzanotteRomaDi } from "./fuso";
import { definizioniInCache, metafieldPerShopify } from "./metafield-definizioni";
import { elencoNegozi, tokenDi } from "./negozi";
import { aggiornaProdottoSuShopify, creaProdottoSuShopify } from "./shopify-admin";
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
type VarianteDalForm = { nome: string; sku: string | null; prezzo: string; costo: string; giacenza: string; prezzoPartner?: string };
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

/** Quello che il modulo manda, letto una volta per entrambe le azioni. */
async function leggiModulo(fd: FormData, indietro: (e: string) => never) {
  const nome = testo(fd, "nome");
  if (!nome) indietro("Il nome del prodotto è obbligatorio.");
  const negozi = await elencoNegozi();
  const negozio = negozi.find((n) => n.id === testo(fd, "negozioId")) ?? null;
  if (!negozio) indietro("Scegli il brand / negozio.");
  const negozioOk = negozio as NonNullable<typeof negozio>;

  const fase = testo(fd, "fase") || "concept";
  const categoria = testo(fd, "categoria") || "DA_CLASSIFICARE";
  // Le collezioni: più d'una (chiesto dall'utente), solo manuali del negozio scelto.
  const collezioniId = [...new Set(leggiJson<string[]>(fd, "collezioniJson", []).map(String).filter(Boolean))];
  const collezioni = collezioniId.length
    ? await prisma.collezioneShopify.findMany({ where: { id: { in: collezioniId } }, select: { id: true, shopifyId: true, titolo: true, tipo: true, negozio: true } })
    : [];
  if (collezioni.length !== collezioniId.length) indietro("Una delle collezioni scelte non esiste più: rifai l'import o scegline un'altra.");
  if (collezioni.some((c) => c.negozio !== negozioOk.nome)) indietro("Una delle collezioni scelte è di un altro negozio.");

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

  return {
    nome,
    negozio: negozioOk,
    fase,
    categoria,
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
    traduci: fd.get("traduci") != null,
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

/** I passi comuni dopo la creazione sul negozio: foto, collezioni, traduzioni. Torna le collezioni in cui è entrato. */
async function completaSulNegozio(
  m: Modulo,
  negozioToken: { dominio: string; token: string },
  shopifyId: string,
  media: MediaDalForm[],
  cronaca: string[],
  avvisi: string[]
): Promise<{ entrate: string[] }> {
  const entrate: string[] = [];
  if (media.length) {
    const r = await agganciaFileAlProdotto(negozioToken, media.map((x) => x.shopifyFileId), shopifyId);
    if (r.ok) cronaca.push(`${media.length} file agganciati al prodotto.`);
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
  if (m.traduci) {
    const t = await traduciScheda({ titolo: m.nome, descrizione: m.descrizione ?? "" });
    if (!t.ok) avvisi.push(`Traduzioni non fatte: ${t.errore}`);
    else {
      const r = await registraTraduzioniProdotto(negozioToken, shopifyId, t.traduzioni);
      if (r.scritte > 0) cronaca.push(`Traduzioni scritte sul negozio: ${r.scritte} voci.`);
      if (r.errori.length) avvisi.push(`Traduzioni rifiutate: ${r.errori.join(" · ")}`);
    }
  }
  return { entrate };
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
  const m = await leggiModulo(fd, indietro);
  const vuolePubblicare = m.fase === "in_vendita";

  const { codice, cambiato } = await codiceLibero(m.codiceChiesto, m.variantiForm.length);
  const varianti = m.variantiForm.map((v, i) => ({
    nome: v.nome.trim(),
    sku: `${codice}-${i + 1}`,
    prezzo: soldiDa(v.prezzo),
    costo: soldiDa(v.costo),
    prezzoPartner: partnerDa(v.prezzoPartner),
    giacenza: m.controllaStock ? Math.max(0, Math.round(Number(v.giacenza) || 0)) : 0,
  }));
  const prezzoBase = prezzoBaseDa(m, varianti);
  const avvisi: string[] = [];
  const cronaca: string[] = [];
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
    const stato: "ACTIVE" | "DRAFT" = m.finestraAperta ? "ACTIVE" : "DRAFT";
    const esito = await creaProdottoSuShopify(negozioToken, {
      titolo: m.nome,
      descrizioneHtml: (m.descrizione ?? "").replace(/\n/g, "<br>"),
      tipo: "",
      vendor: "",
      tags: m.tags,
      stato,
      prezzo: String(prezzoBase),
      prezzoConfronto: "",
      sku: codice,
      immagini: [],
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
      entrate = (await completaSulNegozio(m, negozioToken, shopifyId, m.media, cronaca, avvisi)).entrate;
    }
  }

  const immagini = m.media.filter((x) => x.tipo === "immagine" && x.url);
  const p = await prisma.prodotto.create({
    data: {
      codice,
      nome: m.nome,
      categoria: m.categoria,
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
      metafieldShopify: Object.keys(m.metafield).length ? m.metafield : undefined,
      ...(Object.keys(m.metafield).length ? colonneDaMetafield(m.metafield) : {}),
      varianti: varianti.length
        ? { create: varianti.map((v) => ({ nome: v.nome, sku: v.sku, deltaPrezzo: (v.prezzo || prezzoBase) - prezzoBase, deltaCosto: v.costo ? v.costo - m.costo : 0, prezzoPartner: v.prezzoPartner, giacenza: v.giacenza })) }
        : undefined,
      media: m.media.length
        ? { create: m.media.map((x, i) => ({ tipo: x.tipo, url: x.url, anteprima: x.anteprima, shopifyFileId: x.shopifyFileId, negozio: x.negozio, nome: x.nome, stato: x.stato, ordine: i })) }
        : undefined,
    },
  });
  for (const collezioneId of entrate) {
    await prisma.prodottoInCollezioneShopify
      .create({ data: { collezioneId, prodottoId: p.id, origine: "manuale", posizione: 9999, prodottoShopifyId: shopifyId as string } })
      .catch(() => undefined);
  }
  await prisma.tappaSviluppo.create({
    data: {
      prodottoId: p.id,
      da: "—",
      a: fase,
      nota: [shopifyId ? `Creato su ${m.negozio.nome} (${handle ?? shopifyId}).` : "Prodotto creato.", varianti.length ? `${varianti.length} varianti (${varianti.map((v) => v.sku).join(", ")}).` : "", ...cronaca].filter(Boolean).join(" "),
      origine: shopifyId ? "shopify" : "ui",
    },
  });
  vaiAllaScheda(p.id, avvisi, shopifyId ? `Creato e pubblicato su ${m.negozio.nome}.` : "Prodotto creato.");
}

// ---------------------------------------------------------------- MODIFICA

export async function aggiornaProdottoCompleto(id: string, fd: FormData) {
  const indietro = (errore: string): never => redirect(`/prodotti/${id}/modifica?errore=${encodeURIComponent(errore)}`);
  const esistente = await prisma.prodotto.findUnique({
    where: { id },
    include: {
      varianti: { include: { _count: { select: { vendite: true } } } },
      media: true,
      collezioniShopify: { select: { id: true, collezioneId: true, collezione: { select: { shopifyId: true, titolo: true, tipo: true } } } },
    },
  });
  if (!esistente) indietro("Prodotto non trovato.");
  const prima = esistente as NonNullable<typeof esistente>;
  const m = await leggiModulo(fd, indietro);
  const avvisi: string[] = [];
  const cronaca: string[] = [];

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
  const varianti: { nome: string; sku: string; prezzo: number; costo: number; prezzoPartner: number | null; giacenza: number; nuova: boolean }[] = [];
  for (const v of m.variantiForm) {
    let sku = v.sku ?? "";
    if (!sku) {
      do sku = `${codice}-${prossimo++}`;
      while (await preso(sku, prima.id));
    }
    varianti.push({ nome: v.nome.trim(), sku, prezzo: soldiDa(v.prezzo), costo: soldiDa(v.costo), prezzoPartner: partnerDa(v.prezzoPartner), giacenza: m.controllaStock ? Math.max(0, Math.round(Number(v.giacenza) || 0)) : 0, nuova: !v.sku });
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
  const vuolePubblico = m.fase === "in_vendita";

  if (shopifyId) {
    // ---- Già sul negozio: si aggiorna là ----
    const token = await tokenDi(m.negozio.id).catch(() => null);
    if (!token) avvisi.push(`Il negozio ${m.negozio.nome} non sa autenticarsi: salvato solo qui.`);
    else {
      const statoVoluto: "ACTIVE" | "DRAFT" | undefined = vuolePubblico
        ? m.finestraAperta ? "ACTIVE" : "DRAFT"
        : prima.statoShopify === "ACTIVE" ? "DRAFT" : undefined;
      const r = await aggiornaProdottoSuShopify(token, {
        shopifyId,
        titolo: m.nome,
        descrizioneHtml: (m.descrizione ?? "").replace(/\n/g, "<br>"),
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
      entrate = (await completaSulNegozio({ ...m, collezioni: collezioniAggiunte }, token, shopifyId, mediaNuovi, cronaca, avvisi)).entrate;
      for (const x of collezioniTolte) {
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
    const stato: "ACTIVE" | "DRAFT" = m.finestraAperta ? "ACTIVE" : "DRAFT";
    const esito = await creaProdottoSuShopify(negozioToken, {
      titolo: m.nome,
      descrizioneHtml: (m.descrizione ?? "").replace(/\n/g, "<br>"),
      tipo: "",
      vendor: "",
      tags: m.tags,
      stato,
      prezzo: String(prezzoBase),
      prezzoConfronto: "",
      sku: codice,
      immagini: [],
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
      entrate = (await completaSulNegozio(m, negozioToken, shopifyId, m.media, cronaca, avvisi)).entrate;
    }
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
        metafieldShopify: m.metafield,
        ...colonneDaMetafield(m.metafield),
      },
    });
    // Varianti: per SKU. Le nuove nascono, le presenti si aggiornano, quelle
    // sparite dal modulo si tolgono solo se non hanno venduto niente.
    for (const v of varianti) {
      const dati = { nome: v.nome, deltaPrezzo: (v.prezzo || prezzoBase) - prezzoBase, deltaCosto: v.costo ? v.costo - m.costo : 0, prezzoPartner: v.prezzoPartner, giacenza: v.giacenza };
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
    if (fase !== prima.fase || cronaca.length) {
      await tx.tappaSviluppo.create({
        data: { prodottoId: id, da: prima.fase, a: fase, nota: ["Modificato dal modulo.", ...cronaca].join(" "), origine: shopifyId ? "shopify" : "ui" },
      });
    }
  });
  vaiAllaScheda(id, avvisi, shopifyId ? `Salvato qui e su ${m.negozio.nome}.` : "Modifiche salvate.");
}
