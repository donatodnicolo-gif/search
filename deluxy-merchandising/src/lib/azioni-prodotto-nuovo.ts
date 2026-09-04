"use server";

// **Far nascere un prodotto dal modulo «Nuovo prodotto»** (04/09/2026).
//
// Le decisioni di sostanza, nell'ordine in cui contano:
// 1. **Lo SKU è unico**: quello del form (7 cifre) si tiene se libero, se no
//    se ne genera un altro finché non lo è. Un doppione non entra mai.
// 2. **Pubblico = su Shopify.** Con la fase «Pubblico» il prodotto si crea
//    PRIMA sul negozio e poi qui, collegato (`shopifyId`): se il negozio
//    rifiuta, qui nasce lo stesso ma come «approvato», con l'errore scritto
//    nella cronaca e nel banner — il lavoro compilato non si perde, e non
//    resta un «pubblico» che sul sito non esiste.
// 3. Alla pubblicazione: le foto e i video già nei Files del negozio si
//    agganciano al prodotto; se c'è una collezione scelta ci entra; se si è
//    chiesto, titolo e descrizione si traducono con l'AI e si scrivono sul
//    negozio. Ognuno di questi passi può fallire per conto suo: si va avanti e
//    si riporta tutto nell'esito, perché «prodotto creato ma senza foto» va
//    detto, non nascosto.
// 4. **Finestra di pubblicazione**: con «dal» nel futuro il prodotto nasce
//    come bozza sul negozio e il cron delle 04:05 lo accende quel giorno;
//    «fino al» lo spegne il giorno dopo. Le date sono giorni di Roma.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { traduciScheda } from "./ai-traduzioni";
import { prisma } from "./db";
import { giornoRoma, isoGiornoValido, mezzanotteRomaDi } from "./fuso";
import { elencoNegozi, tokenDi } from "./negozi";
import { creaProdottoSuShopify } from "./shopify-admin";
import { agganciaFileAlProdotto, aggiungiProdottoACollezione } from "./shopify-media";
import { registraTraduzioniProdotto } from "./shopify-traduzioni-scrittura";

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
function numero(fd: FormData, k: string): number {
  const n = parseFloat(testo(fd, k).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function skuCasuale(): string {
  return String(Math.floor(1_000_000 + Math.random() * 9_000_000));
}

/**
 * Il codice libero: quello chiesto se non è preso, altrimenti uno nuovo.
 * Con `quanteVarianti` > 0 devono essere liberi anche gli SKU derivati
 * («-1», «-2»…): un codice principale libero con una variante già presa non
 * serve a niente, quindi si controllano insieme.
 */
async function codiceLibero(chiesto: string, quanteVarianti = 0): Promise<{ codice: string; cambiato: boolean }> {
  const preso = async (c: string) =>
    (await prisma.prodotto.findUnique({ where: { codice: c }, select: { id: true } })) != null ||
    (await prisma.variante.findUnique({ where: { sku: c }, select: { id: true } })) != null;
  const tuttiLiberi = async (c: string) => {
    if (await preso(c)) return false;
    for (let i = 1; i <= quanteVarianti; i++) if (await preso(`${c}-${i}`)) return false;
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

type VarianteDalForm = { nome: string; prezzo: string; costo: string; giacenza: string };

function soldiDa(v: string): number {
  const n = parseFloat((v || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
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

export async function creaProdottoCompleto(fd: FormData) {
  const indietro = (errore: string) => redirect(`/prodotti/nuovo?errore=${encodeURIComponent(errore)}`);

  const nome = testo(fd, "nome");
  if (!nome) indietro("Il nome del prodotto è obbligatorio.");

  const negozi = await elencoNegozi();
  const negozio = negozi.find((n) => n.id === testo(fd, "negozioId")) ?? null;
  if (!negozio) indietro("Scegli il brand / negozio.");
  const negozioOk = negozio as NonNullable<typeof negozio>;

  const faseChiesta = testo(fd, "fase") || "concept";
  const vuolePubblicare = faseChiesta === "in_vendita";
  const categoria = testo(fd, "categoria") || "DA_CLASSIFICARE";
  const collezioneId = testo(fd, "collezioneShopifyId") || null;
  const collezione = collezioneId
    ? await prisma.collezioneShopify.findUnique({ where: { id: collezioneId }, select: { id: true, shopifyId: true, titolo: true, tipo: true, negozio: true } })
    : null;
  if (collezioneId && !collezione) indietro("La collezione scelta non esiste più: rifai l'import o scegline un'altra.");
  if (collezione && collezione.negozio !== negozioOk.nome) indietro("La collezione scelta è di un altro negozio.");

  let media: MediaDalForm[] = [];
  try {
    media = (JSON.parse(testo(fd, "mediaJson") || "[]") as MediaDalForm[]).filter(
      (m) => m && m.shopifyFileId && m.stato !== "fallito" && m.negozio === negozioOk.nome
    );
  } catch {
    media = [];
  }

  const dalIso = testo(fd, "pubblicatoDal");
  const alIso = testo(fd, "pubblicatoFinoAl");
  // Le date si salvano anche se il prodotto non è ancora Pubblico: sono il
  // programma, e il calendario delle pubblicazioni le mostra.
  const pubblicatoDal = isoGiornoValido(dalIso) ? mezzanotteRomaDi(dalIso) : null;
  const pubblicatoFinoAl = isoGiornoValido(alIso) ? mezzanotteRomaDi(alIso) : null;
  if (pubblicatoDal && pubblicatoFinoAl && pubblicatoFinoAl < pubblicatoDal) indietro("La fine della pubblicazione viene prima dell'inizio.");
  const oggi = giornoRoma(new Date());
  const finestraAperta = (!pubblicatoDal || pubblicatoDal <= oggi) && (!pubblicatoFinoAl || pubblicatoFinoAl >= oggi);

  // Varianti: nome obbligatorio, SKU derivato dal principale («-1», «-2»…).
  let variantiForm: VarianteDalForm[] = [];
  try {
    variantiForm = (JSON.parse(testo(fd, "variantiJson") || "[]") as VarianteDalForm[]).filter((v) => v && v.nome?.trim());
  } catch {
    variantiForm = [];
  }
  const nomeOpzione = testo(fd, "nomeOpzione") || "Formato";
  const { codice, cambiato } = await codiceLibero(testo(fd, "codice").replace(/\D/g, ""), variantiForm.length);
  const varianti = variantiForm.map((v, i) => ({
    nome: v.nome.trim(),
    sku: `${codice}-${i + 1}`,
    prezzo: soldiDa(v.prezzo),
    costo: soldiDa(v.costo),
    giacenza: Math.max(0, Math.round(Number(v.giacenza) || 0)),
  }));
  // Con le varianti il prezzo del prodotto è la BASE: quello scritto, o se è
  // zero il prezzo della variante più economica (modello «base + delta»).
  const prezzoScritto = numero(fd, "prezzoVendita");
  const prezzo =
    varianti.length && prezzoScritto === 0 ? Math.min(...varianti.map((v) => v.prezzo).filter((p) => p > 0), Infinity) : prezzoScritto;
  const prezzoBase = Number.isFinite(prezzo) ? prezzo : 0;
  const descrizione = testo(fd, "descrizione") || null;
  const avvisi: string[] = [];
  if (cambiato) avvisi.push(`Lo SKU scelto era già in uso: assegnato ${codice}.`);

  // ---- Su Shopify, se Pubblico ----
  let shopifyId: string | null = null;
  let handle: string | null = null;
  let fase = faseChiesta;
  let shopifyStato = "non_pubblicato";
  let statoShopify: string | null = null;
  const cronaca: string[] = [];

  if (vuolePubblicare) {
    if (!negozioOk.permessi.includes("write_products")) {
      indietro(`Il negozio ${negozioOk.nome} non ha il permesso write_products: non posso pubblicare.`);
    }
    const token = await tokenDi(negozioOk.id).catch(() => null);
    if (!token) indietro(`Il negozio ${negozioOk.nome} non sa autenticarsi su Shopify: controlla le credenziali.`);
    const negozioToken = token as NonNullable<typeof token>;

    const stato: "ACTIVE" | "DRAFT" = finestraAperta ? "ACTIVE" : "DRAFT";
    const esito = await creaProdottoSuShopify(negozioToken, {
      titolo: nome,
      descrizioneHtml: (descrizione ?? "").replace(/\n/g, "<br>"),
      tipo: "",
      vendor: "",
      tags: [],
      stato,
      prezzo: String(prezzoBase),
      prezzoConfronto: "",
      sku: codice,
      immagini: [],
      fisico: true,
      controllaStock: varianti.some((v) => v.giacenza > 0),
      giacenza: "0",
      nomeOpzione,
      varianti: varianti.map((v) => ({
        nome: v.nome,
        sku: v.sku,
        prezzo: String(v.prezzo || prezzoBase),
        prezzoConfronto: "",
        giacenza: String(v.giacenza),
      })),
      metafield: [],
    });
    cronaca.push(...esito.passi);
    if (!esito.prodottoId) {
      // Il negozio ha detto no: il prodotto nasce qui come «approvato», con
      // l'errore scritto. Niente fantasmi «pubblici» che sul sito non ci sono.
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
      if (!finestraAperta) cronaca.push(`Nasce come bozza: la finestra di pubblicazione si apre il ${dalIso}.`);

      // Foto e video: già nei Files del negozio, si agganciano.
      if (media.length) {
        const r = await agganciaFileAlProdotto(negozioToken, media.map((m) => m.shopifyFileId), shopifyId);
        if (r.ok) cronaca.push(`${media.length} file agganciati al prodotto.`);
        else avvisi.push(`Foto/video non agganciati: ${r.errore}`);
      }
      // La collezione.
      if (collezione) {
        if (collezione.tipo !== "manuale") {
          avvisi.push(`«${collezione.titolo}» è una collezione automatica: chi ci entra lo decide la regola del negozio.`);
        } else {
          const r = await aggiungiProdottoACollezione(negozioToken, collezione.shopifyId, shopifyId);
          if (r.ok) cronaca.push(`Messo nella collezione «${collezione.titolo}».`);
          else avvisi.push(`Non entrato in «${collezione.titolo}»: ${r.errore}`);
        }
      }
      // Le traduzioni.
      if (fd.get("traduci") != null) {
        const t = await traduciScheda({ titolo: nome, descrizione: descrizione ?? "" });
        if (!t.ok) avvisi.push(`Traduzioni non fatte: ${t.errore}`);
        else {
          const r = await registraTraduzioniProdotto(negozioToken, shopifyId, t.traduzioni);
          if (r.scritte > 0) cronaca.push(`Traduzioni scritte sul negozio: ${r.scritte} voci.`);
          if (r.errori.length) avvisi.push(`Traduzioni rifiutate: ${r.errori.join(" · ")}`);
        }
      }
    }
  }

  // ---- Qui ----
  const immagini = media.filter((m) => m.tipo === "immagine" && m.url);
  const p = await prisma.prodotto.create({
    data: {
      codice,
      nome,
      categoria,
      fase,
      descrizione,
      brief: testo(fd, "brief") || null,
      materiali: testo(fd, "materiali") || null,
      palette: testo(fd, "palette") || null,
      costoProduzione: numero(fd, "costoProduzione"),
      prezzoVendita: prezzoBase,
      immagine: immagini[0]?.url ?? null,
      varianti: varianti.length
        ? {
            create: varianti.map((v) => ({
              nome: v.nome,
              sku: v.sku,
              deltaPrezzo: (v.prezzo || prezzoBase) - prezzoBase,
              deltaCosto: v.costo ? v.costo - numero(fd, "costoProduzione") : 0,
              giacenza: v.giacenza,
            })),
          }
        : undefined,
      negozioNome: negozioOk.nome,
      collezioneShopifyId: collezione?.id ?? null,
      pubblicatoDal,
      pubblicatoFinoAl,
      shopifyId,
      shopifyStato,
      statoShopify,
      shopifySyncIl: shopifyId ? new Date() : null,
      handleShopify: handle,
      media: media.length
        ? {
            create: media.map((m, i) => ({
              tipo: m.tipo,
              url: m.url,
              anteprima: m.anteprima,
              shopifyFileId: m.shopifyFileId,
              negozio: m.negozio,
              nome: m.nome,
              stato: m.stato,
              ordine: i,
            })),
          }
        : undefined,
    },
  });
  // Se il prodotto è appena nato su Shopify e la collezione è manuale, la
  // appartenenza locale nasce subito: l'import la confermerà.
  if (shopifyId && collezione && collezione.tipo === "manuale" && cronaca.some((c) => c.startsWith("Messo nella collezione"))) {
    await prisma.prodottoInCollezioneShopify
      .create({ data: { collezioneId: collezione.id, prodottoId: p.id, origine: "manuale", posizione: 9999, prodottoShopifyId: shopifyId } })
      .catch(() => undefined);
  }
  await prisma.tappaSviluppo.create({
    data: {
      prodottoId: p.id,
      da: "—",
      a: fase,
      nota: [
        shopifyId ? `Creato su ${negozioOk.nome} (${handle ?? shopifyId}).` : "Prodotto creato.",
        varianti.length ? `${varianti.length} varianti (${varianti.map((v) => v.sku).join(", ")}).` : "",
        ...cronaca,
      ]
        .filter(Boolean)
        .join(" "),
      origine: shopifyId ? "shopify" : "ui",
    },
  });

  for (const path of ["/", "/prodotti", "/sviluppo", "/sviluppo/calendario", "/shopify", "/anagrafica"]) revalidatePath(path);
  const q = new URLSearchParams();
  if (avvisi.length) q.set("avviso", avvisi.join(" · "));
  else q.set("esito", "ok");
  q.set("messaggio", avvisi.length ? avvisi.join(" · ") : shopifyId ? `Creato e pubblicato su ${negozioOk.nome}.` : "Prodotto creato.");
  redirect(`/prodotti/${p.id}?${q}`);
}
