"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { registraEvento } from "@/lib/classificazione";
import { codificaChiave } from "@/lib/clienti";
import { tipologiaValida } from "@/lib/segmenti";
import { eseguiSyncOrdini } from "@/lib/sync";
import { tokenNegozio } from "@/lib/shopify";
import { cercaDocumento, scriviConsegna, dataValida, fasciaValida } from "@/lib/consegna";
import { salvaInRubrica } from "@/lib/rubrica";

// Tutte le mutazioni della UI passano da qui (server actions). Ogni
// riclassificazione lascia una traccia in EventoOrdine.

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

// ---- Sync ----
export async function sincronizza(fd: FormData) {
  const giorni = Number(s(fd, "giorni") ?? "90") || 90;
  await eseguiSyncOrdini(giorni);
  revalidatePath("/");
  revalidatePath("/bacheca");
  revalidatePath("/impostazioni");
}

// ---- Stato di un ordine ----
export async function cambiaStato(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  const statoId = s(fd, "statoId");
  if (!ordineId) return;
  const stato = statoId ? await prisma.statoOrdine.findUnique({ where: { id: statoId } }) : null;
  await prisma.ordine.update({
    where: { id: ordineId },
    data: {
      stato: statoId ? { connect: { id: statoId } } : { disconnect: true },
      ultimaClassifica: new Date(),
    },
  });
  await registraEvento(ordineId, "stato", `Stato → ${stato?.nome ?? "nessuno"}`);
  revalidatePath("/");
  revalidatePath("/bacheca");
  revalidatePath(`/ordini/${ordineId}`);
}

// ---- Classificazione completa (dalla scheda ordine) ----
export async function aggiornaClassificazione(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  if (!ordineId) return;
  const categoriaPagamento = s(fd, "categoriaPagamento");
  const attuale = await prisma.ordine.findUnique({
    where: { id: ordineId },
    select: { categoriaPagamento: true },
  });
  const categoriaManuale = categoriaPagamento != null && categoriaPagamento !== attuale?.categoriaPagamento;

  await prisma.ordine.update({
    where: { id: ordineId },
    data: {
      categoriaPagamento: categoriaPagamento ?? undefined,
      ...(categoriaManuale ? { categoriaPagamentoManuale: true } : {}),
      tipoConsegna: s(fd, "tipoConsegna"),
      tipoProdotto: s(fd, "tipoProdotto"),
      canale: s(fd, "canale"),
      assegnatoApp: s(fd, "assegnatoApp"),
      fornitore: s(fd, "fornitore"),
      responsabile: s(fd, "responsabile"),
      noteInterne: s(fd, "noteInterne"),
      ultimaClassifica: new Date(),
    },
  });
  await registraEvento(ordineId, "categoria", "Classificazione aggiornata");
  revalidatePath("/");
  revalidatePath(`/ordini/${ordineId}`);
}

// ---- Etichette su un ordine ----
export async function toggleEtichetta(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  const etichettaId = s(fd, "etichettaId");
  if (!ordineId || !etichettaId) return;
  const ordine = await prisma.ordine.findUnique({
    where: { id: ordineId },
    select: { etichette: { select: { id: true, nome: true } } },
  });
  const eti = await prisma.etichetta.findUnique({ where: { id: etichettaId } });
  const presente = ordine?.etichette.some((e) => e.id === etichettaId);
  await prisma.ordine.update({
    where: { id: ordineId },
    data: {
      etichette: presente ? { disconnect: { id: etichettaId } } : { connect: { id: etichettaId } },
      ultimaClassifica: new Date(),
    },
  });
  await registraEvento(ordineId, "etichetta", `${presente ? "Rimossa" : "Aggiunta"} etichetta ${eti?.nome ?? ""}`);
  revalidatePath("/");
  revalidatePath(`/ordini/${ordineId}`);
}

// ---- Tipologia di un cliente (scheda cliente) ----
// I clienti non sono una tabella: il tag si aggancia alla chiave (email →
// telefono → nome). Tipo vuoto = si torna alla tipologia dedotta dal nome.
export async function impostaTipologiaCliente(fd: FormData) {
  const chiave = s(fd, "chiave");
  if (!chiave) return;
  const tipo = tipologiaValida(s(fd, "tipo"));
  const note = s(fd, "note");

  if (!tipo) {
    await prisma.tagCliente.deleteMany({ where: { chiave } });
  } else {
    await prisma.tagCliente.upsert({
      where: { chiave },
      create: { chiave, tipo, note, autore: "operatore" },
      update: { tipo, note, autore: "operatore" },
    });
  }

  revalidatePath("/clienti");
  revalidatePath(`/clienti/${codificaChiave(chiave)}`);
  revalidatePath("/liste");
}

// ---- Gestione etichette (Impostazioni) ----
export async function creaEtichetta(fd: FormData) {
  const nome = s(fd, "nome");
  if (!nome) return;
  await prisma.etichetta.upsert({
    where: { nome },
    create: { nome, colore: s(fd, "colore") ?? "#0071e3" },
    update: { colore: s(fd, "colore") ?? undefined },
  });
  revalidatePath("/impostazioni");
}

export async function eliminaEtichetta(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.etichetta.delete({ where: { id } });
  revalidatePath("/impostazioni");
}

// ---- Gestione stati/pipeline (Impostazioni) ----
export async function creaStato(fd: FormData) {
  const nome = s(fd, "nome");
  if (!nome) return;
  const chiave = (s(fd, "chiave") ?? nome).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const max = await prisma.statoOrdine.aggregate({ _max: { ordine: true } });
  await prisma.statoOrdine.upsert({
    where: { chiave },
    create: {
      chiave,
      nome,
      colore: s(fd, "colore") ?? "#6e6e73",
      ordine: (max._max.ordine ?? -1) + 1,
      terminale: fd.get("terminale") === "on",
    },
    update: { nome, colore: s(fd, "colore") ?? undefined, terminale: fd.get("terminale") === "on" },
  });
  revalidatePath("/impostazioni");
  revalidatePath("/bacheca");
}

export async function aggiornaStato(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const predefinito = fd.get("predefinito") === "on";
  // Un solo stato predefinito alla volta.
  if (predefinito) {
    await prisma.statoOrdine.updateMany({ where: { predefinito: true }, data: { predefinito: false } });
  }
  await prisma.statoOrdine.update({
    where: { id },
    data: {
      nome: s(fd, "nome") ?? undefined,
      colore: s(fd, "colore") ?? undefined,
      ordine: Number(s(fd, "ordine") ?? "0") || 0,
      predefinito,
      terminale: fd.get("terminale") === "on",
    },
  });
  revalidatePath("/impostazioni");
  revalidatePath("/bacheca");
}

export async function eliminaStato(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  // Stacca gli ordini prima di eliminare lo stato (onDelete: SetNull non è
  // dichiarato, quindi lo facciamo esplicitamente).
  await prisma.ordine.updateMany({ where: { statoId: id }, data: { statoId: null } });
  await prisma.statoOrdine.delete({ where: { id } });
  revalidatePath("/impostazioni");
  revalidatePath("/bacheca");
}

// ---- Gestione negozi Shopify (Impostazioni) ----
export async function creaNegozio(fd: FormData) {
  const brand = s(fd, "brand");
  const dominio = s(fd, "dominio");
  if (!brand || !dominio) return;
  await prisma.negozioShopify.upsert({
    where: { brand },
    create: {
      brand,
      dominio,
      token: s(fd, "token") ?? "",
      clientId: s(fd, "clientId"),
      clientSecret: s(fd, "clientSecret"),
    },
    update: {
      dominio,
      token: s(fd, "token") ?? "",
      clientId: s(fd, "clientId"),
      clientSecret: s(fd, "clientSecret"),
      attivo: true,
    },
  });
  revalidatePath("/impostazioni");
}

// Colore del brand: distingue gli ordini dei vari negozi nell'elenco e nelle colonne.
export async function cambiaColoreBrand(fd: FormData) {
  const id = s(fd, "id");
  const colore = s(fd, "colore");
  if (!id || !colore) return;
  await prisma.negozioShopify.update({ where: { id }, data: { colore } });
  revalidatePath("/");
  revalidatePath("/clienti");
  revalidatePath("/impostazioni");
}

// Come si chiama questo negozio nell'app Ricerca fornitori: serve ai link
// rapidi "Cerca fornitore" (qui "Flowers", lì "deluxyflowers.com").
export async function cambiaBrandRicerca(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.negozioShopify.update({ where: { id }, data: { brandRicerca: s(fd, "brandRicerca") } });
  revalidatePath("/");
  revalidatePath("/impostazioni");
}

export async function toggleNegozio(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const n = await prisma.negozioShopify.findUnique({ where: { id } });
  if (n) await prisma.negozioShopify.update({ where: { id }, data: { attivo: !n.attivo } });
  revalidatePath("/impostazioni");
}

export async function eliminaNegozio(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.negozioShopify.delete({ where: { id } });
  revalidatePath("/impostazioni");
}

// ---- Consegna su bozze e ordini Shopify ----
// Scrive Data_Consegna / Fascia_Oraria_Consegna là dove Shopify non offre un
// campo: nelle bozze create a mano. L'esito torna nella query string perché la
// pagina è un server component e l'operazione riguarda Shopify, non il DB.
export async function impostaConsegnaShopify(fd: FormData) {
  const negozioId = s(fd, "negozioId");
  const numero = s(fd, "numero");
  const data = s(fd, "data");
  const fascia = s(fd, "fascia");

  const base = new URLSearchParams();
  if (negozioId) base.set("negozio", negozioId);
  if (numero) base.set("numero", numero);
  const torna = (extra: Record<string, string>) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/consegna?${p.toString()}`;
  };

  let destinazione: string;
  try {
    if (!negozioId || !numero) throw new Error("Servono il negozio e il numero della bozza o dell'ordine.");
    if (data && !dataValida(data)) throw new Error("Data non valida.");
    if (fascia && !fasciaValida(fascia)) throw new Error("Fascia oraria non prevista.");

    const neg = await prisma.negozioShopify.findUnique({ where: { id: negozioId } });
    if (!neg) throw new Error("Negozio non trovato.");

    const token = await tokenNegozio(neg);
    const doc = await cercaDocumento(neg.dominio, token, numero);
    if (!doc) throw new Error(`Nessuna bozza né ordine con numero ${numero} su ${neg.brand}.`);

    await scriviConsegna(neg.dominio, token, doc, data, fascia);
    const descrizione = [data, fascia].filter(Boolean).join(" · ") || "consegna azzerata";
    destinazione = torna({ esito: `${doc.tipo === "bozza" ? "Bozza" : "Ordine"} ${doc.numero}: ${descrizione}` });
  } catch (e) {
    destinazione = torna({ errore: (e as Error).message });
  }

  // Qui si aggiorna solo Shopify, che della consegna è la fonte: il registro
  // locale la rilegge dagli attributi al prossimo import.
  revalidatePath("/consegna");
  redirect(destinazione);
}

// ---- Rubrica Google: salva i clienti selezionati fra i contatti ----
// La pagina mostra prima la prova a vuoto; qui si scrive davvero.
export async function salvaRubrica(fd: FormData) {
  const sel = {
    limite: Math.min(2000, Math.max(1, Number(s(fd, "limite") ?? "50") || 50)),
    minimoOrdini: Math.max(1, Number(s(fd, "minimoOrdini") ?? "2") || 2),
    dal: s(fd, "dal") ?? undefined,
  };
  await salvaInRubrica(sel);
  revalidatePath("/clienti/rubrica");
}

// ---- Chiavi API (Impostazioni): attiva/disattiva. Creazione via `npm run chiave`. ----
export async function toggleChiave(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const k = await prisma.apiKey.findUnique({ where: { id } });
  if (k) await prisma.apiKey.update({ where: { id }, data: { attiva: !k.attiva } });
  revalidatePath("/impostazioni");
}
