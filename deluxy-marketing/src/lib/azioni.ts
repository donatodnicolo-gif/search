"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { STATI_AZIONE, STATI_CAMPAGNA } from "./dominio";
import { sincronizzaDrive } from "./drive";
import { registra } from "./registro";

// Server action della UI. Le stesse operazioni esistono anche via /api/v1
// (chiave API) per le sessioni Claude: qui c'è la versione per i form.

function testo(fd: FormData, nome: string): string | null {
  const v = fd.get(nome);
  if (typeof v !== "string") return null;
  const pulito = v.trim();
  return pulito === "" ? null : pulito;
}

function dataDa(fd: FormData, nome: string): Date | null {
  const v = testo(fd, nome);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function numeroDa(fd: FormData, nome: string): number | null {
  const v = testo(fd, nome);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return isNaN(n) ? null : n;
}

// ---------- Analisi ----------

export async function creaAnalisi(fd: FormData) {
  const titolo = testo(fd, "titolo");
  const sintesi = testo(fd, "sintesi");
  if (!titolo || !sintesi) return;
  const analisi = await prisma.analisi.create({
    data: {
      titolo,
      sintesi,
      tipo: testo(fd, "tipo") ?? "analisi",
      brand: testo(fd, "brand") ?? "cross",
      canale: testo(fd, "canale"),
      esito: testo(fd, "esito"),
      fileDrive: testo(fd, "fileDrive"),
      dataAnalisi: dataDa(fd, "dataAnalisi") ?? new Date(),
      origine: "manuale",
      note: testo(fd, "note"),
    },
  });
  await registra({ autore: "utente", tipo: "creazione", entita: "analisi", entitaId: analisi.id, titolo: `Analisi depositata: ${titolo}` });
  revalidatePath("/");
  redirect(`/analisi/${analisi.id}`);
}

// ---------- Azioni ----------

export async function creaAzione(fd: FormData) {
  const titolo = testo(fd, "titolo");
  if (!titolo) return;
  const azione = await prisma.azione.create({
    data: {
      titolo,
      descrizione: testo(fd, "descrizione"),
      brand: testo(fd, "brand") ?? "cross",
      canale: testo(fd, "canale"),
      priorita: testo(fd, "priorita") ?? "media",
      owner: testo(fd, "owner") ?? "ai",
      scadenza: dataDa(fd, "scadenza"),
      analisiId: testo(fd, "analisiId"),
      campagnaId: testo(fd, "campagnaId"),
      fileDrive: testo(fd, "fileDrive"),
      eventi: { create: { tipo: "creazione", autore: "utente", testo: "Azione creata dall'app" } },
    },
  });
  await registra({ autore: "utente", tipo: "creazione", entita: "azione", entitaId: azione.id, titolo: `Azione creata: ${titolo}` });
  revalidatePath("/");
  redirect(`/azioni/${azione.id}`);
}

export async function cambiaStatoAzione(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato || !(STATI_AZIONE as readonly string[]).includes(stato)) return;
  const azione = await prisma.azione.findUnique({ where: { id } });
  if (!azione || azione.stato === stato) return;
  await prisma.azione.update({
    where: { id },
    data: {
      stato,
      esito: testo(fd, "esito") ?? azione.esito,
      eventi: { create: { tipo: "stato", da: azione.stato, a: stato, autore: "utente" } },
    },
  });
  await registra({ autore: "utente", tipo: "stato", entita: "azione", entitaId: id, titolo: `Azione "${azione.titolo}": ${azione.stato} → ${stato}` });
  revalidatePath(`/azioni/${id}`);
  revalidatePath("/azioni");
  revalidatePath("/");
}

export async function aggiungiFeedback(fd: FormData) {
  const id = testo(fd, "id");
  const testoFeedback = testo(fd, "testo");
  const tipo = testo(fd, "tipo") === "nota" ? "nota" : "feedback";
  if (!id || !testoFeedback) return;
  await prisma.eventoAzione.create({
    data: { azioneId: id, tipo, testo: testoFeedback, autore: "utente" },
  });
  await registra({ autore: "utente", tipo: "feedback", entita: "azione", entitaId: id, titolo: "Feedback su azione", dettaglio: testoFeedback });
  revalidatePath(`/azioni/${id}`);
}

// ---------- Campagne ----------

export async function creaCampagna(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) return;
  const campagna = await prisma.campagna.create({
    data: {
      nome,
      brand: testo(fd, "brand") ?? "flowers",
      canale: testo(fd, "canale") ?? "google_ads",
      stato: testo(fd, "stato") ?? "attiva",
      obiettivo: testo(fd, "obiettivo"),
      budgetGiornaliero: numeroDa(fd, "budgetGiornaliero"),
      idEsterno: testo(fd, "idEsterno"),
      inizio: dataDa(fd, "inizio"),
      fine: dataDa(fd, "fine"),
      note: testo(fd, "note"),
    },
  });
  await registra({ autore: "utente", tipo: "creazione", entita: "campagna", entitaId: campagna.id, titolo: `Campagna registrata: ${nome}` });
  revalidatePath("/");
  redirect(`/campagne/${campagna.id}`);
}

export async function cambiaStatoCampagna(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato || !(STATI_CAMPAGNA as readonly string[]).includes(stato)) return;
  const prima = await prisma.campagna.findUnique({ where: { id } });
  if (!prima || prima.stato === stato) return;
  const campagna = await prisma.campagna.update({ where: { id }, data: { stato } });
  await registra({ autore: "utente", tipo: "stato", entita: "campagna", entitaId: id, titolo: `Campagna "${campagna.nome}" → ${stato}` });
  // Il cambio deciso nell'app va eseguito davvero sulla piattaforma: si mette
  // in coda un'azione owner AI. Basta dire a una sessione Claude "esegui le
  // azioni in coda dell'app marketing" (GET /api/v1/azioni?aperte=1).
  if (["in_pausa", "attiva", "conclusa"].includes(stato)) {
    const verbo = stato === "in_pausa" ? "mettere in pausa" : stato === "attiva" ? "riattivare" : "concludere";
    await prisma.azione.create({
      data: {
        titolo: `Eseguire su ${campagna.canale === "meta_ads" ? "Meta" : "Google Ads"}: ${verbo} "${campagna.nome}"`,
        descrizione: `Deciso dall'app Marketing il ${new Date().toLocaleDateString("it-IT")}: portare la campagna "${campagna.nome}" (${campagna.brand}) allo stato "${stato}" sulla piattaforma. Al termine chiudere questa azione come fatta con l'esito reale e aggiornare la Mappa 00.4 secondo protocollo.`,
        brand: campagna.brand,
        canale: campagna.canale,
        priorita: "alta",
        owner: "ai",
        campagnaId: campagna.id,
        eventi: { create: { tipo: "creazione", autore: "sistema", testo: "Generata dal cambio stato campagna nell'app" } },
      },
    });
  }
  revalidatePath(`/campagne/${id}`);
  revalidatePath("/campagne");
  revalidatePath("/azioni");
}

export async function aggiungiMetrica(fd: FormData) {
  const campagnaId = testo(fd, "campagnaId");
  const data = dataDa(fd, "data");
  if (!campagnaId || !data) return;
  const valori = {
    spesa: numeroDa(fd, "spesa"),
    impression: numeroDa(fd, "impression"),
    click: numeroDa(fd, "click"),
    conversioni: numeroDa(fd, "conversioni"),
    ricavi: numeroDa(fd, "ricavi"),
  };
  await prisma.metricaCampagna.upsert({
    where: { campagnaId_data: { campagnaId, data } },
    create: { campagnaId, data, ...valori },
    update: valori,
  });
  revalidatePath(`/campagne/${campagnaId}`);
  revalidatePath("/");
}

// ---------- Drive ----------

export async function avviaSyncDrive() {
  const esito = await sincronizzaDrive();
  await registra({
    autore: "utente",
    tipo: "sync",
    entita: "drive",
    titolo: "Sincronizzazione Drive",
    dettaglio: esito.errore ?? `trovati ${esito.trovati} · nuovi ${esito.nuovi} · aggiornati ${esito.aggiornati} · rimossi ${esito.rimossi}`,
  });
  revalidatePath("/drive");
  revalidatePath("/");
}

// ---------- Test Meta ----------

export async function creaTestMeta(fd: FormData) {
  const titolo = testo(fd, "titolo");
  const ipotesi = testo(fd, "ipotesi");
  if (!titolo || !ipotesi) return;
  const test = await prisma.testMeta.create({
    data: {
      titolo,
      ipotesi,
      brand: testo(fd, "brand") ?? "cross",
      fase: testo(fd, "fase"),
      variabile: testo(fd, "variabile"),
      pubblico: testo(fd, "pubblico"),
      formato: testo(fd, "formato"),
      metricaSuccesso: testo(fd, "metricaSuccesso"),
      guardrail: testo(fd, "guardrail"),
      budgetGiornaliero: numeroDa(fd, "budgetGiornaliero"),
      dataInizio: dataDa(fd, "dataInizio"),
      dataVerifica: dataDa(fd, "dataVerifica"),
      stato: testo(fd, "stato") ?? "idea",
      fonte: testo(fd, "fonte"),
      note: testo(fd, "note"),
    },
  });
  const { registra } = await import("./registro");
  await registra({ autore: "utente", tipo: "creazione", entita: "test_meta", entitaId: test.id, titolo: `Nuovo test Meta: ${titolo}` });
  revalidatePath("/meta");
}

export async function cambiaStatoTestMeta(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato) return;
  const test = await prisma.testMeta.update({
    where: { id },
    data: { stato, esito: testo(fd, "esito") ?? undefined, lezione: testo(fd, "lezione") ?? undefined },
  });
  const { registra } = await import("./registro");
  await registra({ autore: "utente", tipo: "stato", entita: "test_meta", entitaId: id, titolo: `Test Meta "${test.titolo}" → ${stato}` });
  revalidatePath("/meta");
}

// ---------- Landing ----------

export async function creaLanding(fd: FormData) {
  const url = testo(fd, "url");
  if (!url) return;
  const landing = await prisma.landingPage.upsert({
    where: { url },
    create: {
      url,
      nome: testo(fd, "nome"),
      brand: testo(fd, "brand") ?? "cross",
      lingua: testo(fd, "lingua"),
      tipo: testo(fd, "tipo"),
      scopo: testo(fd, "scopo"),
      gemellaUrl: testo(fd, "gemellaUrl"),
      stato: testo(fd, "stato") ?? "attiva",
      note: testo(fd, "note"),
    },
    update: {
      nome: testo(fd, "nome"),
      scopo: testo(fd, "scopo"),
      stato: testo(fd, "stato") ?? "attiva",
      note: testo(fd, "note"),
    },
  });
  const { registra } = await import("./registro");
  await registra({ autore: "utente", tipo: "creazione", entita: "landing", entitaId: landing.id, titolo: `Landing registrata: ${url}` });
  revalidatePath("/landing");
  redirect(`/landing/${landing.id}`);
}

export async function cambiaStatoLanding(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato) return;
  const landing = await prisma.landingPage.update({ where: { id }, data: { stato, verificataIl: new Date() } });
  const { registra } = await import("./registro");
  await registra({ autore: "utente", tipo: "stato", entita: "landing", entitaId: id, titolo: `Landing ${landing.url} → ${stato}` });
  revalidatePath(`/landing/${id}`);
  revalidatePath("/landing");
}

export async function aggiungiMetricaLanding(fd: FormData) {
  const landingId = testo(fd, "landingId");
  const periodo = testo(fd, "periodo");
  if (!landingId || !periodo) return;
  const canale = testo(fd, "canale");
  const valori = {
    clic: numeroDa(fd, "clic") != null ? Math.round(numeroDa(fd, "clic")!) : null,
    costo: numeroDa(fd, "costo"),
    sessioni: numeroDa(fd, "sessioni") != null ? Math.round(numeroDa(fd, "sessioni")!) : null,
    conversioni: numeroDa(fd, "conversioni"),
    ricavi: numeroDa(fd, "ricavi"),
    tassoConversione: numeroDa(fd, "tassoConversione"),
    note: testo(fd, "note"),
  };
  await prisma.metricaLanding.upsert({
    where: { landingId_periodo_canale: { landingId, periodo, canale: canale ?? "totale" } },
    create: { landingId, periodo, canale: canale ?? "totale", ...valori },
    update: valori,
  });
  revalidatePath(`/landing/${landingId}`);
}

// ---------- Keywords ----------

// Lo stato si applica a tutte le righe con lo stesso testo (la stessa keyword
// può stare su più campagne: la si governa come una cosa sola).
export async function cambiaStatoKeyword(fd: FormData) {
  const testoKeyword = testo(fd, "keyword");
  const stato = testo(fd, "stato");
  if (!testoKeyword || !stato) return;
  const righe = await prisma.copyAnnuncio.findMany({
    where: { tipo: "keyword", testo: testoKeyword },
    select: { id: true },
  });
  if (righe.length === 0) return;
  await prisma.copyAnnuncio.updateMany({
    where: { id: { in: righe.map((r) => r.id) } },
    data: { stato, notaStato: testo(fd, "notaStato") },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "copy",
    titolo: `Keyword "${testoKeyword}" → ${stato}`,
    dettaglio: righe.length > 1 ? `applicato a ${righe.length} campagne` : null,
  });
  revalidatePath("/keywords");
}
