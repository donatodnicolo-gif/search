"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { registra } from "./registro";
import { categorieDaBudgets, categoriaDaRegole, proponiConAI } from "./categorie-spesa";

// Assegnazione della categoria di costo alle USCITE. L'elenco delle categorie
// è di Budgets (vedi `categorie-spesa.ts`): qui si scrive solo la scelta.

export async function impostaCategoriaSpesa(txId: string, formData: FormData) {
  const scelta = String(formData.get("categoria") ?? "");
  const esito = await categorieDaBudgets();
  if (!esito.ok) return;

  const tx = await prisma.transazioneBancaria.findUnique({
    where: { id: txId },
    select: { descrizione: true, controparte: true, importo: true, categoriaNome: true },
  });
  if (!tx) return;

  // Stringa vuota = «togli la categoria»: serve per correggere un'assegnazione
  // sbagliata senza doverne scegliere un'altra a caso.
  if (!scelta) {
    await prisma.transazioneBancaria.update({
      where: { id: txId },
      data: { categoriaId: null, categoriaNome: null, categoriaTipoPL: null, categoriaDa: null, categoriaIl: null },
    });
    await registra({
      azione: `Categoria rimossa da «${tx.controparte ?? tx.descrizione}»`,
      categoria: "transazioni",
      entita: "transazione",
      entitaId: txId,
      dettaglio: tx.categoriaNome ? `era «${tx.categoriaNome}»` : null,
    });
    revalidatePath("/spese");
    return;
  }

  const cat = esito.categorie.find((c) => c.id === scelta);
  if (!cat) return;

  await prisma.transazioneBancaria.update({
    where: { id: txId },
    data: {
      categoriaId: cat.id,
      categoriaNome: cat.nome,
      categoriaTipoPL: cat.tipoPL,
      categoriaDa: "manuale",
      categoriaIl: new Date(),
    },
  });
  await registra({
    azione: `«${tx.controparte ?? tx.descrizione}» → categoria ${cat.nome}`,
    categoria: "transazioni",
    entita: "transazione",
    entitaId: txId,
    dettaglio: tx.categoriaNome && tx.categoriaNome !== cat.nome ? `prima era «${tx.categoriaNome}»` : null,
  });
  revalidatePath("/spese");
}

/** Applica in blocco le REGOLE di Budgets alle uscite ancora senza categoria.
 *  Non tocca MAI quelle già assegnate: una scelta fatta da una persona non la
 *  può ribaltare una regola, altrimenti il lavoro manuale si perde a ogni giro. */
export async function applicaRegoleCategorie() {
  const esito = await categorieDaBudgets(true);
  if (!esito.ok) {
    redirect(`/spese?errore=${encodeURIComponent(esito.errore)}`);
  }

  const daFare = await prisma.transazioneBancaria.findMany({
    where: { importo: { lt: 0 }, categoriaId: null },
    select: { id: true, descrizione: true, controparte: true },
  });

  // Si raggruppa PRIMA per categoria e poi si scrive con `updateMany`: le
  // uscite sono migliaia e un update per riga significherebbe migliaia di
  // andate e ritorno al database, cioè il timeout della funzione a metà lavoro
  // — col risultato peggiore di tutti, metà spese categorizzate e nessun
  // messaggio che lo dica.
  const perCategoria = new Map<string, { cat: (typeof esito.categorie)[number]; ids: string[] }>();
  for (const tx of daFare) {
    const cat = categoriaDaRegole(tx.controparte, tx.descrizione, esito.categorie);
    if (!cat) continue;
    const gruppo = perCategoria.get(cat.id) ?? { cat, ids: [] };
    gruppo.ids.push(tx.id);
    perCategoria.set(cat.id, gruppo);
  }

  const adesso = new Date();
  let assegnate = 0;
  for (const { cat, ids } of perCategoria.values()) {
    // A blocchi: un `IN (…)` con migliaia di id è una query che il database
    // fatica a pianificare.
    for (let i = 0; i < ids.length; i += 500) {
      const blocco = ids.slice(i, i + 500);
      await prisma.transazioneBancaria.updateMany({
        where: { id: { in: blocco }, categoriaId: null },
        data: {
          categoriaId: cat.id,
          categoriaNome: cat.nome,
          categoriaTipoPL: cat.tipoPL,
          categoriaDa: "regola",
          categoriaIl: adesso,
        },
      });
      assegnate += blocco.length;
    }
  }

  await registra({
    azione: `Regole di Budgets applicate alle spese: ${assegnate} categorizzate`,
    categoria: "transazioni",
    dettaglio: `${daFare.length - assegnate} uscite restano senza categoria (nessuna regola le riconosce)`,
  });
  revalidatePath("/spese");
  redirect(`/spese?applicate=${assegnate}&restano=${daFare.length - assegnate}`);
}

// ————— Proposte dell'AI —————
// L'AI vive in Budgets (stesse categorie, stesso prompt): qui si raccolgono le
// controparti ancora senza categoria, si chiede la proposta e si applica.
//
// Due scelte volute, perché qui dietro c'è un bilancio:
//  1. le proposte a **confidenza bassa** non si applicano: meglio una spesa non
//     categorizzata che una nella voce sbagliata del conto economico;
//  2. si scrive `categoriaDa = "ai"`, così in pagina si filtra «assegnate
//     dall'AI» e si rivedono. Una proposta indistinguibile da una scelta umana
//     non sarebbe più verificabile da nessuno.
// Come le regole, non tocca MAI ciò che è già assegnato.
const MAX_CONTROPARTI_AI = 300; // ~3 lotti: oltre, la funzione va in timeout
const LOTTO_AI = 100;

export async function proponiCategorieAI() {
  const esitoCat = await categorieDaBudgets();
  if (!esitoCat.ok) redirect(`/spese?errore=${encodeURIComponent(esitoCat.errore)}`);

  // Si ragiona per CONTROPARTE, non per movimento: le stesse 6.000 uscite sono
  // poche centinaia di fornitori, e all'AI si chiede una volta sola per ognuno.
  const uscite = await prisma.transazioneBancaria.findMany({
    where: { importo: { lt: 0 }, categoriaId: null, stato: { not: "ignorata" } },
    select: { controparte: true, descrizione: true, importo: true },
  });
  const perContro = new Map<string, number>();
  for (const t of uscite) {
    const k = (t.controparte?.trim() || t.descrizione?.trim() || "").slice(0, 120);
    if (!k) continue;
    perContro.set(k, (perContro.get(k) ?? 0) + Math.abs(t.importo));
  }
  // Prima le controparti che pesano di più: se il tetto taglia qualcosa, taglia
  // le briciole e non i fornitori grossi.
  const ordinate = [...perContro.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CONTROPARTI_AI)
    .map(([controparte, uscite]) => ({ controparte, uscite }));

  if (ordinate.length === 0) redirect("/spese?ai=0&saltate=0&restano=0");

  const perNome = new Map(esitoCat.categorie.map((c) => [c.nome.toLowerCase(), c]));
  let applicate = 0;
  let saltate = 0;

  for (let i = 0; i < ordinate.length; i += LOTTO_AI) {
    const lotto = ordinate.slice(i, i + LOTTO_AI);
    const esito = await proponiConAI(lotto);
    if (!esito.ok) {
      // Se il primo lotto fallisce non si è fatto nulla: si dice e basta.
      // Se fallisce a metà, il lavoro già applicato resta buono e lo si riporta.
      if (applicate === 0) redirect(`/spese?errore=${encodeURIComponent(esito.errore)}`);
      break;
    }
    for (const p of esito.proposte) {
      const cat = p.categoria ? perNome.get(p.categoria.trim().toLowerCase()) : null;
      if (!cat || p.confidenza === "bassa") {
        saltate++;
        continue;
      }
      const r = await prisma.transazioneBancaria.updateMany({
        where: {
          importo: { lt: 0 },
          categoriaId: null, // non si sovrascrive mai niente
          stato: { not: "ignorata" },
          OR: [{ controparte: p.controparte }, { controparte: null, descrizione: p.controparte }],
        },
        data: {
          categoriaId: cat.id,
          categoriaNome: cat.nome,
          categoriaTipoPL: cat.tipoPL,
          categoriaDa: "ai",
          categoriaNota: `confidenza ${p.confidenza} · ${p.motivo}`.slice(0, 300),
          categoriaIl: new Date(),
        },
      });
      applicate += r.count;
    }
  }

  const restano = Math.max(0, perContro.size - ordinate.length);
  await registra({
    azione: `Proposte AI sulle spese: ${applicate} movimenti categorizzati`,
    categoria: "transazioni",
    dettaglio: `${saltate} controparti lasciate stare (AI incerta) · ${restano} controparti oltre il tetto di ${MAX_CONTROPARTI_AI}`,
  });
  revalidatePath("/spese");
  redirect(`/spese?ai=${applicate}&saltate=${saltate}&restano=${restano}`);
}
