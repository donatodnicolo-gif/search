"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { verificaNegozio, tokenDaClientCredentials } from "./shopify";
import { eseguiAbbinamentoPerNumero } from "./ordini-abbina";
import { eseguiSyncOrdini } from "./ordini-sync";
import { registraPagamento, rimuoviPagamento } from "./pagamenti-rif";
import { registra } from "./registro";
import { euro } from "./format";
import { ibanValido } from "./impostazioni";

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
  // «ok» solo se qualcosa è davvero arrivato: prima un errore del registro
  // mostrava lo stesso il badge verde «Sync completata — 0 nuovi, 0 aggiornati»
  // con l'errore relegato sotto, e sembrava che non ci fosse nulla da scaricare.
  const stato = errori.length && nuovi + aggiornati === 0 ? "ko" : "ok";
  const qs = new URLSearchParams({ sync: stato, nuovi: String(nuovi), agg: String(aggiornati) });
  if (errori.length) qs.set("errori", errori.join(" · "));
  redirect(`/ordini?${qs.toString()}`);
}

// ————— Riconciliazione dal popup —————
export type MovimentoCandidato = {
  id: string; data: string; importo: number; descrizione: string; controparte: string | null;
};

// Cerca accrediti (importo > 0) non ancora abbinati a un ordine, per importo o
// per nome/causale. Usato dal popup «Riconcilia». Termine vuoto = più recenti.
export async function cercaMovimentiIncasso(q: string): Promise<MovimentoCandidato[]> {
  const term = (q ?? "").trim();
  const qNum = parseFloat(term.replace(/[^\d.,-]/g, "").replace(",", "."));
  const abbinati = new Set(
    (await prisma.ordineShopify.findMany({ where: { transazioneId: { not: null } }, select: { transazioneId: true } }))
      .map((o) => o.transazioneId!)
  );
  const movs = await prisma.transazioneBancaria.findMany({
    where: {
      importo: { gt: 0 },
      stato: { not: "registrata" },
      ...(term
        ? {
            OR: [
              { descrizione: { contains: term, mode: "insensitive" } },
              { controparte: { contains: term, mode: "insensitive" } },
              ...(Number.isFinite(qNum) ? [{ importo: { gte: qNum - 0.01, lte: qNum + 0.01 } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { data: "desc" },
    take: 60,
  });
  return movs
    .filter((m) => !abbinati.has(m.id))
    .slice(0, 30)
    .map((m) => ({ id: m.id, data: m.data.toISOString(), importo: m.importo, descrizione: m.descrizione, controparte: m.controparte }));
}

// Abbina dal popup: legge ordine e movimento dal form e riconcilia.
export async function riconciliaDaModale(fd: FormData) {
  const ordineId = String(fd.get("ordineId") ?? "");
  const transazioneId = String(fd.get("transazioneId") ?? "");
  if (ordineId && transazioneId) await riconciliaOrdine(ordineId, transazioneId);
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

// ————— Abbinamento automatico per numero in causale (dal pulsante) —————
// La logica vive in `ordini-abbina.ts` (riusata anche in automatico dopo la sync
// ordini e l'import transazioni). Priorità all'ID ordine in causale, non
// all'importo (per il costo fornitore è ~40%, diverso dal totale).
export async function riconciliaPerNumero() {
  const e = await eseguiAbbinamentoPerNumero();
  await registra({
    azione: `Abbinamento per numero in causale: ${e.incassi} incassi riconciliati, ${e.costi} costi fornitore impostati`,
    categoria: "ordini",
    dettaglio: `incassi: ${e.incassiImportoDiverso} importo diverso · costi: ${e.costiFuoriQuota} fuori quota · ${e.ambigui} ambigui`,
  });
  revalida();
  const qs = new URLSearchParams({
    auto: String(e.incassi), diff: String(e.incassiImportoDiverso), amb: String(e.ambigui),
    costi: String(e.costi), fuori: String(e.costiFuoriQuota), impl: String(e.costiImplausibili),
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

// ————— Richiesta di pagamento al fornitore per un ordine —————
// Prepara la richiesta: importo + come pagarlo (IBAN/beneficiario, oppure un
// link di pagamento, oppure una nota). Non muove denaro: predispone soltanto.
export async function creaRichiestaPagamento(ordineId: string, fd: FormData) {
  const err = (m: string) => redirect(`/ordini/${ordineId}?erroreRich=${encodeURIComponent(m)}`);
  const importo = parseFloat(String(fd.get("importo") ?? "").replace(",", "."));
  if (!Number.isFinite(importo) || importo <= 0) err("Indica l'importo da richiedere.");
  const iban = String(fd.get("iban") ?? "").replace(/\s/g, "").toUpperCase() || null;
  const link = String(fd.get("linkPagamento") ?? "").trim() || null;
  const beneficiario = String(fd.get("beneficiario") ?? "").trim() || null;
  const note = String(fd.get("note") ?? "").trim() || null;
  if (!iban && !link && !note) err("Serve almeno un IBAN, un link di pagamento o una nota su come pagare.");
  if (iban && !ibanValido(iban)) err("IBAN non valido: ricontrolla.");
  const r = await prisma.richiestaPagamentoOrdine.create({
    data: {
      ordineId, importo: +importo.toFixed(2), beneficiario, iban,
      bic: String(fd.get("bic") ?? "").replace(/\s/g, "").toUpperCase() || null,
      linkPagamento: link, note,
    },
  });
  const o = await prisma.ordineShopify.findUnique({ where: { id: ordineId }, select: { nome: true } });
  await registra({
    azione: `Richiesta di pagamento ${euro(importo)} per l'ordine ${o?.nome ?? ""}${beneficiario ? ` a ${beneficiario}` : ""}`,
    categoria: "ordini", entita: "ordine", entitaId: ordineId,
  });
  revalida();
  redirect(`/ordini/${ordineId}?rich=creata#richiesta-${r.id}`);
}

// Segna pagata una richiesta: diventa il COSTO fornitore dell'ordine.
export async function segnaRichiestaPagata(id: string, ordineId: string) {
  const r = await prisma.richiestaPagamentoOrdine.update({
    where: { id }, data: { stato: "pagato", pagatoIl: new Date() },
  });
  const o = await prisma.ordineShopify.findUnique({ where: { id: ordineId }, select: { nome: true, brand: true, valuta: true, pagatoFornitore: true } });
  // imposta il costo fornitore solo se non c'è già
  if (o && o.pagatoFornitore == null) {
    await prisma.ordineShopify.update({
      where: { id: ordineId },
      data: { pagatoFornitore: r.importo, pagatoIl: r.pagatoIl, fornitoreNome: r.beneficiario },
    });
    await registraPagamento({
      tipo: "costo_ordine_shopify", direzione: "out", importo: r.importo, data: r.pagatoIl ?? new Date(),
      origineId: ordineId, controparte: r.beneficiario ?? "fornitore",
      descrizione: `Costo ordine ${o.nome} (${o.brand}) — richiesta pagata`, divisa: o.valuta,
    });
  }
  await registra({ azione: `Richiesta di pagamento segnata pagata (ordine ${o?.nome ?? ""})`, categoria: "ordini", entita: "ordine", entitaId: ordineId });
  revalida();
  redirect(`/ordini/${ordineId}?rich=pagata`);
}

export async function annullaRichiestaPagamento(id: string, ordineId: string) {
  await prisma.richiestaPagamentoOrdine.update({ where: { id }, data: { stato: "annullato" } });
  revalida();
  redirect(`/ordini/${ordineId}?rich=annullata`);
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
