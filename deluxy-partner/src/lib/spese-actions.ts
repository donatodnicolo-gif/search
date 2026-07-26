"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { registra } from "./registro";
import { categorieDaBudgets, categoriaDaRegole } from "./categorie-spesa";

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
