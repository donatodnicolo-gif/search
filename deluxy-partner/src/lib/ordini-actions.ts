"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { verificaNegozio, tokenDaClientCredentials } from "./shopify";
import { numeroOrdine, causaleContieneNumero, valutaQuota } from "./ordini";
import { quotaFornitore } from "./ordini-config";
import { eseguiSyncOrdini } from "./ordini-sync";
import { registraPagamento, rimuoviPagamento } from "./pagamenti-rif";
import { registra } from "./registro";
import { euro } from "./format";

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

// Trova gli abbinamenti UNIVOCI (un ordine ↔ un movimento) tra ordini e
// movimenti, per numero d'ordine nella causale. Ritorna solo le coppie 1:1 e il
// numero di candidati ambigui scartati.
function abbinamentiUnivoci<O extends { id: string; nome: string }, T extends { id: string }>(
  ordini: O[],
  movimenti: T[],
  causale: (t: T, num: string) => boolean
): { coppie: { o: O; t: T }[]; ambigui: number } {
  const perOrdine = new Map<string, string[]>();
  const perTx = new Map<string, string[]>();
  const raw: { oId: string; tId: string }[] = [];
  for (const o of ordini) {
    const num = numeroOrdine(o.nome);
    if (!num || num.length < 2) continue;
    for (const t of movimenti) {
      if (!causale(t, num)) continue;
      raw.push({ oId: o.id, tId: t.id });
      (perOrdine.get(o.id) ?? perOrdine.set(o.id, []).get(o.id)!).push(t.id);
      (perTx.get(t.id) ?? perTx.set(t.id, []).get(t.id)!).push(o.id);
    }
  }
  const oById = new Map(ordini.map((o) => [o.id, o]));
  const tById = new Map(movimenti.map((t) => [t.id, t]));
  const coppie: { o: O; t: T }[] = [];
  let ambigui = 0;
  const usati = new Set<string>();
  for (const { oId, tId } of raw) {
    if (perOrdine.get(oId)!.length !== 1 || perTx.get(tId)!.length !== 1) { ambigui++; continue; }
    if (usati.has(tId)) continue;
    usati.add(tId);
    coppie.push({ o: oById.get(oId)!, t: tById.get(tId)! });
  }
  return { coppie, ambigui };
}

// ————— Abbinamento automatico per numero in causale —————
// Molti estratti (es. Vivid) riportano il NUMERO dell'ordine nella causale.
// Due abbinamenti, per direzione del movimento (solo match univoci 1:1):
//   • ENTRATA (accredito) → INCASSO del cliente: si riconcilia l'ordine
//     "da_riconciliare"; l'importo deve essere ~ il totale (entro il 5%).
//   • USCITA (addebito) → COSTO al fornitore: si registra `pagatoFornitore`
//     sull'ordine (senza costo). L'importo è di norma ~40% del valore: NON è un
//     motivo di scarto, ma segnaliamo quanti sono fuori dalla quota attesa.
export async function riconciliaPerNumero() {
  const quota = await quotaFornitore();
  const [daRic, senzaCosto, ordiniAbbinati, entrate, uscite] = await Promise.all([
    prisma.ordineShopify.findMany({ where: { statoRicon: "da_riconciliare" } }),
    prisma.ordineShopify.findMany({ where: { pagatoFornitore: null, statoRicon: { not: "ignorato" } } }),
    prisma.ordineShopify.findMany({ where: { transazioneId: { not: null } }, select: { transazioneId: true } }),
    prisma.transazioneBancaria.findMany({ where: { importo: { gt: 0 } }, orderBy: { data: "desc" }, take: 4000 }),
    prisma.transazioneBancaria.findMany({ where: { importo: { lt: 0 } }, orderBy: { data: "desc" }, take: 4000 }),
  ]);
  const giaAbbinati = new Set(ordiniAbbinati.map((o) => o.transazioneId!));

  // ---- INCASSO: accrediti liberi ↔ ordini da riconciliare ----
  const entrateLibere = entrate.filter((t) => !giaAbbinati.has(t.id));
  const inc = abbinamentiUnivoci(daRic, entrateLibere, causaleContieneNumero);
  let riconciliati = 0;
  let importoDiverso = 0;
  for (const { o, t } of inc.coppie) {
    if (Math.abs(t.importo - o.totale) > Math.max(0.5, o.totale * 0.05)) { importoDiverso++; continue; }
    await prisma.$transaction([
      prisma.ordineShopify.update({ where: { id: o.id }, data: { statoRicon: "riconciliato", transazioneId: t.id, riconciliatoIl: new Date() } }),
      prisma.transazioneBancaria.update({ where: { id: t.id }, data: { stato: "registrata", esito: `ordine ${o.nome} riconciliato (n° in causale)` } }),
    ]);
    await registraPagamento({
      tipo: "ordine_shopify", direzione: "in", importo: o.totale, data: t.data,
      origineId: o.id, controparte: o.clienteNome ?? o.brand,
      descrizione: `Ordine ${o.nome} (${o.brand})`, divisa: o.valuta,
    });
    riconciliati++;
  }

  // ---- COSTO FORNITORE: addebiti ↔ ordini senza costo ----
  const cost = abbinamentiUnivoci(senzaCosto, uscite, causaleContieneNumero);
  let costiImpostati = 0;
  let fuoriQuota = 0;
  for (const { o, t } of cost.coppie) {
    const importo = +Math.abs(t.importo).toFixed(2);
    const v = valutaQuota(o.totale, importo, quota);
    if (v.stato !== "in_linea") fuoriQuota++;
    await prisma.ordineShopify.update({
      where: { id: o.id },
      data: { pagatoFornitore: importo, pagatoIl: t.data, fornitoreNome: t.controparte ?? null, transazionePagamentoId: t.id },
    });
    await registraPagamento({
      tipo: "costo_ordine_shopify", direzione: "out", importo, data: t.data,
      origineId: o.id, controparte: t.controparte ?? "fornitore",
      descrizione: `Costo ordine ${o.nome} (${o.brand}) — n° in causale`, divisa: o.valuta,
    });
    costiImpostati++;
  }

  await registra({
    azione: `Abbinamento per numero in causale: ${riconciliati} incassi riconciliati, ${costiImpostati} costi fornitore impostati`,
    categoria: "ordini",
    dettaglio: `incassi: ${importoDiverso} importo diverso, ${inc.ambigui} ambigui · costi: ${fuoriQuota} fuori dal ${quota}%, ${cost.ambigui} ambigui`,
  });
  revalida();
  const qs = new URLSearchParams({
    auto: String(riconciliati), diff: String(importoDiverso), amb: String(inc.ambigui),
    costi: String(costiImpostati), fuori: String(fuoriQuota),
  });
  redirect(`/ordini?${qs.toString()}`);
}

// ————— Costo fornitore (quanto abbiamo PAGATO al fioraio per l'ordine) —————
// È un'uscita: si registra l'importo pagato e, facoltativo, il movimento
// bancario in uscita che lo documenta. Un solo movimento può coprire più ordini
// (settlement periodico col fioraio), perciò l'importo è per-ordine e il
// movimento resta un semplice riferimento (non viene "consumato").
export async function registraPagamentoFornitore(ordineId: string, fd: FormData) {
  const raw = String(fd.get("importo") ?? "").replace(",", ".");
  const importo = parseFloat(raw);
  if (!Number.isFinite(importo) || importo < 0) {
    redirect(`/ordini/${ordineId}?erroreCosto=${encodeURIComponent("Indica l'importo pagato al fornitore.")}`);
  }
  const dataTxt = String(fd.get("data") ?? "").trim();
  const pagatoIl = dataTxt ? new Date(dataTxt + "T00:00:00.000Z") : new Date();
  const fornitoreNome = String(fd.get("fornitore") ?? "").trim() || null;
  const transazionePagamentoId = String(fd.get("movimento") ?? "").trim() || null;
  const o = await prisma.ordineShopify.update({
    where: { id: ordineId },
    data: { pagatoFornitore: +importo.toFixed(2), pagatoIl, fornitoreNome, transazionePagamentoId },
  });
  // riferimento nel registro Pagamenti (uscita) per l'API /api/incassi e i conti
  await registraPagamento({
    tipo: "costo_ordine_shopify",
    direzione: "out",
    importo: +importo.toFixed(2),
    data: pagatoIl,
    origineId: o.id,
    controparte: fornitoreNome ?? "fornitore",
    descrizione: `Costo ordine ${o.nome} (${o.brand})${fornitoreNome ? ` — ${fornitoreNome}` : ""}`,
    divisa: o.valuta,
  });
  await registra({
    azione: `Pagato al fornitore ${euro(importo)} per l'ordine ${o.nome}${fornitoreNome ? ` (${fornitoreNome})` : ""}`,
    categoria: "ordini", entita: "ordine", entitaId: o.id,
  });
  revalida();
  redirect(`/ordini/${ordineId}?costo=ok`);
}

export async function azzeraPagamentoFornitore(ordineId: string) {
  const o = await prisma.ordineShopify.update({
    where: { id: ordineId },
    data: { pagatoFornitore: null, pagatoIl: null, fornitoreNome: null, transazionePagamentoId: null },
  });
  await rimuoviPagamento("costo_ordine_shopify", ordineId);
  await registra({ azione: `Rimosso il costo fornitore dall'ordine ${o.nome}`, categoria: "ordini", entita: "ordine", entitaId: o.id });
  revalida();
  redirect(`/ordini/${ordineId}?costo=rimosso`);
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
