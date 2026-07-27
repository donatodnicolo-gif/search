"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { STATI_AZIONE, STATI_AZIONE_APERTI, STATI_CAMPAGNA } from "./dominio";
import { CHIAVE_APIKEY, CHIAVE_CARTELLA, idCartellaDrive, sincronizzaDrive } from "./drive";
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
  revalidatePath("/analisi");
  revalidatePath("/audit");
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

// ---------- Pubblici ----------

export async function salvaPubblico(fd: FormData) {
  const nome = testo(fd, "nome");
  const piattaforma = testo(fd, "piattaforma") ?? "meta";
  if (!nome) return;
  const dimensione = numeroDa(fd, "dimensione");
  const dati = {
    brand: testo(fd, "brand") ?? "cross",
    tipo: testo(fd, "tipo") ?? "cliente",
    dimensione: dimensione != null ? Math.round(dimensione) : null,
    stato: testo(fd, "stato") ?? "da_verificare",
    note: testo(fd, "note"),
    verificatoIl: new Date(),
  };
  const pubblico = await prisma.pubblico.upsert({
    where: { nome_piattaforma: { nome, piattaforma } },
    create: { nome, piattaforma, ...dati },
    update: dati,
  });
  // La dimensione entra anche nello storico: i pool si consumano nel tempo.
  if (dati.dimensione != null) {
    const giorno = new Date();
    giorno.setUTCHours(0, 0, 0, 0);
    await prisma.misuraPubblico.upsert({
      where: { pubblicoId_data: { pubblicoId: pubblico.id, data: giorno } },
      create: { pubblicoId: pubblico.id, data: giorno, dimensione: dati.dimensione },
      update: { dimensione: dati.dimensione },
    });
  }
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "pubblico",
    entitaId: pubblico.id,
    titolo: `Pubblico salvato: ${nome} (${piattaforma})`,
  });
  revalidatePath("/pubblici");
}

export async function cambiaStatoPubblico(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato) return;
  const pubblico = await prisma.pubblico.update({
    where: { id },
    data: { stato, verificatoIl: new Date() },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "pubblico",
    entitaId: id,
    titolo: `Pubblico "${pubblico.nome}" → ${stato}`,
  });
  revalidatePath("/pubblici");
}

// ---------- Impostazioni ----------

export async function salvaCartellaDrive(fd: FormData) {
  const cartella = testo(fd, "cartella");
  if (!cartella) return;
  await prisma.impostazione.upsert({
    where: { chiave: CHIAVE_CARTELLA },
    create: { chiave: CHIAVE_CARTELLA, valore: cartella },
    update: { valore: cartella },
  });
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "drive",
    titolo: "Cartella Drive cambiata",
    dettaglio: cartella,
  });
  revalidatePath("/impostazioni");
  revalidatePath("/drive");
  redirect("/impostazioni?salvato=cartella");
}

export async function salvaApiKeyDrive(fd: FormData) {
  const chiaveApi = testo(fd, "apikey");
  await prisma.impostazione.upsert({
    where: { chiave: CHIAVE_APIKEY },
    create: { chiave: CHIAVE_APIKEY, valore: chiaveApi ?? "" },
    update: { valore: chiaveApi ?? "" },
  });
  await registra({ autore: "utente", tipo: "modifica", entita: "drive", titolo: "Chiave API Google Drive aggiornata" });
  redirect("/impostazioni?salvato=apikey");
}

// ---------- Account pubblicitari ----------

export async function salvaAccount(fd: FormData) {
  const nome = testo(fd, "nome");
  const idEsterno = testo(fd, "idEsterno");
  const piattaforma = testo(fd, "piattaforma") ?? "google_ads";
  if (!nome || !idEsterno) return;
  const dati = {
    nome,
    brand: testo(fd, "brand") ?? "cross",
    attivo: fd.get("attivo") !== "no",
    note: testo(fd, "note"),
  };
  const account = await prisma.accountAdv.upsert({
    where: { piattaforma_idEsterno: { piattaforma, idEsterno } },
    create: { piattaforma, idEsterno, ...dati },
    update: dati,
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "account",
    entitaId: account.id,
    titolo: `Account collegato: ${nome} (${idEsterno})`,
  });
  revalidatePath("/impostazioni");
  redirect("/impostazioni?salvato=account");
}

export async function rimuoviAccount(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const account = await prisma.accountAdv.findUnique({ where: { id } });
  if (!account) return;
  await prisma.accountAdv.delete({ where: { id } });
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "account",
    titolo: `Account rimosso: ${account.nome} (${account.idEsterno})`,
  });
  revalidatePath("/impostazioni");
}

export async function attivaAccount(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const account = await prisma.accountAdv.findUnique({ where: { id } });
  if (!account) return;
  await prisma.accountAdv.update({ where: { id }, data: { attivo: !account.attivo } });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "account",
    entitaId: id,
    titolo: `Account "${account.nome}" → ${account.attivo ? "disattivato" : "attivo"}`,
  });
  revalidatePath("/impostazioni");
}

// ---------- Change control: modifiche alle campagne (doc 11) ----------

export async function registraModifica(fd: FormData) {
  const campagnaId = testo(fd, "campagnaId");
  const descrizione = testo(fd, "descrizione");
  if (!campagnaId || !descrizione) return;
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    include: { modifiche: { orderBy: { eseguitaIl: "desc" }, take: 1 } },
  });
  if (!campagna) return;

  const livello = testo(fd, "livello") ?? "L1";
  const deltaBudgetPct = numeroDa(fd, "deltaBudgetPct");
  const rollbackPiano = testo(fd, "rollbackPiano");
  const { validaModifica } = await import("./guardrail");
  const esito = validaModifica({
    classe: campagna.classe,
    livello,
    deltaBudgetPct,
    rollbackPiano,
    ultimaModifica: campagna.modifiche[0]?.eseguitaIl ?? null,
  });
  if (esito.blocchi.length > 0) {
    // Bloccata: si registra il tentativo nello storico e si torna con l'errore.
    await registra({
      autore: "utente", tipo: "modifica", entita: "campagna", entitaId: campagnaId,
      titolo: `Modifica BLOCCATA dal change control su "${campagna.nome}"`,
      dettaglio: esito.blocchi.join(" · "),
    });
    redirect(`/campagne/${campagnaId}?bloccata=${encodeURIComponent(esito.blocchi[0])}`);
  }

  await prisma.modifica.create({
    data: {
      campagnaId, livello, descrizione,
      prima: testo(fd, "prima"), dopo: testo(fd, "dopo"),
      deltaBudgetPct, rollbackPiano,
    },
  });
  // Verifiche obbligatorie post-modifica a +24h e +72h (doc 11 §3.5)
  for (const ore of [24, 72]) {
    await prisma.azione.create({
      data: {
        titolo: `Verifica +${ore}h dopo "${descrizione}" su ${campagna.nome}`,
        brand: campagna.brand,
        canale: campagna.canale,
        priorita: ore === 24 ? "alta" : "media",
        owner: "utente",
        scadenza: new Date(Date.now() + ore * 3600_000),
        campagnaId,
        eventi: { create: { tipo: "creazione", autore: "sistema", testo: `Promemoria generato dal change control (verifica a +${ore}h)` } },
      },
    });
  }
  await registra({
    autore: "utente", tipo: "modifica", entita: "campagna", entitaId: campagnaId,
    titolo: `Modifica ${livello} su "${campagna.nome}": ${descrizione}`,
    dettaglio: esito.avvisi.join(" · ") || null,
  });
  revalidatePath(`/campagne/${campagnaId}`);
  redirect(`/campagne/${campagnaId}?salvata=modifica`);
}

export async function cambiaClasseCampagna(fd: FormData) {
  const id = testo(fd, "id");
  const classe = testo(fd, "classe");
  if (!id || !classe) return;
  const campagna = await prisma.campagna.update({ where: { id }, data: { classe } });
  await registra({ autore: "utente", tipo: "stato", entita: "campagna", entitaId: id, titolo: `Campagna "${campagna.nome}" → classe ${classe}` });
  revalidatePath(`/campagne/${id}`);
  revalidatePath("/campagne");
}

// ---------- Storico errori ERR-* (00.5) ----------

export async function creaIncidente(fd: FormData) {
  const titolo = testo(fd, "titolo");
  if (!titolo) return;
  const anno = new Date().getFullYear();
  const conteggio = await prisma.incidente.count({ where: { codice: { startsWith: `ERR-${anno}` } } });
  const codice = `ERR-${anno}-${String(conteggio + 1).padStart(3, "0")}`;
  const incidente = await prisma.incidente.create({
    data: {
      codice, titolo,
      contesto: testo(fd, "contesto"),
      timeline: testo(fd, "timeline"),
      impatto: testo(fd, "impatto"),
      cause: testo(fd, "cause"),
      erroriProcesso: testo(fd, "erroriProcesso"),
      rimedi: testo(fd, "rimedi"),
      oggetti: testo(fd, "oggetti"),
      campagnaId: testo(fd, "campagnaId"),
    },
  });
  await registra({ autore: "utente", tipo: "creazione", entita: "incidente", entitaId: incidente.id, titolo: `${codice} aperto: ${titolo}` });
  revalidatePath("/errori");
  redirect("/errori");
}

export async function chiudiIncidente(fd: FormData) {
  const id = testo(fd, "id");
  const verdetto = testo(fd, "verdetto");
  if (!id) return;
  const incidente = await prisma.incidente.update({
    where: { id },
    data: { stato: "chiuso", verdetto, chiusoIl: new Date() },
  });
  await registra({ autore: "utente", tipo: "stato", entita: "incidente", entitaId: id, titolo: `${incidente.codice} chiuso`, dettaglio: verdetto });
  revalidatePath("/errori");
}

// ---------- Memoria condivisa (00.3): append-only ----------

export async function aggiungiMemoria(fd: FormData) {
  const testoVoce = testo(fd, "testo");
  if (!testoVoce) return;
  const voce = await prisma.memoriaVoce.create({
    data: {
      testo: testoVoce,
      sezione: testo(fd, "sezione") ?? "metodo",
      brand: testo(fd, "brand"),
      autore: testo(fd, "autore") ?? "utente",
      superaId: testo(fd, "superaId"),
    },
  });
  // Se supera una voce, quella passa in Storico (mai cancellata).
  if (voce.superaId) {
    await prisma.memoriaVoce.update({ where: { id: voce.superaId }, data: { stato: "storico" } }).catch(() => {});
  }
  await registra({ autore: "utente", tipo: "creazione", entita: "memoria", entitaId: voce.id, titolo: "Nuova lezione in memoria condivisa", dettaglio: testoVoce.slice(0, 140) });
  revalidatePath("/memoria");
}

export async function consolidaMemoria(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato) return;
  await prisma.memoriaVoce.update({ where: { id }, data: { stato } });
  revalidatePath("/memoria");
}

// ---------- Incongruenze documenti <-> realtà ----------

export async function creaIncongruenza(fd: FormData) {
  const documento = testo(fd, "documento");
  const dice = testo(fd, "dice");
  const risulta = testo(fd, "risulta");
  if (!documento || !dice || !risulta) return;
  const voce = await prisma.incongruenza.create({
    data: {
      documento, dice, risulta,
      evidenza: testo(fd, "evidenza"),
      azioneConsigliata: testo(fd, "azioneConsigliata"),
      priorita: testo(fd, "priorita") ?? "P1",
    },
  });
  await registra({ autore: "utente", tipo: "creazione", entita: "incongruenza", entitaId: voce.id, titolo: `Incongruenza ${voce.priorita} su ${documento}` });
  revalidatePath("/incongruenze");
}

export async function verdettoIncongruenza(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato) return;
  const voce = await prisma.incongruenza.update({ where: { id }, data: { stato, verdettoIl: new Date() } });
  // Verdetto VERA o PARZIALE: azione di correzione nel kanban (dal modello Incongruenze)
  if (stato === "vera" || stato === "parziale") {
    await prisma.azione.create({
      data: {
        titolo: `Correggere ${voce.documento} (incongruenza ${stato === "vera" ? "verificata" : "parziale"})`,
        descrizione: `Il documento dice: ${voce.dice}\nLa realtà: ${voce.risulta}${voce.azioneConsigliata ? `\nAzione consigliata: ${voce.azioneConsigliata}` : ""}`,
        brand: "cross",
        priorita: voce.priorita === "P0" ? "alta" : "media",
        owner: "ai",
        eventi: { create: { tipo: "creazione", autore: "sistema", testo: "Generata dal verdetto sull'incongruenza" } },
      },
    });
  }
  await registra({ autore: "utente", tipo: "stato", entita: "incongruenza", entitaId: id, titolo: `Incongruenza su ${voce.documento} → ${stato}` });
  revalidatePath("/incongruenze");
}

// ---------- Cadenze ricorrenti ----------

export async function spuntaOccorrenza(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  await prisma.cadenzaOccorrenza.update({
    where: { id },
    data: { eseguitaIl: new Date(), esito: testo(fd, "esito") },
  });
  revalidatePath("/cadenze");
}

// ---------- Chiusura a doppio stato (00.3) ----------

export async function chiudiAzioneConPaperTrail(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const azione = await prisma.azione.findUnique({ where: { id } });
  if (!azione) return;
  await prisma.azione.update({
    where: { id },
    data: {
      stato: "fatta",
      fattoIl: new Date(),
      prima: testo(fd, "prima"),
      dopo: testo(fd, "dopo"),
      esito: testo(fd, "esito") ?? azione.esito,
      eventi: { create: { tipo: "stato", da: azione.stato, a: "fatta", autore: "utente", testo: "Chiusa con paper-trail PRIMA/DOPO" } },
    },
  });
  // Completamento diverso da efficacia: nasce la verifica (00.3 regola chiusura azione)
  await prisma.azione.create({
    data: {
      titolo: `Verifica efficacia: ${azione.titolo}`,
      brand: azione.brand,
      canale: azione.canale,
      priorita: "media",
      owner: "utente",
      scadenza: new Date(Date.now() + 72 * 3600_000),
      campagnaId: azione.campagnaId,
      analisiId: azione.analisiId,
      eventi: { create: { tipo: "creazione", autore: "sistema", testo: `Verifica a +72h della chiusura di "${azione.titolo}"` } },
    },
  });
  await registra({ autore: "utente", tipo: "stato", entita: "azione", entitaId: id, titolo: `Azione fatta con paper-trail: ${azione.titolo}` });
  revalidatePath(`/azioni/${id}`);
  revalidatePath("/azioni");
}

export async function esitoVerificaAzione(fd: FormData) {
  const id = testo(fd, "id");
  const esito = testo(fd, "esitoVerifica"); // verificata | riaperta
  if (!id || !esito) return;
  const azione = await prisma.azione.findUnique({ where: { id } });
  if (!azione) return;
  if (esito === "verificata") {
    await prisma.azione.update({
      where: { id },
      data: {
        verificataIl: new Date(),
        esitoVerifica: testo(fd, "nota") ?? "confermata",
        eventi: { create: { tipo: "nota", autore: "utente", testo: "VERIFICATA: efficacia confermata" } },
      },
    });
  } else {
    await prisma.azione.update({
      where: { id },
      data: {
        stato: "in_corso",
        riaperture: azione.riaperture + 1,
        esitoVerifica: testo(fd, "nota") ?? "non confermata",
        eventi: { create: { tipo: "stato", da: "fatta", a: "in_corso", autore: "utente", testo: `RIAPERTA (${azione.riaperture + 1}ª volta): efficacia non confermata` } },
      },
    });
  }
  await registra({ autore: "utente", tipo: "stato", entita: "azione", entitaId: id, titolo: `Verifica azione "${azione.titolo}": ${esito}` });
  revalidatePath(`/azioni/${id}`);
  revalidatePath("/azioni");
}

// ---------- Creativi Meta (rotazione, doc 8.3) ----------

export async function salvaCreativo(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) return;
  await prisma.creativo.create({
    data: {
      nome,
      brand: testo(fd, "brand") ?? "cross",
      fase: testo(fd, "fase") ?? "A",
      stato: testo(fd, "stato") ?? "in_coda",
      lanciatoIl: dataDa(fd, "lanciatoIl"),
      note: testo(fd, "note"),
    },
  });
  revalidatePath("/meta");
}

export async function cambiaStatoCreativo(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato) return;
  const dati: { stato: string; lanciatoIl?: Date } = { stato };
  if (stato === "attivo") dati.lanciatoIl = new Date();
  await prisma.creativo.update({ where: { id }, data: dati });
  revalidatePath("/meta");
}

// ---------- Occasioni (doc 8.2 §3.1) ----------

export async function creaOccasione(fd: FormData) {
  const nome = testo(fd, "nome");
  const data = dataDa(fd, "data");
  if (!nome || !data) return;
  const occasione = await prisma.occasione.create({
    data: { nome, data, brand: testo(fd, "brand") ?? "cross", note: testo(fd, "note") },
  });
  // Task automatici: T-21 e T-14 preparazione, T+7 ripristino (doc 8.2 §3.1)
  const compiti = [
    { giorni: -21, titolo: `T-21 ${nome}: alzare budget fase A e brief creativi d'occasione`, descrizione: "Doc 8.2 §3.1: alzare il budget A 2-3 settimane prima, così i pool I/D/X sono pieni quando il picco arriva. Doc 8.3: creativi d'occasione pronti 2-3 settimane prima." },
    { giorni: -14, titolo: `T-14 ${nome}: accorciare le finestre calde (VC/ATC 30-14g, engagers 365-30/60g)`, descrizione: "Doc 8.2 §3.1. Niente nuovi tCPA in finestra di picco (doc 4 §2.2)." },
    { giorni: 7, titolo: `T+7 ${nome}: ripristinare le finestre standard dei pubblici`, descrizione: "Doc 8.2 §3.1: dopo il picco riportare le finestre calde ai valori standard." },
  ];
  for (const c of compiti) {
    await prisma.azione.create({
      data: {
        titolo: c.titolo,
        descrizione: c.descrizione,
        brand: occasione.brand,
        canale: "meta_ads",
        priorita: "alta",
        owner: "ai",
        scadenza: new Date(data.getTime() + c.giorni * 86_400_000),
        eventi: { create: { tipo: "creazione", autore: "sistema", testo: `Generata dall'occasione "${nome}" (${data.toLocaleDateString("it-IT")})` } },
      },
    });
  }
  await registra({ autore: "utente", tipo: "creazione", entita: "occasione", entitaId: occasione.id, titolo: `Occasione "${nome}" con 3 task automatici (T-21, T-14, T+7)` });
  revalidatePath("/occasioni");
}

// ---------- Scorecard landing (doc 9.2 §10) ----------

export async function salvaScorecardLanding(fd: FormData) {
  const landingId = testo(fd, "landingId");
  if (!landingId) return;
  const { CRITERI_LANDING, votoLanding } = await import("./copy-lint");
  const criteri: Record<string, number> = {};
  for (const c of CRITERI_LANDING) {
    criteri[c.chiave] = Math.max(0, Math.min(5, numeroDa(fd, c.chiave) ?? 0));
  }
  const { voto, fascia } = votoLanding(criteri);
  await prisma.landingScorecard.create({
    data: { landingId, criteri: JSON.stringify(criteri), voto, fascia, note: testo(fd, "note") },
  });
  await prisma.landingPage.update({ where: { id: landingId }, data: { scorecard: voto, verificataIl: new Date() } });
  await registra({ autore: "utente", tipo: "modifica", entita: "landing", entitaId: landingId, titolo: "Scorecard landing compilata", dettaglio: "voto " + voto + "/100 (" + fascia + ")" });
  revalidatePath("/landing/" + landingId);
}

// ---------- Coda operazioni verso le piattaforme ----------

export async function approvaOperazione(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.update({
    where: { id },
    data: { stato: "approvata", approvataIl: new Date(), approvataDa: "utente" },
  });
  await registra({
    autore: "utente", tipo: "stato", entita: "operazione", entitaId: id,
    titolo: `Approvata: ${op.tipo} su ${op.bersaglio}`,
    dettaglio: "Lo script la eseguirà alla prossima passata",
  });
  revalidatePath("/operazioni");
}

export async function annullaOperazione(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.update({ where: { id }, data: { stato: "annullata" } });
  await registra({
    autore: "utente", tipo: "stato", entita: "operazione", entitaId: id,
    titolo: `Annullata: ${op.tipo} su ${op.bersaglio}`,
  });
  revalidatePath("/operazioni");
}

export async function creaOperazione(fd: FormData) {
  const tipo = testo(fd, "tipo");
  const campagnaId = testo(fd, "campagnaId");
  if (!tipo || !campagnaId) return;
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    include: {
      modifiche: { orderBy: { eseguitaIl: "desc" }, take: 1 },
      incidenti: { where: { stato: "aperto" }, select: { codice: true } },
    },
  });
  if (!campagna) return;

  const budget = numeroDa(fd, "budget");
  const deltaPct =
    budget != null && campagna.budgetGiornaliero
      ? ((budget - campagna.budgetGiornaliero) / campagna.budgetGiornaliero) * 100
      : null;
  const livello = testo(fd, "livello") ?? (tipo === "budget" ? "L2" : "L1");

  if (campagna.incidenti.length > 0) {
    redirect(`/campagne/${campagnaId}?bloccata=${encodeURIComponent(`Freeze ${campagna.incidenti[0].codice}: incidente aperto su questa campagna`)}`);
  }
  const { validaModifica, addBeforePause } = await import("./guardrail");
  const esito = validaModifica({
    classe: campagna.classe,
    livello,
    deltaBudgetPct: deltaPct,
    rollbackPiano: testo(fd, "rollbackPiano"),
    ultimaModifica: campagna.modifiche[0]?.eseguitaIl ?? null,
    l2Settimana: numeroDa(fd, "l2Settimana") ?? 0,
  });
  // Add-before-pause (doc 11, da ERR-2026-001): su una traino il vincente non
  // si ferma finche il sostituto non e collaudato.
  const abp = addBeforePause({
    classe: campagna.classe,
    tipo,
    sostitutoApprovatoIl: dataDa(fd, "sostitutoApprovatoIl"),
    sostitutoGiorniDati: numeroDa(fd, "sostitutoGiorniDati"),
  });
  if (abp) esito.blocchi.push(abp);
  if (esito.blocchi.length > 0) {
    redirect(`/campagne/${campagnaId}?bloccata=${encodeURIComponent(esito.blocchi[0])}`);
  }

  const op = await prisma.operazioneAdv.create({
    data: {
      tipo,
      canale: campagna.canale,
      bersaglio: campagna.nome,
      idEsterno: campagna.idEsterno,
      parametri: budget != null ? JSON.stringify({ budget }) : null,
      motivo: testo(fd, "motivo"),
      livello,
      prima:
        tipo === "budget"
          ? `budget ${campagna.budgetGiornaliero ?? "?"} €/g`
          : `stato ${campagna.stato}`,
      campagnaId,
    },
  });
  await registra({
    autore: "utente", tipo: "creazione", entita: "operazione", entitaId: op.id,
    titolo: `In coda (da approvare): ${tipo} su ${campagna.nome}`,
    dettaglio: op.motivo,
  });
  redirect("/operazioni");
}

// ---------- Operazioni keyword (nuova, negativa, pausa, attiva) ----------
// Stessa coda approvata delle operazioni campagna. Livelli dal doc 11:
// negativa puntuale = L0 (libera) · aggiunta keyword = L1 · pausa/attiva = L2.
export async function creaOperazioneKeyword(fd: FormData) {
  const tipo = testo(fd, "tipo");
  const campagnaId = testo(fd, "campagnaId");
  const kwTesto = testo(fd, "testo");
  if (!tipo || !campagnaId || !kwTesto) return;
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    include: {
      modifiche: { orderBy: { eseguitaIl: "desc" }, take: 5 },
      incidenti: { where: { stato: "aperto" }, select: { codice: true } },
    },
  });
  if (!campagna) return;

  const livello = tipo === "negativa" ? "L0" : tipo === "nuova_keyword" ? "L1" : "L2";

  if (campagna.incidenti.length > 0) {
    redirect(`/keywords?bloccata=${encodeURIComponent(`Freeze ${campagna.incidenti[0].codice}: incidente aperto su ${campagna.nome}`)}`);
  }
  if (livello !== "L0") {
    const inizioSettimana = new Date();
    inizioSettimana.setDate(inizioSettimana.getDate() - ((inizioSettimana.getDay() + 6) % 7));
    inizioSettimana.setHours(0, 0, 0, 0);
    const l2Settimana = campagna.modifiche.filter(
      (m) => (m.livello === "L2" || m.livello === "L3") && m.eseguitaIl >= inizioSettimana
    ).length;
    const { validaModifica } = await import("./guardrail");
    const esito = validaModifica({
      classe: campagna.classe,
      livello,
      deltaBudgetPct: null,
      rollbackPiano: testo(fd, "rollbackPiano"),
      ultimaModifica: campagna.modifiche[0]?.eseguitaIl ?? null,
      l2Settimana,
    });
    if (esito.blocchi.length > 0) {
      redirect(`/keywords?bloccata=${encodeURIComponent(esito.blocchi[0])}`);
    }
  }

  const op = await prisma.operazioneAdv.create({
    data: {
      tipo,
      canale: campagna.canale,
      bersaglio: tipo === "pausa_keyword" || tipo === "attiva_keyword" ? kwTesto : campagna.nome,
      idEsterno: tipo === "pausa_keyword" || tipo === "attiva_keyword" ? testo(fd, "idEsternoKeyword") : campagna.idEsterno,
      parametri: JSON.stringify({
        testo: kwTesto,
        corrispondenza: testo(fd, "corrispondenza") ?? "broad",
        gruppo: testo(fd, "gruppo"),
      }),
      motivo: testo(fd, "motivo"),
      livello,
      prima: tipo === "nuova_keyword" || tipo === "negativa" ? "assente" : "attiva",
      campagnaId,
    },
  });
  await registra({
    autore: "utente", tipo: "creazione", entita: "operazione", entitaId: op.id,
    titolo: `In coda (da approvare): ${tipo} "${kwTesto}" su ${campagna.nome}`,
    dettaglio: op.motivo,
  });
  redirect("/operazioni");
}

// ---------- Lancio di una campagna nuova su Google Ads ----------
// La campagna nasce nell'app come "bozza" e sulla piattaforma IN PAUSA (via
// bulk upload dello script, dopo l'approvazione): la checklist 4.1 va passata
// in interfaccia prima di accenderla. Il copy passa dal lint 7.2/7.3: le
// parole vietate per il brand bloccano l'accodamento.
export async function lanciaCampagna(fd: FormData) {
  const nome = testo(fd, "nome");
  const brand = testo(fd, "brand") ?? "gifts";
  const budget = numeroDa(fd, "budget");
  if (!nome || !budget || budget <= 0) {
    redirect(`/campagne/lancia?errore=${encodeURIComponent("Servono almeno nome e budget giornaliero")}`);
  }

  const titoli = (testo(fd, "titoli") ?? "").split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const descrizioni = (testo(fd, "descrizioni") ?? "").split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const finalUrl = testo(fd, "finalUrl");

  // Lint 7.2/7.3 su ogni titolo e descrizione: le violazioni "vietata" bloccano
  const { lintCopy } = await import("./copy-lint");
  const problemi: string[] = [];
  for (const t of [...titoli, ...descrizioni]) {
    for (const v of lintCopy(t, brand)) {
      if (v.tipo === "vietato") {
        problemi.push(`"${v.parola}" in «${t.slice(0, 40)}»: ${v.motivo}${v.sostituzione ? ` → ${v.sostituzione}` : ""}`);
      }
    }
  }
  if (problemi.length > 0) {
    redirect(`/campagne/lancia?errore=${encodeURIComponent(`Copy bloccato dal lint 7.2/7.3 — ${problemi[0]}${problemi.length > 1 ? ` (e altre ${problemi.length - 1})` : ""}`)}`);
  }
  if (titoli.length > 0 && titoli.length < 3) {
    redirect(`/campagne/lancia?errore=${encodeURIComponent("Un annuncio RSA vuole almeno 3 titoli (meglio 8-10)")}`);
  }
  if (titoli.length >= 3 && (descrizioni.length < 2 || !finalUrl)) {
    redirect(`/campagne/lancia?errore=${encodeURIComponent("Con i titoli servono almeno 2 descrizioni e la URL finale")}`);
  }
  const troppoLunghi = titoli.filter((t) => t.length > 30).length + descrizioni.filter((d) => d.length > 90).length;
  if (troppoLunghi > 0) {
    redirect(`/campagne/lancia?errore=${encodeURIComponent("Limiti Google: titoli max 30 caratteri, descrizioni max 90")}`);
  }

  // Keyword: una per riga, "testo | corrispondenza" (broad se omessa)
  const keywords = (testo(fd, "keywords") ?? "")
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [t, m] = r.split("|").map((x) => x.trim());
      return { testo: t, corrispondenza: (m || "broad").toLowerCase() };
    });

  const campagna = await prisma.campagna.create({
    data: {
      nome,
      brand,
      canale: "google_ads",
      stato: "bozza",
      budgetGiornaliero: budget,
      obiettivo: testo(fd, "obiettivo"),
      note: "Creata dall'app: in coda per il lancio su Google Ads (nasce in pausa).",
    },
  });

  const op = await prisma.operazioneAdv.create({
    data: {
      tipo: "nuova_campagna",
      canale: "google_ads",
      bersaglio: nome,
      parametri: JSON.stringify({
        nome,
        budget,
        gruppo: testo(fd, "gruppo") ?? "Gruppo 1",
        keywords,
        titoli,
        descrizioni,
        finalUrl,
        strategia: testo(fd, "strategia"),
      }),
      motivo: testo(fd, "motivo"),
      livello: "L2",
      prima: "assente",
      campagnaId: campagna.id,
    },
  });
  await registra({
    autore: "utente", tipo: "creazione", entita: "operazione", entitaId: op.id,
    titolo: `In coda (da approvare): nuova campagna "${nome}"`,
    dettaglio: `${keywords.length} keyword · ${titoli.length} titoli · ${descrizioni.length} descrizioni · ${budget} €/g`,
  });
  redirect("/operazioni");
}

// ---------- Gruppi di annunci ----------
// Lo stato del gruppo nell'app è una scelta dell'utente (come per le keyword):
// l'import non lo tocca mai, tiene il suo in statoPiattaforma.

export async function cambiaStatoGruppo(fd: FormData) {
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !stato) return;
  const gruppo = await prisma.gruppo.update({
    where: { id },
    data: { stato, ...(testo(fd, "note") ? { note: testo(fd, "note") } : {}) },
    include: { campagna: { select: { nome: true } } },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "gruppo",
    entitaId: gruppo.id,
    titolo: `Gruppo "${gruppo.nome}" → ${stato}`,
    dettaglio: gruppo.campagna.nome,
  });
  revalidatePath(`/gruppi/${id}`);
  revalidatePath("/gruppi");
}

// Pausa/riattivazione di un gruppo SULLA PIATTAFORMA: come per le campagne
// passa dalla coda approvata a mano, con gli stessi guardrail della campagna
// che lo contiene (freeze incidenti, blackout 72h, max 1 L2/L3 a settimana).
export async function creaOperazioneGruppo(fd: FormData) {
  const tipo = testo(fd, "tipo");
  const gruppoId = testo(fd, "gruppoId");
  if (!tipo || !gruppoId) return;
  if (tipo !== "pausa_gruppo" && tipo !== "attiva_gruppo") return;

  const gruppo = await prisma.gruppo.findUnique({
    where: { id: gruppoId },
    include: {
      campagna: {
        include: {
          modifiche: { orderBy: { eseguitaIl: "desc" }, take: 1 },
          incidenti: { where: { stato: "aperto" }, select: { codice: true } },
        },
      },
    },
  });
  if (!gruppo) return;
  const campagna = gruppo.campagna;

  if (campagna.incidenti.length > 0) {
    redirect(
      `/gruppi/${gruppoId}?bloccata=${encodeURIComponent(
        `Freeze ${campagna.incidenti[0].codice}: incidente aperto sulla campagna che contiene questo gruppo`
      )}`
    );
  }

  // Quante L2/L3 sono già state fatte questa settimana sulla campagna: qui si
  // conta dal registro invece di chiederlo all'utente, come nel form campagna.
  const lunedi = new Date();
  lunedi.setHours(0, 0, 0, 0);
  lunedi.setDate(lunedi.getDate() - ((lunedi.getDay() + 6) % 7));
  const l2Settimana = await prisma.modifica.count({
    where: {
      campagnaId: campagna.id,
      livello: { in: ["L2", "L3"] },
      eseguitaIl: { gte: lunedi },
    },
  });

  const { validaModifica } = await import("./guardrail");
  const esito = validaModifica({
    classe: campagna.classe,
    livello: "L2", // fermare o riaccendere un gruppo sposta traffico: mai L1
    deltaBudgetPct: null,
    rollbackPiano: testo(fd, "rollbackPiano"),
    ultimaModifica: campagna.modifiche[0]?.eseguitaIl ?? null,
    l2Settimana,
  });
  if (esito.blocchi.length > 0) {
    redirect(`/gruppi/${gruppoId}?bloccata=${encodeURIComponent(esito.blocchi[0])}`);
  }

  const op = await prisma.operazioneAdv.create({
    data: {
      tipo,
      canale: gruppo.canale,
      bersaglio: gruppo.nome,
      idEsterno: gruppo.idEsterno,
      parametri: JSON.stringify({ gruppo: gruppo.nome, campagna: campagna.nome }),
      motivo: testo(fd, "motivo"),
      livello: "L2",
      prima: `stato su Google: ${gruppo.statoPiattaforma ?? "sconosciuto"}`,
      campagnaId: campagna.id,
      gruppoId: gruppo.id,
    },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    entitaId: op.id,
    titolo: `In coda (da approvare): ${tipo} su "${gruppo.nome}" (${campagna.nome})`,
    dettaglio: op.motivo,
  });
  redirect("/operazioni");
}

// ---------- Da opportunità ad azione ----------
// La lista delle prossime azioni della scheda campagna non è un elenco da
// leggere: ogni voce diventa un'azione vera del kanban, con dentro il numero
// che l'ha fatta nascere. Così resta la storia di perché era stata proposta.
export async function creaAzioneDaOpportunita(fd: FormData) {
  const campagnaId = testo(fd, "campagnaId");
  const titolo = testo(fd, "titolo");
  if (!campagnaId || !titolo) return;
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    select: { brand: true, canale: true, nome: true },
  });
  if (!campagna) return;

  // Se è già in lista non se ne crea un'altra: la scheda la ripropone a ogni
  // visita finché il numero non cambia.
  const gia = await prisma.azione.findFirst({
    where: { campagnaId, titolo, stato: { in: STATI_AZIONE_APERTI } },
    select: { id: true },
  });
  if (gia) redirect(`/azioni/${gia.id}`);

  const priorita = testo(fd, "priorita") ?? "media";
  const azione = await prisma.azione.create({
    data: {
      titolo,
      descrizione: testo(fd, "perche"),
      brand: campagna.brand,
      canale: campagna.canale,
      priorita,
      owner: "utente",
      scadenza: new Date(Date.now() + (priorita === "alta" ? 2 : 7) * 86_400_000),
      campagnaId,
      eventi: {
        create: {
          tipo: "creazione",
          autore: "sistema",
          testo: `Nata dalla lista "prossime azioni" della scheda campagna${testo(fd, "chiave") ? ` (${testo(fd, "chiave")})` : ""}`,
        },
      },
    },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "azione",
    entitaId: azione.id,
    titolo: `Azione dalla scheda campagna: ${titolo}`,
    dettaglio: campagna.nome,
  });
  redirect(`/azioni/${azione.id}`);
}

// ---------- Termini di ricerca ----------
// Un termine è quello che la gente ha digitato: non si "modifica", si giudica.
// "Pertinente" resta una nota nell'app; "escludi" mette in coda una negativa
// vera sulla campagna — che, come tutto il resto, va approvata a mano.
export async function giudicaTermine(fd: FormData) {
  const id = testo(fd, "id");
  const scelta = testo(fd, "scelta");
  if (!id || !scelta) return;
  const termine = await prisma.termineRicerca.findUnique({
    where: { id },
    include: { campagna: { select: { id: true, nome: true, canale: true, classe: true, incidenti: { where: { stato: "aperto" }, select: { codice: true } } } } },
  });
  if (!termine) return;

  if (scelta === "pertinente") {
    await prisma.termineRicerca.update({ where: { id }, data: { stato: "pertinente" } });
    revalidatePath(`/campagne/${termine.campagna.id}`);
    return;
  }

  // Escludi: la negativa passa dalla coda approvata come ogni scrittura.
  if (termine.campagna.incidenti.length > 0) {
    redirect(`/campagne/${termine.campagna.id}?bloccata=${encodeURIComponent(`Freeze ${termine.campagna.incidenti[0].codice}: incidente aperto su questa campagna`)}`);
  }
  const op = await prisma.operazioneAdv.create({
    data: {
      tipo: "negativa",
      canale: termine.campagna.canale,
      bersaglio: termine.campagna.nome,
      parametri: JSON.stringify({ testo: termine.testo }),
      motivo: `Termine di ricerca senza resa: ${(termine.spesa ?? 0).toFixed(2)} € spesi, ${termine.conversioni ?? 0} conversioni`,
      livello: "L0",
      prima: "assente",
      campagnaId: termine.campagna.id,
    },
  });
  await prisma.termineRicerca.update({ where: { id }, data: { stato: "da_escludere" } });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    entitaId: op.id,
    titolo: `In coda (da approvare): negativa "${termine.testo}" su ${termine.campagna.nome}`,
    dettaglio: op.motivo,
  });
  redirect("/operazioni");
}

// ---------- "Aggiorna adesso" ----------
// Google e Meta si aggiornano in due modi opposti, e il bottone non può fingere
// che siano la stessa cosa:
//  · META lo prende l'app, quindi succede subito, qui, adesso.
//  · GOOGLE gira dentro Google Ads e da fuori NESSUNO può avviarlo — non esiste
//    un'API che lanci uno Script. Si lascia la richiesta in coda e il primo
//    script che parte, qualunque sia il suo lavoro, la esegue e riferisce.
export async function aggiornaAdesso(fd: FormData) {
  const canale = testo(fd, "canale") ?? "google_ads";
  const lavoro = testo(fd, "lavoro") ?? "metriche";
  const giorni = Math.min(Math.max(numeroDa(fd, "giorni") ?? 7, 1), 400);
  const account = testo(fd, "account");
  const dove = testo(fd, "dove") ?? "/ricezione";

  if (canale === "meta_ads") {
    const { leggiMetricheMeta, leggiStatoCampagneMeta, metaConfigurato } = await import("./meta");
    if (!metaConfigurato()) {
      redirect(`${dove}?aggiornamento=meta-non-configurato`);
    }
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const al = iso(new Date());
    const dal = iso(new Date(Date.now() - giorni * 86_400_000));
    const account = await prisma.accountAdv.findMany({
      where: { piattaforma: "meta_ads", attivo: true },
      select: { idEsterno: true },
    });
    const { salvaMetriche } = await import("./ingest-metriche");
    let salvate = 0;
    for (const a of account) {
      const lettura = await leggiMetricheMeta(a.idEsterno, dal, al);
      if (lettura.righe.length === 0) continue;
      const { stati } = await leggiStatoCampagneMeta(a.idEsterno);
      const righe = lettura.righe.map((r) => {
        const s = stati.get(r.idCampagna);
        return { ...r, stato: s?.stato ?? null, budgetGiornaliero: s?.budget ?? null, obiettivo: s?.obiettivo ?? null };
      });
      const esito = await salvaMetriche(righe, { canale: "meta_ads", account: a.idEsterno });
      salvate += esito.metricheSalvate;
    }
    await registra({
      autore: "utente", tipo: "sync", entita: "metrica",
      titolo: `Aggiornamento Meta a mano: ${salvate} giorni-campagna`,
      dettaglio: `Periodo ${dal} → ${al}`,
    });
    revalidatePath(dove);
    redirect(`${dove}?aggiornamento=meta-fatto&righe=${salvate}`);
  }

  // Google: si mette in coda. Premere due volte non crea due richieste.
  const gia = await prisma.richiestaAggiornamento.findFirst({
    where: { stato: "in_attesa", canale, lavoro, account: account ?? null },
  });
  if (!gia) {
    await prisma.richiestaAggiornamento.create({
      data: { canale, account: account ?? null, lavoro, giorni, motivo: testo(fd, "motivo") },
    });
    await registra({
      autore: "utente", tipo: "sync", entita: "metrica",
      titolo: `Chiesto aggiornamento ${lavoro} (${giorni} giorni)${account ? ` su ${account}` : ""}`,
      dettaglio: "Parte alla prossima esecuzione di uno qualsiasi degli script dell'account",
    });
  }
  revalidatePath(dove);
  redirect(`${dove}?aggiornamento=${gia ? "gia-in-coda" : "in-coda"}`);
}

// ---------- Vendite attese per canale ----------
// Il piano del Monitoraggio arriva fino al brand; qui si dice quanto ci si
// aspetta da ciascun canale. È una decisione di chi governa il budget, quindi
// vive solo qui e nessun import la sovrascrive.
export async function salvaVenditeAttese(fd: FormData) {
  const anno = numeroDa(fd, "anno");
  const mese = numeroDa(fd, "mese");
  if (!anno || !mese) return;

  // Il modulo manda una casella per ogni coppia brand+canale: "attesa:gifts:google_ads"
  const scritte: { brand: string; canale: string; vendite: number | null; spesa: number | null }[] = [];
  for (const [chiave, valore] of fd.entries()) {
    if (!chiave.startsWith("attesa:") || typeof valore !== "string") continue;
    const [, brand, canale] = chiave.split(":");
    if (!brand || !canale) continue;
    const vendite = valore.trim() === "" ? null : Number(valore.replace(",", "."));
    const spesaRaw = fd.get(`spesa:${brand}:${canale}`);
    const spesa =
      typeof spesaRaw === "string" && spesaRaw.trim() !== "" ? Number(spesaRaw.replace(",", ".")) : null;
    if (vendite != null && isNaN(vendite)) continue;
    scritte.push({ brand, canale, vendite, spesa: spesa != null && !isNaN(spesa) ? spesa : null });
  }

  for (const s of scritte) {
    // Una casella svuotata cancella l'attesa invece di salvare uno zero: zero
    // vendite attese è una previsione, "non lo so" è un'altra cosa.
    if (s.vendite == null && s.spesa == null) {
      await prisma.venditaAttesa.deleteMany({
        where: { anno, mese, brand: s.brand, canale: s.canale },
      });
      continue;
    }
    await prisma.venditaAttesa.upsert({
      where: { anno_mese_brand_canale: { anno, mese, brand: s.brand, canale: s.canale } },
      create: { anno, mese, brand: s.brand, canale: s.canale, vendite: s.vendite, spesa: s.spesa },
      update: { vendite: s.vendite, spesa: s.spesa },
    });
  }

  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "budget",
    titolo: `Vendite attese aggiornate: ${String(mese).padStart(2, "0")}/${anno}`,
    dettaglio: `${scritte.length} caselle salvate`,
  });
  revalidatePath("/budget");
  redirect(`/budget?anno=${anno}&mese=${mese}&salvato=1`);
}
