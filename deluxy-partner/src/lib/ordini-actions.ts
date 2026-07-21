"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { scaricaOrdini, verificaNegozio } from "./shopify";

function revalida() {
  revalidatePath("/ordini", "layout");
  revalidatePath("/impostazioni", "layout");
}

// ————— Negozi Shopify (configurazione) —————
export async function salvaNegozioShopify(fd: FormData) {
  const brand = String(fd.get("brand") ?? "").trim();
  const dominio = String(fd.get("dominio") ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const token = String(fd.get("token") ?? "").trim();
  if (!brand || !dominio) redirect("/impostazioni?errore=" + encodeURIComponent("Brand e dominio del negozio sono obbligatori."));

  // verifica il token prima di salvarlo (se fornito)
  if (token) {
    const v = await verificaNegozio(dominio, token);
    if (!v.ok) redirect("/impostazioni?errore=" + encodeURIComponent(`Negozio ${dominio}: ${v.messaggio}`));
  }
  const esistente = await prisma.negozioShopify.findUnique({ where: { brand } });
  await prisma.negozioShopify.upsert({
    where: { brand },
    create: { brand, dominio, token: token || "", attivo: true },
    // token vuoto in update = non lo cambiamo
    update: { dominio, ...(token ? { token } : {}), attivo: true },
  });
  if (esistente && !token && !esistente.token) {
    redirect("/impostazioni?errore=" + encodeURIComponent(`Negozio ${dominio} salvato ma senza token: inseriscilo per scaricare gli ordini.`));
  }
  revalida();
  redirect("/impostazioni?salvato=shopify");
}

export async function rimuoviNegozioShopify(id: string) {
  await prisma.negozioShopify.delete({ where: { id } });
  revalida();
  redirect("/impostazioni?salvato=shopify");
}

// ————— Sync ordini —————
// Scarica gli ordini di tutti i negozi collegati (ultimi `giorni` giorni) e li
// aggiorna. Gli ordini a carta già pagati vengono marcati "incassato_gateway"
// (l'incasso è avvenuto lato gateway; il payout si riconcilia a blocco).
export async function sincronizzaOrdini(giorni = 90) {
  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true } });
  const dal = new Date(Date.now() - giorni * 86400000);
  let nuovi = 0, aggiornati = 0, errori: string[] = [];

  for (const neg of negozi) {
    if (!neg.token) { errori.push(`${neg.brand}: token mancante`); continue; }
    let ordini;
    try {
      ordini = await scaricaOrdini(neg.dominio, neg.token, dal);
    } catch (e) {
      errori.push(`${neg.brand}: ${(e as Error).message}`);
      continue;
    }
    for (const o of ordini) {
      const paidCarta = o.categoriaPagamento === "carta" && (o.financialStatus ?? "").toUpperCase() === "PAID";
      const esistente = await prisma.ordineShopify.findUnique({
        where: { negozioId_orderId: { negozioId: neg.id, orderId: o.orderId } },
      });
      const datiBase = {
        brand: neg.brand,
        nome: o.nome,
        data: o.data,
        totale: o.totale,
        valuta: o.valuta,
        financialStatus: o.financialStatus,
        gateway: o.gateway,
        categoriaPagamento: o.categoriaPagamento,
        clienteNome: o.clienteNome,
        clienteEmail: o.clienteEmail,
        note: o.note,
      };
      if (!esistente) {
        await prisma.ordineShopify.create({
          data: {
            negozioId: neg.id,
            orderId: o.orderId,
            ...datiBase,
            statoRicon: paidCarta ? "incassato_gateway" : "da_riconciliare",
            riconciliatoIl: paidCarta ? new Date() : null,
          },
        });
        nuovi++;
      } else {
        // aggiorna i dati; NON tocca lo stato se già riconciliato/ignorato a mano
        const nuovoStato =
          esistente.statoRicon === "da_riconciliare" && paidCarta ? "incassato_gateway" : esistente.statoRicon;
        await prisma.ordineShopify.update({
          where: { id: esistente.id },
          data: { ...datiBase, statoRicon: nuovoStato },
        });
        aggiornati++;
      }
    }
    await prisma.negozioShopify.update({ where: { id: neg.id }, data: { ultimaSync: new Date() } });
  }
  revalida();
  const qs = new URLSearchParams({ sync: "ok", nuovi: String(nuovi), agg: String(aggiornati) });
  if (errori.length) qs.set("errori", errori.join(" · "));
  redirect(`/ordini?${qs.toString()}`);
}

// ————— Riconciliazione —————
// Abbina un ordine a bonifico a un movimento bancario.
export async function riconciliaOrdine(ordineId: string, transazioneId: string) {
  await prisma.$transaction([
    prisma.ordineShopify.update({
      where: { id: ordineId },
      data: { statoRicon: "riconciliato", transazioneId, riconciliatoIl: new Date() },
    }),
    prisma.transazioneBancaria.update({
      where: { id: transazioneId },
      data: { stato: "registrata", esito: "ordine Shopify riconciliato" },
    }),
  ]);
  revalida();
}

// Marca un ordine come incassato a mano (contrassegno/altro), senza movimento.
export async function segnaOrdineIncassato(ordineId: string) {
  await prisma.ordineShopify.update({
    where: { id: ordineId },
    data: { statoRicon: "riconciliato", riconciliatoIl: new Date() },
  });
  revalida();
}

export async function ignoraOrdine(ordineId: string) {
  await prisma.ordineShopify.update({ where: { id: ordineId }, data: { statoRicon: "ignorato" } });
  revalida();
}

export async function riapriOrdine(ordineId: string) {
  const o = await prisma.ordineShopify.findUnique({ where: { id: ordineId } });
  await prisma.ordineShopify.update({
    where: { id: ordineId },
    data: { statoRicon: "da_riconciliare", transazioneId: null, riconciliatoIl: null },
  });
  // libera l'eventuale movimento abbinato
  if (o?.transazioneId) {
    await prisma.transazioneBancaria.update({
      where: { id: o.transazioneId },
      data: { stato: "nuova", esito: null },
    }).catch(() => {});
  }
  revalida();
}
