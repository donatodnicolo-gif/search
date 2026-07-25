"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { verificaNegozio, tokenDaClientCredentials } from "./shopify";
import { eseguiSyncOrdini } from "./ordini-sync";
import { registraPagamento, rimuoviPagamento } from "./pagamenti-rif";

function revalida() {
  revalidatePath("/ordini", "layout");
  revalidatePath("/impostazioni", "layout");
}

// ————— Negozi Shopify (configurazione) —————
// Due modi di autenticare un negozio, in alternativa:
//   A) Token Admin statico (shpat_…): incollato a mano.
//   B) Client ID + Client Secret di un'app della Dev Dashboard: l'app conia da
//      sé il token (client credentials grant) e lo rinnova ogni 24h.
export async function salvaNegozioShopify(fd: FormData) {
  const err = (m: string) => redirect("/impostazioni?errore=" + encodeURIComponent(m));
  const brand = String(fd.get("brand") ?? "").trim();
  const dominio = String(fd.get("dominio") ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const token = String(fd.get("token") ?? "").trim();
  const clientId = String(fd.get("clientId") ?? "").trim();
  const clientSecret = String(fd.get("clientSecret") ?? "").trim();
  if (!brand || !dominio) err("Brand e dominio del negozio sono obbligatori.");

  const esistente = await prisma.negozioShopify.findUnique({ where: { brand } });

  // Opzione B: se sono forniti Client ID + Secret, prova subito a coniare un
  // token — così verifichiamo le credenziali e salviamo un primo token valido.
  if (clientId && clientSecret) {
    let coniato: { token: string; expiresIn: number };
    try {
      coniato = await tokenDaClientCredentials(dominio, clientId, clientSecret);
    } catch (e) {
      err(`Negozio ${dominio}: Client ID/Secret non validi — ${(e as Error).message}`);
      return;
    }
    const v = await verificaNegozio(dominio, coniato.token);
    if (!v.ok) err(`Negozio ${dominio}: il token coniato non legge — ${v.messaggio}`);
    await prisma.negozioShopify.upsert({
      where: { brand },
      create: { brand, dominio, clientId, clientSecret, token: coniato.token, tokenScadeIl: new Date(Date.now() + Math.max(60, coniato.expiresIn - 300) * 1000), attivo: true },
      update: { dominio, clientId, clientSecret, token: coniato.token, tokenScadeIl: new Date(Date.now() + Math.max(60, coniato.expiresIn - 300) * 1000), attivo: true },
    });
    revalida();
    redirect("/impostazioni?salvato=shopify");
  }

  // Opzione A: token statico (verificato prima di salvarlo, se fornito).
  if (token) {
    const v = await verificaNegozio(dominio, token);
    if (!v.ok) err(`Negozio ${dominio}: ${v.messaggio}`);
    // passando a un token statico si abbandona l'eventuale grant precedente
    await prisma.negozioShopify.upsert({
      where: { brand },
      create: { brand, dominio, token, attivo: true },
      update: { dominio, token, clientId: null, clientSecret: null, tokenScadeIl: null, attivo: true },
    });
    revalida();
    redirect("/impostazioni?salvato=shopify");
  }

  // Nessuna credenziale nuova: salva/aggiorna solo dominio e brand.
  await prisma.negozioShopify.upsert({
    where: { brand },
    create: { brand, dominio, token: "", attivo: true },
    update: { dominio, attivo: true },
  });
  const senzaAuth = !esistente?.token && !esistente?.clientId;
  if (senzaAuth) {
    err(`Negozio ${dominio} salvato ma senza credenziali: aggiungi un token Admin oppure Client ID + Secret per scaricare gli ordini.`);
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
  const { nuovi, aggiornati, errori } = await eseguiSyncOrdini(giorni);
  revalida();
  const qs = new URLSearchParams({ sync: "ok", nuovi: String(nuovi), agg: String(aggiornati) });
  if (errori.length) qs.set("errori", errori.join(" · "));
  redirect(`/ordini?${qs.toString()}`);
}

// ————— Riconciliazione —————
// Abbina un ordine a bonifico a un movimento bancario.
export async function riconciliaOrdine(ordineId: string, transazioneId: string) {
  const [ordine] = await prisma.$transaction([
    prisma.ordineShopify.update({
      where: { id: ordineId },
      data: { statoRicon: "riconciliato", transazioneId, riconciliatoIl: new Date() },
    }),
    prisma.transazioneBancaria.update({
      where: { id: transazioneId },
      data: { stato: "registrata", esito: "ordine Shopify riconciliato" },
    }),
  ]);
  await registraPagamento({
    tipo: "ordine_shopify",
    direzione: "in",
    importo: ordine.totale,
    data: ordine.riconciliatoIl ?? new Date(),
    origineId: ordine.id,
    controparte: ordine.clienteNome ?? ordine.brand,
    descrizione: `Ordine ${ordine.nome} (${ordine.brand})`,
    divisa: ordine.valuta,
  });
  revalida();
}

// Marca un ordine come incassato a mano (contrassegno/altro), senza movimento.
export async function segnaOrdineIncassato(ordineId: string) {
  const ordine = await prisma.ordineShopify.update({
    where: { id: ordineId },
    data: { statoRicon: "riconciliato", riconciliatoIl: new Date() },
  });
  await registraPagamento({
    tipo: "ordine_shopify",
    direzione: "in",
    importo: ordine.totale,
    data: ordine.riconciliatoIl ?? new Date(),
    origineId: ordine.id,
    controparte: ordine.clienteNome ?? ordine.brand,
    descrizione: `Ordine ${ordine.nome} (${ordine.brand})`,
    divisa: ordine.valuta,
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
  await rimuoviPagamento("ordine_shopify", ordineId);
  revalida();
}
