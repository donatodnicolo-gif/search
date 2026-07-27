"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generaChiave, improntaChiave } from "./api-auth";
import { prisma } from "./db";
import { salvaNegozio, tokenDi, verificaNegozio } from "./negozi";
import { eliminaSegreto, salvaSegreto } from "./segreti";
import { creaProdottoSuShopify } from "./shopify-admin";

function testo(fd: FormData, chiave: string): string {
  const v = fd.get(chiave);
  return typeof v === "string" ? v : "";
}

/** Crea o aggiorna un negozio Shopify e torna in pagina con l'esito. */
export async function salvaNegozioAzione(fd: FormData) {
  const id = testo(fd, "id") || null;
  const esito = await salvaNegozio({
    id,
    nome: testo(fd, "nome"),
    dominio: testo(fd, "dominio"),
    token: testo(fd, "token") || null,
    clientId: testo(fd, "clientId") || null,
    clientSecret: testo(fd, "clientSecret") || null,
    canaleVendite: testo(fd, "canaleVendite") || null,
  });
  revalidatePath("/impostazioni");
  if (!esito.ok) redirect(`/impostazioni?errore=${encodeURIComponent(esito.errore)}`);
  // Appena salvato si verifica da solo: sapere subito se le credenziali
  // funzionano vale più di un messaggio "salvato" che non dice niente.
  await verificaNegozio(esito.id);
  revalidatePath("/impostazioni");
  redirect(`/impostazioni?esito=${esito.aggiornato ? "aggiornato" : "salvato"}#negozio-${esito.id}`);
}

export async function verificaNegozioAzione(id: string) {
  await verificaNegozio(id);
  revalidatePath("/impostazioni");
}

export async function attivaNegozio(id: string, attivo: boolean) {
  await prisma.negozioShopify.update({ where: { id }, data: { attivo } });
  revalidatePath("/impostazioni");
}

/**
 * Crea un prodotto sul negozio Shopify scelto e, se va a buon fine, lo mette
 * anche nel catalogo di Merchandising già collegato.
 *
 * L'ordine conta: prima Shopify, poi il locale. Se Shopify rifiuta non resta un
 * prodotto fantasma qui dentro che nessuno ha mai visto sul negozio.
 */
export async function creaProdottoShopifyAzione(fd: FormData) {
  const negozioId = testo(fd, "negozioId");
  const negozio = negozioId ? await tokenDi(negozioId) : null;
  if (!negozio) redirect("/prodotti/nuovo-shopify?errore=" + encodeURIComponent("Negozio non trovato o senza token."));

  const titolo = testo(fd, "titolo").trim();
  if (!titolo) redirect("/prodotti/nuovo-shopify?errore=" + encodeURIComponent("Il nome del prodotto è obbligatorio."));

  const leggiJson = <T,>(chiave: string, vuoto: T): T => {
    try {
      return JSON.parse(testo(fd, chiave) || "null") ?? vuoto;
    } catch {
      return vuoto;
    }
  };

  const varianti = leggiJson<{ nome: string; sku: string; prezzo: string; prezzoConfronto: string; giacenza: string }[]>(
    "variantiJson",
    []
  ).filter((v) => v.nome.trim());
  const extra = leggiJson<{ chiave: string; valore: string }[]>("extraJson", []);

  const prodotto = {
    titolo,
    descrizioneHtml: testo(fd, "descrizione").trim().replace(/\n/g, "<br>"),
    tipo: testo(fd, "tipo").trim(),
    vendor: testo(fd, "vendor").trim(),
    // La "linea" del form reale accetta più valori separati da ";": diventano tag.
    tags: testo(fd, "linea").split(";").map((t) => t.trim()).filter(Boolean),
    stato: (testo(fd, "stato") === "ACTIVE" ? "ACTIVE" : "DRAFT") as "ACTIVE" | "DRAFT",
    prezzo: testo(fd, "prezzo"),
    prezzoConfronto: testo(fd, "prezzoConfronto"),
    sku: testo(fd, "sku").trim(),
    immagini: testo(fd, "immagini").split(/\r?\n/).map((r) => r.trim()).filter(Boolean),
    fisico: fd.get("fisico") != null,
    controllaStock: fd.get("controllaStock") != null,
    giacenza: testo(fd, "giacenza"),
    nomeOpzione: testo(fd, "nomeOpzione").trim() || "Formato",
    varianti,
    metafield: extra.filter((e) => e.chiave.trim() && e.valore.trim()),
  };

  const esito = await creaProdottoSuShopify(negozio, prodotto);
  if (!esito.prodottoId) {
    const messaggio = esito.errori.map((e) => (e.campo ? `${e.campo}: ${e.messaggio}` : e.messaggio)).join(" · ");
    redirect(`/prodotti/nuovo-shopify?errore=${encodeURIComponent(messaggio || "Shopify non ha creato il prodotto.")}`);
  }

  // Catalogo locale: il codice è lo SKU se c'è, altrimenti l'handle di Shopify.
  const prezzo = parseFloat((prodotto.prezzo || "0").replace(",", ".")) || 0;
  let codice = prodotto.sku || esito.handle || titolo.slice(0, 24);
  if (await prisma.prodotto.findUnique({ where: { codice } })) codice = `${codice}-${Date.now().toString(36).slice(-4)}`;

  const locale = await prisma.prodotto.create({
    data: {
      codice,
      nome: titolo,
      categoria: "DA_CLASSIFICARE",
      fase: prodotto.stato === "ACTIVE" ? "in_vendita" : "approvato",
      descrizione: testo(fd, "descrizione").trim() || null,
      prezzoVendita: prezzo,
      costoProduzione: 0,
      immagine: prodotto.immagini[0] ?? null,
      shopifyStato: prodotto.stato === "ACTIVE" ? "pubblicato" : "bozza",
      shopifyId: esito.prodottoId,
      shopifySyncIl: new Date(),
      varianti: varianti.length
        ? {
            create: varianti.map((v) => ({
              nome: v.nome,
              sku: v.sku || null,
              deltaPrezzo: (parseFloat((v.prezzo || "0").replace(",", ".")) || 0) - prezzo,
              giacenza: Math.max(0, Math.round(Number(v.giacenza) || 0)),
            })),
          }
        : undefined,
    },
  });
  await prisma.tappaSviluppo.create({
    data: {
      prodottoId: locale.id,
      da: "—",
      a: locale.fase,
      nota: `Creato su Shopify (${esito.handle ?? esito.prodottoId}). ${esito.passi.join(" ")}`.trim(),
      origine: "shopify",
    },
  });

  revalidatePath("/prodotti");
  revalidatePath("/shopify");
  const avviso = esito.errori.length
    ? `?avviso=${encodeURIComponent(esito.errori.map((e) => e.messaggio).join(" · "))}`
    : "";
  redirect(`/prodotti/${locale.id}${avviso}`);
}

// ---------- Scrittura AI ----------

export async function salvaChiaveAiAzione(fd: FormData) {
  const esito = await salvaSegreto("OPENAI_API_KEY", testo(fd, "chiave"));
  revalidatePath("/impostazioni");
  revalidatePath("/prodotti/nuovo-shopify");
  redirect(esito.ok ? "/impostazioni?esito=chiave" : `/impostazioni?errore=${encodeURIComponent(esito.errore ?? "")}`);
}

export async function eliminaChiaveAiAzione() {
  await eliminaSegreto("OPENAI_API_KEY");
  revalidatePath("/impostazioni");
  redirect("/impostazioni?esito=chiave-tolta");
}

/**
 * Salva i prompt di categoria: uno per categoria, come il campo AI Prompt del
 * form Categorie dell'app reale. Un prompt svuotato si cancella, così togliere
 * un'indicazione è semplice quanto metterla.
 */
export async function salvaPromptCategorieAzione(fd: FormData) {
  for (const [chiave, valore] of fd.entries()) {
    if (!chiave.startsWith("prompt-") || typeof valore !== "string") continue;
    const categoria = chiave.slice("prompt-".length);
    const prompt = valore.trim();
    if (prompt) {
      await prisma.promptCategoria.upsert({
        where: { categoria },
        create: { categoria, prompt },
        update: { prompt },
      });
    } else {
      await prisma.promptCategoria.deleteMany({ where: { categoria } });
    }
  }
  revalidatePath("/impostazioni");
  revalidatePath("/prodotti/nuovo-shopify");
  redirect("/impostazioni?esito=prompt");
}

// ---------- Chiavi API per le altre app ----------

/**
 * Crea una chiave e la mostra **una volta sola** nella querystring del
 * redirect: nel database resta solo l'impronta, quindi o la si copia adesso o
 * se ne fa un'altra. È lo stesso patto di deluxy-orders.
 */
export async function creaChiaveApiAzione(fd: FormData) {
  const nome = testo(fd, "nomeChiave");
  if (!nome) redirect("/impostazioni?errore=" + encodeURIComponent("Serve un nome per la chiave."));
  const chiave = generaChiave();
  try {
    await prisma.apiKey.create({ data: { nome, hash: improntaChiave(chiave) } });
  } catch {
    redirect("/impostazioni?errore=" + encodeURIComponent(`Esiste già una chiave chiamata «${nome}».`));
  }
  revalidatePath("/impostazioni");
  redirect(`/impostazioni?esito=chiave-api&nuova=${encodeURIComponent(chiave)}`);
}

export async function revocaChiaveApiAzione(id: string) {
  await prisma.apiKey.delete({ where: { id } });
  revalidatePath("/impostazioni");
  redirect("/impostazioni?esito=chiave-api-revocata");
}

export async function eliminaNegozio(id: string) {
  await prisma.negozioShopify.delete({ where: { id } });
  revalidatePath("/impostazioni");
  redirect("/impostazioni?esito=eliminato");
}
