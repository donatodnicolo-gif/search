"use server";
import { FORNITORI, IMP_FORNITORE, impChiaveApi, impModello, type Fornitore } from "@/lib/ai";
import { IMP_ISTRUZIONI } from "@/lib/ai";
import {
  IMP_IMPERSONA,
  IMP_OAUTH_EMAIL,
  IMP_OAUTH_ID,
  IMP_OAUTH_REFRESH,
  IMP_OAUTH_SEGRETO,
  IMP_SERVICE_ACCOUNT,
  scriviInOut,
} from "@/lib/drive-scrittura";
import { IMP_TOKEN_TIKTOK } from "@/lib/tiktok";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { STATI_AZIONE, STATI_AZIONE_APERTI, STATI_CAMPAGNA, testoKeywordPulito } from "./dominio";
import { CHIAVE_APIKEY, CHIAVE_CARTELLA, idCartellaDrive, sincronizzaDrive } from "./drive";
// Statico e non `await import()` come il resto di guardrail: serve dentro le
// query, non dentro il corpo delle funzioni. `guardrail.ts` non importa nulla,
// nessun rischio di ciclo.
import { MODIFICHE_CHE_PESANO } from "./guardrail";
import { registra } from "./registro";
import { CATEGORIE_ORDINE, LINGUE_CAMPAGNA, NEGOZI_ORDINE } from "./vendite-campagna";
import { PAGINE_VISTA } from "./viste";

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

export async function cambiaStatoAzione(stato: string, fd: FormData) {
  const id = testo(fd, "id");
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

export async function aggiungiFeedback(tipoScelto: string, fd: FormData) {
  const id = testo(fd, "id");
  const testoFeedback = testo(fd, "testo");
  const tipo = tipoScelto === "nota" ? "nota" : "feedback";
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

export async function cambiaStatoCampagna(stato: string, fd: FormData) {
  const id = testo(fd, "id");
  if (!id || !stato || !(STATI_CAMPAGNA as readonly string[]).includes(stato)) return;
  const prima = await prisma.campagna.findUnique({ where: { id } });
  if (!prima || prima.stato === stato) return;
  const campagna = await prisma.campagna.update({ where: { id }, data: { stato } });
  await registra({ autore: "utente", tipo: "stato", entita: "campagna", entitaId: id, titolo: `Campagna "${campagna.nome}" → ${stato}` });
  // Il cambio deciso nell'app va eseguito davvero sulla piattaforma: si mette
  // in coda un'azione owner AI. Basta dire a una sessione Claude "esegui le
  // azioni in coda dell'app marketing" (GET /api/v1/azioni?aperte=1).
  //
  // `in_lancio` è una cosa da fare *nostra* (preparare e far partire), non un
  // comando da eseguire sulla piattaforma: l'azione dice quello.
  // `defunta` non genera niente: è una decisione di archivio, non un cambio
  // sulla piattaforma. Se la campagna gira ancora, prima la si mette in pausa.
  if (stato === "in_lancio") {
    await prisma.azione.create({
      data: {
        titolo: `Far partire "${campagna.nome}"`,
        descrizione: `Segnata "in lancio" nell'app Marketing il ${new Date().toLocaleDateString("it-IT")}: la campagna è decisa ma non è ancora partita. Prima di accenderla, checklist 4.1 dei Definitivi (budget, offerte, copy, landing, tracciamento). Chiudere questa azione quando è davvero attiva su ${campagna.canale === "meta_ads" ? "Meta" : "Google Ads"}.`,
        brand: campagna.brand,
        canale: campagna.canale,
        priorita: "alta",
        owner: "utente",
        campagnaId: campagna.id,
        eventi: { create: { tipo: "creazione", autore: "sistema", testo: "Generata dal passaggio a «in lancio»" } },
      },
    });
  } else if (["in_pausa", "attiva", "conclusa"].includes(stato)) {
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

// ---------- Viste salvate ----------

// Il nome arriva dal campo di testo, la pagina e i parametri correnti dal
// `.bind`: il name/value di un bottone submit non arriva mai in una server
// action, e i parametri della vista non devono dipendere da un input nascosto
// che qualcuno può dimenticare di aggiornare.
export async function salvaVista(pagina: string, parametri: string, fd: FormData) {
  const nome = testo(fd, "nome");
  if (!pagina || !nome) return;
  if (!(PAGINE_VISTA as readonly string[]).includes(pagina)) return;
  // Salvare la pagina nuda vorrebbe dire una vista che non filtra niente:
  // esiste già, è la pagina.
  if (!parametri) return;
  await prisma.vistaSalvata.upsert({
    where: { pagina_nome: { pagina, nome } },
    create: { pagina, nome, parametri },
    update: { parametri },
  });
  revalidatePath(`/${pagina}`);
}

// Una sola predefinita per pagina: si spegne la vecchia e si accende questa.
// Ripremendola sulla vista già predefinita la si toglie, così si può tornare
// alla pagina senza filtri all'apertura.
export async function rendiVistaPredefinita(id: string) {
  if (!id) return;
  const vista = await prisma.vistaSalvata.findUnique({ where: { id } });
  if (!vista) return;
  if (vista.predefinita) {
    await prisma.vistaSalvata.update({ where: { id }, data: { predefinita: false } });
  } else {
    await prisma.vistaSalvata.updateMany({
      where: { pagina: vista.pagina, predefinita: true },
      data: { predefinita: false },
    });
    await prisma.vistaSalvata.update({ where: { id }, data: { predefinita: true } });
  }
  revalidatePath(`/${vista.pagina}`);
}

export async function eliminaVista(id: string) {
  if (!id) return;
  const vista = await prisma.vistaSalvata.findUnique({ where: { id } });
  if (!vista) return;
  await prisma.vistaSalvata.delete({ where: { id } });
  revalidatePath(`/${vista.pagina}`);
}

// ---------- Legame campagna ↔ vendite Shopify ----------

// La correzione a mano del legame di CONTESTO (prodotto, lingua, negozio).
// Da qui in poi `origine = manuale`: la deduzione dal nome non lo tocca più,
// nemmeno se la campagna viene rinominata.
export async function salvaLegameShopify(campagnaId: string, fd: FormData) {
  if (!campagnaId) return;
  const scelta = (nome: string, ammessi: readonly string[]) => {
    const v = testo(fd, nome);
    return v && ammessi.includes(v) ? v : null;
  };
  const dati = {
    categoria: scelta("categoria", CATEGORIE_ORDINE),
    lingua: scelta("lingua", LINGUE_CAMPAGNA),
    negozio: scelta("negozio", NEGOZI_ORDINE),
    // La città non ha un catalogo chiuso come le altre: si prende quella
    // scelta. Vuoto = nessun filtro di città, che è diverso da «non deducibile».
    citta: testo(fd, "citta") || null,
    origine: "manuale",
    motivo: "scelto a mano dalla scheda campagna",
  };
  await prisma.legameCampagnaShopify.upsert({
    where: { campagnaId },
    create: { campagnaId, ...dati },
    update: dati,
  });
  const campagna = await prisma.campagna.findUnique({ where: { id: campagnaId }, select: { nome: true } });
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "campagna",
    entitaId: campagnaId,
    titolo: `Legame vendite corretto a mano: ${campagna?.nome ?? campagnaId}`,
    dettaglio: `prodotto ${dati.categoria ?? "—"} · lingua ${dati.lingua ?? "—"} · negozio ${dati.negozio ?? "—"}`,
  });
  revalidatePath(`/campagne/${campagnaId}`);
}

// Torna alla deduzione dal nome: cancella la riga, il prossimo caricamento
// della scheda la ricrea leggendo il nome della campagna.
export async function ripristinaLegameShopify(campagnaId: string) {
  if (!campagnaId) return;
  await prisma.legameCampagnaShopify.deleteMany({ where: { campagnaId } });
  revalidatePath(`/campagne/${campagnaId}`);
}

// ---------- Drive ----------

export async function avviaSyncDrive() {
  const esito = await sincronizzaDrive();
  // ⚠️ Questa riga arriva DOPO la sync: se la funzione muore a metà non viene
  // mai scritta, ed è quello che è successo il 28/07/2026 (179 documenti su
  // 669 e nessuna traccia). La traccia vera adesso è la riga `SyncDrive`,
  // aperta prima di cominciare; questa resta perché lo storico si guarda lì.
  await registra({
    autore: "utente",
    tipo: "sync",
    entita: "drive",
    titolo: "Sincronizzazione Drive",
    dettaglio:
      esito.errore ??
      `trovati ${esito.trovati} · nuovi ${esito.nuovi} · aggiornati ${esito.aggiornati} · rimossi ${esito.rimossi} · analisi importate ${esito.analisi}${esito.interrotta ? " · INTERROTTA, riparte alla prossima" : ""}`,
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

export async function cambiaStatoTestMeta(stato: string, fd: FormData) {
  const id = testo(fd, "id");
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

export async function cambiaStatoLanding(stato: string, fd: FormData) {
  const id = testo(fd, "id");
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

// ⚠️ Il campo vuoto NON cancella più.
//
// La casella non può mostrare la chiave già salvata — i segreti non si
// rileggono mai — quindi si trova SEMPRE vuota. E qui si scriveva `?? ""`:
// bastava premere «Salva chiave» senza scrivere niente per spegnere la sync
// del Drive, senza un avviso. Il placeholder prometteva già «lascia vuoto per
// non cambiarla»: la promessa e il comportamento andavano in due direzioni
// opposte, e vinceva il codice.
//
// Per cancellarla davvero c'è la spunta apposta: un gesto esplicito, come per
// le chiavi AI, il token TikTok e le credenziali Drive.
export async function salvaApiKeyDrive(fd: FormData) {
  const chiaveApi = testo(fd, "apikey");
  const svuota = fd.get("svuota") === "1";

  if (svuota) {
    await prisma.impostazione.deleteMany({ where: { chiave: CHIAVE_APIKEY } });
    await registra({ autore: "utente", tipo: "modifica", entita: "drive", titolo: "Chiave API Google Drive cancellata" });
    redirect("/impostazioni?salvato=apikey-tolta");
  }
  if (!chiaveApi) {
    // Salva premuto a vuoto, senza chiedere di cancellare: non si fa niente.
    // Fra non fare nulla e fare la cosa irreversibile, si sceglie la prima.
    redirect("/impostazioni?salvato=apikey-invariata");
  }
  await prisma.impostazione.upsert({
    where: { chiave: CHIAVE_APIKEY },
    create: { chiave: CHIAVE_APIKEY, valore: chiaveApi },
    update: { valore: chiaveApi },
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
    include: { modifiche: MODIFICHE_CHE_PESANO },
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

export async function consolidaMemoria(stato: string, fd: FormData) {
  const id = testo(fd, "id");
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

export async function verdettoIncongruenza(stato: string, fd: FormData) {
  const id = testo(fd, "id");
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

export async function esitoVerificaAzione(esito: string, fd: FormData) {
  const id = testo(fd, "id");
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

export async function cambiaStatoCreativo(stato: string, fd: FormData) {
  const id = testo(fd, "id");
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
      modifiche: MODIFICHE_CHE_PESANO,
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

// `testoKeywordPulito` sta in dominio.ts, non qui: un file "use server" può
// esportare SOLO funzioni async, e una funzione di pulizia di stringhe async
// non ha senso. (Il typecheck non lo vede: lo dice il compilatore di Next.)
// Stessa coda approvata delle operazioni campagna. Livelli dal doc 11:
// negativa puntuale = L0 (libera) · aggiunta keyword = L1 · pausa/attiva = L2.
export async function creaOperazioneKeyword(fd: FormData) {
  // Chi chiama può dire dove tornare: la stessa azione parte dalla pagina
  // Keywords e dalla scheda gruppo, e finire altrove dopo un blocco fa perdere
  // il filo di quello che si stava guardando.
  const ritorno = testo(fd, "ritorno") ?? "/keywords";
  const tipo = testo(fd, "tipo");
  const campagnaId = testo(fd, "campagnaId");
  const kwGrezzo = testo(fd, "testo");
  const kwTesto = kwGrezzo ? testoKeywordPulito(kwGrezzo) : null;
  if (!tipo || !campagnaId || !kwTesto) return;
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    include: {
      // take 5 perché qui serve anche contare le L2/L3 della settimana
      modifiche: { ...MODIFICHE_CHE_PESANO, take: 5 },
      incidenti: { where: { stato: "aperto" }, select: { codice: true } },
    },
  });
  if (!campagna) return;

  const livello = tipo === "negativa" ? "L0" : tipo === "nuova_keyword" ? "L1" : "L2";

  if (campagna.incidenti.length > 0) {
    redirect(`${ritorno}${ritorno.includes("?") ? "&" : "?"}bloccata=${encodeURIComponent(`Freeze ${campagna.incidenti[0].codice}: incidente aperto su ${campagna.nome}`)}`);
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
      redirect(`${ritorno}${ritorno.includes("?") ? "&" : "?"}bloccata=${encodeURIComponent(esito.blocchi[0])}`);
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
        // ⚠️ Per le NEGATIVE il default è «esatta», non generica. Una negativa
        // generica blocca ogni ricerca che contenga quelle parole in qualsiasi
        // ordine: escludere «fiori milano» spegnerebbe anche «consegna fiori a
        // milano centro», cioè il traffico buono. Per le keyword da AGGIUNGERE
        // resta broad, che lì è il default giusto.
        // Per le NEGATIVE si eredita la corrispondenza con cui la parola è
        // stata intercettata: escludere in esatta una ricerca entrata in frase
        // lascia passare tutte le varianti, ed escludere in generica una entrata
        // in esatta spegne molto più del voluto. Se non si sa, esatta: è quella
        // che sbaglia meno. Per le keyword da AGGIUNGERE il default resta broad.
        corrispondenza:
          testo(fd, "corrispondenza") ??
          (tipo === "negativa" ? testo(fd, "corrispondenzaOrigine") ?? "exact" : "broad"),
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

// ---------- Proposte dell'AI su keyword e parole cercate ----------

// Chiede all'AI cosa farebbe di ogni keyword e di ogni parola cercata della
// campagna. Non cambia niente: scrive proposte, che poi una persona accetta.
export async function chiediProposteAi(campagnaId: string) {
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    select: { id: true, nome: true, brand: true },
  });
  if (!campagna) return;
  const { chiediProposte } = await import("./proposte-ai");
  const esito = await chiediProposte(campagna);
  await registra({
    autore: "ai",
    tipo: "creazione",
    entita: "campagna",
    entitaId: campagnaId,
    titolo: `Proposte AI su "${campagna.nome}"`,
    dettaglio: esito.ok
      ? `${esito.proposte} giudicate (${esito.modello}) · ${esito.senzaDati} senza abbastanza numeri`
      : esito.errore,
  });
  revalidatePath(`/campagne/${campagnaId}`);
  if (!esito.ok) {
    redirect(`/campagne/${campagnaId}?ai=${encodeURIComponent(esito.errore)}#keywords`);
  }
  redirect(
    `/campagne/${campagnaId}?aiok=${encodeURIComponent(
      `${esito.proposte} parole giudicate, ${esito.senzaDati} senza abbastanza numeri per dire qualcosa`
    )}#keywords`
  );
}

// Accettare una proposta NON la esegue: mette in coda l'operazione, che resta
// da approvare come tutte le altre. Le proposte che non corrispondono a
// un'operazione eseguibile (alza/abbassa: le offerte lo script non le tocca)
// diventano un'azione del kanban, così non si perdono.
export async function accettaProposta(propostaId: string) {
  const p = await prisma.propostaAi.findUnique({
    where: { id: propostaId },
    include: { campagna: { select: { id: true, nome: true, brand: true, canale: true, idEsterno: true } } },
  });
  if (!p || p.stato !== "proposta") return;

  const tipoOperazione =
    p.azione === "escludi" ? "negativa" : p.azione === "pausa" ? "pausa_keyword" : p.azione === "aggiungi" ? "nuova_keyword" : null;

  if (tipoOperazione) {
    // Stessa pulizia dei bottoni a mano: su Google la keyword non si chiama
    // «flower milan (match esatto)».
    const pulito = testoKeywordPulito(p.testo);
    const op = await prisma.operazioneAdv.create({
      data: {
        tipo: tipoOperazione,
        canale: p.campagna.canale,
        bersaglio: tipoOperazione === "pausa_keyword" ? pulito : p.campagna.nome,
        idEsterno: p.campagna.idEsterno,
        parametri: JSON.stringify({ testo: pulito, corrispondenza: "broad" }),
        motivo: `Proposta dall'AI: ${p.motivo}`,
        livello: tipoOperazione === "negativa" ? "L0" : tipoOperazione === "nuova_keyword" ? "L1" : "L2",
        prima: tipoOperazione === "pausa_keyword" ? "attiva" : "assente",
        campagnaId: p.campagnaId,
      },
    });
    await registra({
      autore: "utente",
      tipo: "creazione",
      entita: "operazione",
      entitaId: op.id,
      titolo: `In coda (da approvare): ${tipoOperazione} "${pulito}" su ${p.campagna.nome}`,
      dettaglio: p.motivo,
    });
  } else {
    await prisma.azione.create({
      data: {
        titolo: `${p.azione === "alza" ? "Spingere di più" : p.azione === "abbassa" ? "Ridimensionare" : "Guardare"}: "${p.testo}" su ${p.campagna.nome}`,
        descrizione: `Proposta dall'AI il ${new Date().toLocaleDateString("it-IT")}: ${p.motivo}\n\nNumeri su cui è stata fatta: ${p.numeri ?? "—"}.\n\nLe offerte non si toccano da script: va fatto in interfaccia Google Ads.`,
        brand: p.campagna.brand,
        canale: p.campagna.canale,
        priorita: "media",
        owner: "utente",
        campagnaId: p.campagnaId,
        eventi: { create: { tipo: "creazione", autore: "ai", testo: "Nata da una proposta dell'AI accettata" } },
      },
    });
  }

  await prisma.propostaAi.update({
    where: { id: propostaId },
    data: { stato: "accettata", decisaIl: new Date() },
  });
  revalidatePath(`/campagne/${p.campagnaId}`);
}

export async function scartaProposta(propostaId: string) {
  const p = await prisma.propostaAi.findUnique({ where: { id: propostaId }, select: { campagnaId: true } });
  if (!p) return;
  await prisma.propostaAi.update({
    where: { id: propostaId },
    data: { stato: "scartata", decisaIl: new Date() },
  });
  revalidatePath(`/campagne/${p.campagnaId}`);
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

/**
 * Il nome leggibile di un gruppo, deciso da noi.
 *
 * ⚠️ Non tocca il nome su Google, e non deve: quello è la chiave con cui
 * l'import ritrova il gruppo quando manca l'id di piattaforma
 * (`ingest-gruppi.ts`). Cambiarlo qui vorrebbe dire che al giro dopo Google ne
 * crea uno nuovo e questo resta orfano con tutta la sua storia.
 * Casella vuota = si torna a mostrare il nome di Google.
 */
export async function rinominaGruppo(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const nuovo = (testo(fd, "nomeVisibile") ?? "").trim();
  const gruppo = await prisma.gruppo.update({
    where: { id },
    data: { nomeVisibile: nuovo.length > 0 ? nuovo : null },
    include: { campagna: { select: { nome: true } } },
  });
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "gruppo",
    entitaId: gruppo.id,
    titolo: nuovo
      ? `Gruppo "${gruppo.nome}" si chiama "${nuovo}"`
      : `Gruppo "${gruppo.nome}": tolto il nome scelto, torna quello di Google`,
    dettaglio: gruppo.campagna.nome,
  });
  revalidatePath(`/gruppi/${id}`);
  revalidatePath("/gruppi");
}

// Gemella di `rinominaGruppo`: il nome che diamo NOI alla campagna. Quello di
// Google non si tocca — è la chiave con cui l'import la ritrova, e le keyword
// del Monitoraggio ci si agganciano per nome.
export async function rinominaCampagna(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const nuovo = (testo(fd, "nomeVisibile") ?? "").trim();
  const campagna = await prisma.campagna.update({
    where: { id },
    data: { nomeVisibile: nuovo.length > 0 ? nuovo : null },
  });
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "campagna",
    entitaId: campagna.id,
    titolo: nuovo
      ? `Campagna "${campagna.nome}" si chiama "${nuovo}"`
      : `Campagna "${campagna.nome}": tolto il nome scelto, torna quello di Google`,
  });
  revalidatePath(`/campagne/${id}`);
  revalidatePath("/campagne");
}

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
          modifiche: MODIFICHE_CHE_PESANO,
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
export async function giudicaTermine(scelta: string, fd: FormData) {
  const id = testo(fd, "id");
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

  if (scelta === "escluso") {
    await prisma.termineRicerca.update({ where: { id }, data: { stato: "escluso" } });
    revalidatePath("/termini");
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
  revalidatePath("/termini");
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

  if (canale === "tiktok") {
    const { leggiMetricheTikTok, leggiStatoCampagneTikTok, tiktokConfigurato } = await import("./tiktok");
    if (!(await tiktokConfigurato())) {
      redirect(`${dove}?aggiornamento=tiktok-non-configurato`);
    }
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const al = iso(new Date());
    const dal = iso(new Date(Date.now() - giorni * 86_400_000));
    const advertiser = await prisma.accountAdv.findMany({
      where: { piattaforma: "tiktok", attivo: true },
      select: { idEsterno: true, brand: true },
    });
    const { salvaMetriche } = await import("./ingest-metriche");
    let salvate = 0;
    const rifiutate = new Set<string>();
    for (const acc of advertiser) {
      const lettura = await leggiMetricheTikTok(acc.idEsterno, dal, al);
      lettura.metricheRifiutate.forEach((m) => rifiutate.add(m));
      if (lettura.righe.length === 0) continue;
      const { stati } = await leggiStatoCampagneTikTok(acc.idEsterno);
      const righe = lettura.righe.map((r) => {
        const s = stati.get(r.idCampagna);
        return { ...r, stato: s?.stato ?? null, budgetGiornaliero: s?.budget ?? null, obiettivo: s?.obiettivo ?? null };
      });
      const esito = await salvaMetriche(righe, { canale: "tiktok", account: acc.idEsterno, brand: acc.brand ?? undefined });
      salvate += esito.metricheSalvate;
    }
    await registra({
      autore: "utente", tipo: "sync", entita: "metrica",
      titolo: `Aggiornamento TikTok a mano: ${salvate} giorni-campagna`,
      dettaglio: `Periodo ${dal} → ${al}` + (rifiutate.size ? ` · metriche rifiutate: ${[...rifiutate].join(", ")}` : ""),
    });
    revalidatePath(dove);
    redirect(`${dove}?aggiornamento=tiktok-fatto&righe=${salvate}`);
  }

  // Google: si mette in coda, UNA RICHIESTA PER ACCOUNT.
  //
  // Una richiesta senza account se la prendeva il primo script che passava, e
  // chiudendola la toglieva agli altri due: si chiedevano i gruppi di tutte le
  // campagne e arrivavano quelli di un brand solo. Ora ogni account ha la sua,
  // la esegue e chiude la sua.
  const destinatari = account
    ? [account]
    : (
        await prisma.accountAdv.findMany({
          where: { piattaforma: canale, attivo: true },
          select: { idEsterno: true },
        })
      ).map((a) => a.idEsterno);

  // Nessun account censito: resta la richiesta generica, meglio di nessuna.
  const daCreare: (string | null)[] = destinatari.length > 0 ? destinatari : [null];

  let create = 0;
  for (const dest of daCreare) {
    const gia = await prisma.richiestaAggiornamento.findFirst({
      where: { stato: "in_attesa", canale, lavoro, account: dest },
    });
    if (gia) continue;
    await prisma.richiestaAggiornamento.create({
      data: { canale, account: dest, lavoro, giorni, motivo: testo(fd, "motivo") },
    });
    create++;
  }

  if (create > 0) {
    await registra({
      autore: "utente", tipo: "sync", entita: "metrica",
      titolo: `Chiesto aggiornamento ${lavoro} (${giorni} giorni) su ${create} account`,
      dettaglio: "Parte alla prossima esecuzione dello script di ciascun account",
    });
  }
  revalidatePath(dove);
  redirect(`${dove}?aggiornamento=${create === 0 ? "gia-in-coda" : "in-coda"}`);
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

// Quale AI usa l'app, e con quale chiave.
//
// Le chiavi non si rileggono MAI: una casella lasciata vuota lascia in pace
// quella già salvata invece di cancellarla, perché il modulo non può mostrare
// il valore attuale e un invio distratto altrimenti spegnerebbe l'AI.
export async function salvaImpostazioniAi(formData: FormData) {
  "use server";
  const fornitore = String(formData.get("fornitore") ?? "anthropic");
  const scelto: Fornitore = fornitore === "openai" ? "openai" : "anthropic";

  await prisma.impostazione.upsert({
    where: { chiave: IMP_FORNITORE },
    update: { valore: scelto },
    create: { chiave: IMP_FORNITORE, valore: scelto },
  });

  for (const f of FORNITORI) {
    // Le chiavi arrivano con spazi e a volte con un BOM invisibile incollato
    // dal browser: va tolto qui, o l'header parte malformato e l'errore
    // sembra una chiave sbagliata.
    const nuova = String(formData.get(`chiave:${f.chiave}`) ?? "").replace(/[\s﻿]/g, "");
    const svuota = formData.get(`svuota:${f.chiave}`) === "1";
    if (svuota) {
      await prisma.impostazione.deleteMany({ where: { chiave: impChiaveApi(f.chiave) } });
    } else if (nuova) {
      await prisma.impostazione.upsert({
        where: { chiave: impChiaveApi(f.chiave) },
        update: { valore: nuova },
        create: { chiave: impChiaveApi(f.chiave), valore: nuova },
      });
    }

    const modello = String(formData.get(`modello:${f.chiave}`) ?? "").trim();
    if (modello) {
      await prisma.impostazione.upsert({
        where: { chiave: impModello(f.chiave) },
        update: { valore: modello },
        create: { chiave: impModello(f.chiave), valore: modello },
      });
    } else {
      // Casella svuotata: si torna al modello di riferimento del fornitore.
      await prisma.impostazione.deleteMany({ where: { chiave: impModello(f.chiave) } });
    }
  }

  revalidatePath("/impostazioni");
  revalidatePath("/ai");
  redirect("/impostazioni?salvato=ai");
}

// Il budget vendite di un mese, scritto a mano.
//
// Prima si poteva cambiare solo rifacendo `npm run import:monitoraggio`, cioè
// ritoccando l'Excel e rilanciando uno script: per correggere un mese si
// passava da un file che sta sul computer di qualcun altro.
//
// ATTENZIONE: l'import del Monitoraggio riscrive queste righe. Una modifica
// fatta qui vale finché non si reimporta quel foglio — sta scritto in pagina.
export async function salvaBudgetVendite(formData: FormData) {
  "use server";
  const anno = Number(formData.get("anno"));
  if (!Number.isFinite(anno)) return;

  // Un numero scritto a mano: "65.000", "65000,50", "65 000 €" devono valere
  // tutti lo stesso. Vuoto vuol dire «non lo so», che NON è zero.
  const numero = (v: FormDataEntryValue | null): number | null => {
    const grezzo = String(v ?? "").trim();
    if (!grezzo) return null;
    // Via tutto quello che non e cifra o separatore, poi il punto delle
    // migliaia (solo se seguito da ESATTAMENTE tre cifre, altrimenti "1.5"
    // diventerebbe 15), poi la virgola decimale italiana.
    const pulito = grezzo
      .replace(/[^0-9,.-]/g, "")
      .replace(/[.](?=[0-9]{3}([^0-9]|$))/g, "")
      .replace(",", ".");
    // Un testo senza cifre ("abc") diventa stringa vuota, e Number("") vale
    // ZERO: scriverebbe un budget di zero al posto di un errore di battitura.
    if (!/[0-9]/.test(pulito)) return null;
    const n = Number(pulito);
    return Number.isFinite(n) ? n : null;
  };

  // UNA lettura per tutto l'anno, non una per casella. Il modulo ha 72 caselle
  // (3 siti × 12 mesi × 2 campi): interrogare il database una volta per casella
  // voleva dire 72 viaggi di andata e ritorno prima ancora di scrivere qualcosa,
  // e su Vercel la funzione moriva per tempo scaduto — il bottone sembrava non
  // fare niente. Ora si legge una volta, si confronta in memoria, e si scrive
  // solo quello che è davvero cambiato: quasi sempre una riga o due.
  const esistenti = await prisma.venditaMensile.findMany({ where: { anno } });
  const perChiave = new Map(esistenti.map((r) => [`${r.sito}:${r.mese}`, r]));

  type Modifica = { sito: string; mese: number; campo: "vendite" | "budgetAdv"; valore: number | null };
  const modifiche: Modifica[] = [];

  for (const [chiave, valore] of formData.entries()) {
    const m = /^riga:([a-z]+):([0-9]+):(vendite|budgetAdv)$/.exec(chiave);
    if (!m) continue;
    const [, sito, meseStr, campoStr] = m;
    const campo = campoStr as "vendite" | "budgetAdv";
    const mese = Number(meseStr);
    const n = numero(valore);
    const attuale = perChiave.get(`${sito}:${mese}`);

    if (!attuale && n == null) continue; // casella vuota su una riga che non esiste
    if (attuale && (attuale[campo] ?? null) === n) continue; // invariata
    modifiche.push({ sito, mese, campo, valore: n });
  }

  if (modifiche.length === 0) {
    redirect(`/vendite?anno=${anno}&salvato=niente`);
  }

  // Una sola istruzione per RIGA, non per casella: vendite e budget dello
  // stesso mese cambiano insieme. Senza raggruppare, un mese nuovo con
  // entrambi i valori generava due create con la stessa chiave e la
  // transazione moriva sul vincolo di unicità.
  const perRiga = new Map<string, { sito: string; mese: number; dati: Record<string, number | null> }>();
  for (const m of modifiche) {
    const k = `${m.sito}:${m.mese}`;
    const v = perRiga.get(k) ?? { sito: m.sito, mese: m.mese, dati: {} };
    v.dati[m.campo] = m.valore;
    perRiga.set(k, v);
  }

  // O entra tutto o niente: un piano di budget salvato a metà è peggio di uno
  // non salvato, perché non si vede.
  await prisma.$transaction(
    [...perRiga.values()].map((r) => {
      const attuale = perChiave.get(`${r.sito}:${r.mese}`);
      return attuale
        ? prisma.venditaMensile.update({ where: { id: attuale.id }, data: r.dati })
        : prisma.venditaMensile.create({ data: { anno, mese: r.mese, sito: r.sito, ...r.dati } });
    })
  );

  revalidatePath("/vendite");
  revalidatePath("/");
  redirect(`/vendite?anno=${anno}&salvato=${modifiche.length}`);
}


// Il token di TikTok Ads.
//
// Sta nel database e non in una variabile d'ambiente come quello di Meta: un
// token si cambia quando scade, e cambiarlo non deve richiedere un deploy.
// Vale la stessa regola delle chiavi AI: non si rilegge, e una casella vuota
// non cancella quello salvato.
export async function salvaTokenTikTok(formData: FormData) {
  "use server";
  const nuovo = String(formData.get("token") ?? "").replace(/[s﻿]/g, "");
  const svuota = formData.get("svuota") === "1";

  if (svuota) {
    await prisma.impostazione.deleteMany({ where: { chiave: IMP_TOKEN_TIKTOK } });
  } else if (nuovo) {
    await prisma.impostazione.upsert({
      where: { chiave: IMP_TOKEN_TIKTOK },
      update: { valore: nuovo },
      create: { chiave: IMP_TOKEN_TIKTOK, valore: nuovo },
    });
  }

  revalidatePath("/impostazioni");
  redirect("/impostazioni?salvato=tiktok");
}

// Il blocco di istruzioni operative dell'AI (RUOLO, protocollo PONTE, vincoli).
//
// È un documento, non una configurazione: si incolla intero e si rilegge
// intero. Ogni salvataggio lascia una voce nel registro con la data e quanto è
// cambiato — il protocollo dice che lo storico vive in 00.2/00.3, e almeno la
// traccia di QUANDO è cambiato deve restare anche qui.
export async function salvaIstruzioniAi(formData: FormData) {
  "use server";
  const nuovo = String(formData.get("istruzioni") ?? "").trim();
  const precedente = await prisma.impostazione
    .findUnique({ where: { chiave: IMP_ISTRUZIONI } })
    .catch(() => null);

  if (!nuovo) {
    if (precedente) {
      await prisma.impostazione.deleteMany({ where: { chiave: IMP_ISTRUZIONI } });
      await registra({
        autore: "utente",
        tipo: "modifica",
        entita: "impostazione",
        titolo: "Istruzioni operative dell'AI rimosse",
        dettaglio: `Erano ${precedente.valore.length} caratteri: da adesso l'AI lavora senza protocollo.`,
      });
    }
    revalidatePath("/impostazioni");
    redirect("/impostazioni?salvato=istruzioni-vuote");
  }

  if (precedente?.valore === nuovo) {
    redirect("/impostazioni?salvato=istruzioni-uguali");
  }

  await prisma.impostazione.upsert({
    where: { chiave: IMP_ISTRUZIONI },
    update: { valore: nuovo },
    create: { chiave: IMP_ISTRUZIONI, valore: nuovo },
  });

  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "impostazione",
    titolo: precedente ? "Istruzioni operative dell'AI aggiornate" : "Istruzioni operative dell'AI depositate",
    dettaglio: precedente
      ? `Da ${precedente.valore.length} a ${nuovo.length} caratteri.`
      : `${nuovo.length} caratteri.`,
  });

  revalidatePath("/impostazioni");
  revalidatePath("/ai");
  redirect("/impostazioni?salvato=istruzioni");
}

// La credenziale con cui l'app scrive nel ponte su Drive.
//
// È un file JSON con dentro una chiave privata: si incolla, non si rilegge.
// Vale la stessa regola delle altre chiavi — casella vuota lascia in pace
// quella salvata, la spunta la cancella.
export async function salvaServiceAccountDrive(formData: FormData) {
  "use server";
  const svuota = formData.get("svuota") === "1";
  const grezzo = String(formData.get("json") ?? "").trim();

  if (svuota) {
    await prisma.impostazione.deleteMany({ where: { chiave: IMP_SERVICE_ACCOUNT } });
    revalidatePath("/impostazioni");
    redirect("/impostazioni?salvato=drive-scrittura-tolta");
  }
  if (!grezzo) redirect("/impostazioni?salvato=drive-invariato");

  // Si controlla SUBITO che sia il file giusto: un JSON incollato a metà o la
  // chiave sbagliata darebbero un errore solo al primo tentativo di scrittura,
  // cioè quando serve davvero.
  try {
    const j = JSON.parse(grezzo) as { client_email?: string; private_key?: string; type?: string };
    if (!j.client_email || !j.private_key) {
      redirect("/impostazioni?salvato=drive-json-incompleto");
    }
  } catch {
    redirect("/impostazioni?salvato=drive-json-rotto");
  }

  await prisma.impostazione.upsert({
    where: { chiave: IMP_SERVICE_ACCOUNT },
    update: { valore: grezzo },
    create: { chiave: IMP_SERVICE_ACCOUNT, valore: grezzo },
  });
  revalidatePath("/impostazioni");
  redirect("/impostazioni?salvato=drive-scrittura");
}

// Prova di scrittura: deposita un file di verifica nel ponte.
//
// Serve a scoprire ADESSO se la condivisione della cartella è giusta, invece
// di scoprirlo il giorno in cui l'app deve depositare un log vero.
export async function provaScritturaDrive() {
  "use server";
  const adesso = new Date();
  const stampa = `${adesso.getFullYear()}-${String(adesso.getMonth() + 1).padStart(2, "0")}-${String(adesso.getDate()).padStart(2, "0")} ${String(adesso.getHours()).padStart(2, "0")}${String(adesso.getMinutes()).padStart(2, "0")}`;
  const esito = await scriviInOut(
    `PROVA App scrittura [${stampa}].md`,
    `# PROVA di scrittura — App Marketing — ${stampa}\n\n` +
      `File depositato dall'app per verificare che il ponte funzioni.\n` +
      `Non contiene dati e non richiede nessuna azione: si può cancellare.\n`
  );
  revalidatePath("/impostazioni");
  redirect(
    esito.ok
      ? `/impostazioni?salvato=drive-prova-ok`
      : `/impostazioni?salvato=drive-prova-no&perche=${encodeURIComponent(esito.errore.slice(0, 160))}`
  );
}

// Per conto di chi scrive l'app su Drive.
//
// Senza questo, l'account di servizio prova a possedere lui il file e Google
// rifiuta: non ha spazio ("Service Accounts do not have storage quota").
export async function salvaImpersonazioneDrive(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    await prisma.impostazione.deleteMany({ where: { chiave: IMP_IMPERSONA } });
    revalidatePath("/impostazioni");
    redirect("/impostazioni?salvato=drive-impersona-tolta");
  }
  // ⚠️ Due backslash mancanti rendevano questo controllo una trappola:
  // `[^@s]` non esclude gli SPAZI, esclude la lettera «s». Le email che
  // contengono una s — assistenza@…, mario.rossi@… — venivano respinte come
  // «non valide», e il messaggio dava la colpa all'indirizzo invece che al
  // controllo. Provato: 2 su 4 indirizzi normali rifiutati.
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    redirect("/impostazioni?salvato=drive-impersona-invalida");
  }
  await prisma.impostazione.upsert({
    where: { chiave: IMP_IMPERSONA },
    update: { valore: email },
    create: { chiave: IMP_IMPERSONA, valore: email },
  });
  revalidatePath("/impostazioni");
  redirect("/impostazioni?salvato=drive-impersona");
}

// Le credenziali dell'app OAuth con cui collegare Drive come utente.
export async function salvaOauthDrive(formData: FormData) {
  "use server";
  const id = String(formData.get("client_id") ?? "").trim();
  const segreto = String(formData.get("client_secret") ?? "").trim();
  const scollega = formData.get("scollega") === "1";

  if (scollega) {
    await prisma.impostazione.deleteMany({
      where: { chiave: { in: [IMP_OAUTH_REFRESH, IMP_OAUTH_EMAIL] } },
    });
    revalidatePath("/impostazioni");
    redirect("/impostazioni?salvato=drive-scollegato");
  }

  if (id) {
    await prisma.impostazione.upsert({
      where: { chiave: IMP_OAUTH_ID },
      update: { valore: id },
      create: { chiave: IMP_OAUTH_ID, valore: id },
    });
  }
  if (segreto) {
    await prisma.impostazione.upsert({
      where: { chiave: IMP_OAUTH_SEGRETO },
      update: { valore: segreto },
      create: { chiave: IMP_OAUTH_SEGRETO, valore: segreto },
    });
  }
  revalidatePath("/impostazioni");
  redirect(id || segreto ? "/impostazioni?salvato=drive-oauth-salvato" : "/impostazioni?salvato=drive-invariato");
}

// ---------- Escludere più parole in un colpo solo ----------
// Le negative si aggiungono a mazzi: si guarda l'elenco delle ricerche, si
// spuntano quelle che non c'entrano niente e si escludono tutte insieme. Farlo
// una alla volta significa ricaricare la pagina venti volte, e alla decima si
// smette di guardare.
//
// Resta comunque una coda: nessuna di queste tocca Google finché non la si
// approva. Il livello è L0 — una negativa puntuale è la modifica più leggera
// che esista (doc 11), e non fa scattare il blackout.
export async function escludiParoleSelezionate(fd: FormData) {
  const campagnaId = testo(fd, "campagnaId");
  const ritorno = testo(fd, "ritorno") ?? "/keywords";
  // getAll: le checkbox spuntate arrivano tutte con lo stesso nome
  const scelte = fd
    .getAll("scelte")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!campagnaId || scelte.length === 0) {
    redirect(`${ritorno}${ritorno.includes("?") ? "&" : "?"}bloccata=${encodeURIComponent("Nessuna parola selezionata")}`);
  }

  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    include: { incidenti: { where: { stato: "aperto" }, select: { codice: true } } },
  });
  if (!campagna) return;

  // Il freeze da incidente vale su tutto: se la campagna è congelata non
  // entra in coda nemmeno una negativa.
  if (campagna.incidenti.length > 0) {
    redirect(
      `${ritorno}${ritorno.includes("?") ? "&" : "?"}bloccata=${encodeURIComponent(
        `Freeze ${campagna.incidenti[0].codice}: incidente aperto su ${campagna.nome}`
      )}`
    );
  }

  // Le parole già in coda non si riaccodano: succede a chi torna sulla pagina
  // e rispunta le stesse, e la coda si riempirebbe di doppioni da approvare.
  const giaInCoda = await prisma.operazioneAdv.findMany({
    where: { campagnaId, tipo: "negativa", stato: { in: ["in_attesa", "approvata"] } },
    select: { parametri: true },
  });
  const gia = new Set(
    giaInCoda
      .map((o) => {
        try {
          return String(JSON.parse(o.parametri ?? "{}").testo ?? "").toLowerCase();
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );

  const nuove = scelte.filter((t) => !gia.has(testoKeywordPulito(t).toLowerCase()));

  for (const t of nuove) {
    const pulito = testoKeywordPulito(t);
    await prisma.operazioneAdv.create({
      data: {
        tipo: "negativa",
        canale: campagna.canale,
        bersaglio: campagna.nome,
        idEsterno: campagna.idEsterno,
        // Esatta: si esclude QUELLA ricerca, non tutto cio che le somiglia
      parametri: JSON.stringify({ testo: pulito, corrispondenza: testo(fd, "corrispondenza") || "exact" }),
        motivo: `Esclusa insieme ad altre ${nuove.length - 1 > 0 ? `${nuove.length - 1} parole` : ""}`.trim(),
        livello: "L0",
        prima: "assente",
        campagnaId,
      },
    });
  }

  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    titolo: `In coda: ${nuove.length} negative su ${campagna.nome}`,
    dettaglio:
      nuove.map((t) => `«${t}»`).slice(0, 8).join(" · ") +
      (nuove.length > 8 ? ` e altre ${nuove.length - 8}` : "") +
      (scelte.length > nuove.length ? ` · ${scelte.length - nuove.length} erano già in coda` : ""),
  });

  redirect("/operazioni");
}

// ---------- Annullare l'operazione decisa su una parola ----------
// Dalla tabella delle keyword: se su quella parola c'è già una decisione in
// coda, l'unica cosa sensata da offrire è tornare indietro. Finché lo script
// non è passato, annullare non cambia niente su Google — l'operazione non è
// mai arrivata là.
export async function annullaOperazioneParola(fd: FormData) {
  const campagnaId = testo(fd, "campagnaId");
  const parola = testo(fd, "testo");
  const ritorno = testo(fd, "ritorno") ?? "/operazioni";
  if (!campagnaId || !parola) return;

  // La stessa normalizzazione con cui la tabella riconosce le decisioni: il
  // testo porta la corrispondenza fra parentesi ("fiori milano (phrase)") e
  // l'operazione in coda no.
  const pulito = testoKeywordPulito(parola).toLowerCase();

  const aperte = await prisma.operazioneAdv.findMany({
    where: {
      campagnaId,
      tipo: { in: ["negativa", "pausa_keyword", "attiva_keyword", "nuova_keyword"] },
      stato: { in: ["in_attesa", "approvata"] },
    },
  });

  const mie = aperte.filter((o) => {
    let t = "";
    try {
      t = String(JSON.parse(o.parametri ?? "{}").testo ?? "");
    } catch {
      t = "";
    }
    return testoKeywordPulito(t || o.bersaglio).toLowerCase() === pulito;
  });

  for (const o of mie) {
    await prisma.operazioneAdv.update({
      where: { id: o.id },
      data: { stato: "annullata", esito: "Annullata a mano prima dell'esecuzione" },
    });
  }

  if (mie.length > 0) {
    await registra({
      autore: "utente",
      tipo: "stato",
      entita: "operazione",
      titolo: `Annullate ${mie.length} operazioni su «${parola}»`,
      dettaglio: mie.map((o) => o.tipo).join(", "),
    });
  }

  revalidatePath(ritorno.split("?")[0]);
  revalidatePath("/operazioni");
  redirect(ritorno);
}

// ---------- Riportare in attesa un'operazione già approvata ----------
// Diverso da annullare: annullare la scarta, questo la rimette in coda da
// decidere. Serve quando si approva in fretta e poi si vuole ripensarci senza
// perdere l'operazione — il testo, il motivo e il livello restano quelli.
// Vale solo finché lo script non l'ha eseguita: dopo, l'unica strada è
// l'operazione opposta.
export async function riapriOperazione(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!op) return;
  if (op.stato !== "approvata") return; // eseguite e annullate non si riaprono

  await prisma.operazioneAdv.update({
    where: { id },
    data: { stato: "in_attesa", approvataDa: null, approvataIl: null },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: `Approvazione ritirata: ${op.tipo} su ${op.bersaglio}`,
    dettaglio: "Torna fra quelle da decidere. Su Google non era ancora arrivata.",
  });
  revalidatePath("/operazioni");
}

// ---------- Portare una keyword su altre campagne ----------
// È il gesto che fa crescere un account: una parola che rende dove sta la si
// prova dove ancora non c'è. Ma vale solo per le parole IDEALI — quelle che
// descrivono cosa vendiamo. Una parola «specifica» (un concorrente, la nostra
// insegna, una storpiatura) su un'altra campagna non ha senso: intercetta
// gente che cercava un'altra cosa, e il danno si propaga a tutte le campagne
// dove la si copia (regola dei Definitivi, lib/proposte-ai.ts).
//
// Come sempre: nasce in coda, una operazione per campagna, e parte solo dopo
// l'approvazione. Livello L1 — aggiungere una keyword è leggero, ma non è L0.
export async function applicaKeywordAdAltreCampagne(fd: FormData) {
  const parola = testo(fd, "testo");
  const ritorno = testo(fd, "ritorno") ?? "/keywords";
  const corrispondenza = testo(fd, "corrispondenza") ?? "broad";
  const destinazioni = fd
    .getAll("campagne")
    .map((v) => String(v))
    .filter(Boolean);

  if (!parola || destinazioni.length === 0) {
    redirect(
      `${ritorno}${ritorno.includes("?") ? "&" : "?"}bloccata=${encodeURIComponent(
        "Serve la parola e almeno una campagna di destinazione"
      )}`
    );
  }

  const pulito = testoKeywordPulito(parola);
  const campagne = await prisma.campagna.findMany({
    where: { id: { in: destinazioni } },
    include: { incidenti: { where: { stato: "aperto" }, select: { codice: true } } },
  });

  const fatte: string[] = [];
  const saltate: string[] = [];

  for (const c of campagne) {
    // Il freeze da incidente vale anche qui: su una campagna congelata non
    // entra in coda nemmeno un'aggiunta.
    if (c.incidenti.length > 0) {
      saltate.push(`${c.nome} (freeze ${c.incidenti[0].codice})`);
      continue;
    }

    // Se la parola c'è già in quella campagna non si riaccoda: succede
    // spuntando una campagna che la aveva già, e in coda comparirebbe
    // un'aggiunta che Google rifiuterebbe come duplicata.
    const gia = await prisma.copyAnnuncio.findFirst({
      where: { tipo: "keyword", campagna: c.nome, testo: { contains: pulito } },
      select: { id: true },
    });
    if (gia) {
      saltate.push(`${c.nome} (ce l'ha già)`);
      continue;
    }

    await prisma.operazioneAdv.create({
      data: {
        tipo: "nuova_keyword",
        canale: c.canale,
        bersaglio: c.nome,
        idEsterno: c.idEsterno,
        parametri: JSON.stringify({ testo: pulito, corrispondenza }),
        motivo: `Portata da un'altra campagna: funzionava lì`,
        livello: "L1",
        prima: "assente",
        campagnaId: c.id,
      },
    });
    fatte.push(c.nome);
  }

  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    titolo: `«${pulito}» in coda su ${fatte.length} campagne`,
    dettaglio:
      (fatte.length > 0 ? fatte.join(" · ") : "nessuna") +
      (saltate.length > 0 ? ` · saltate: ${saltate.join(", ")}` : ""),
  });

  // ⚠️ Prima qui c'era `redirect("/operazioni")` e basta. Se tutte le campagne
  // scelte venivano saltate — la parola c'era già, o la campagna è congelata —
  // l'utente atterrava su una pagina dove non era comparso niente di nuovo e
  // nessuno gli diceva perché: dal di fuori è un bottone che non funziona.
  // Le saltate finivano solo nello storico, che non è dove uno guarda.
  const messaggio =
    fatte.length > 0
      ? `«${pulito}» messa in coda su ${fatte.length} campagn${fatte.length === 1 ? "a" : "e"}: ${fatte.join(" · ")}`
      : `«${pulito}» non è entrata in coda su nessuna campagna`;
  const qs = new URLSearchParams({ esito: messaggio });
  if (saltate.length > 0) qs.set("saltate", saltate.join(" · "));
  redirect(`/operazioni?${qs.toString()}`);
}

// ---------- Cambiare la corrispondenza di un'operazione in coda ----------
// Si guarda la coda, si vede una negativa GENERICA in rosso e si vuole
// stringerla: senza questo bisognava annullare e rifare, perdendo il motivo
// e la posizione. La corrispondenza è l'unica cosa che ha senso ritoccare
// prima dell'esecuzione — il resto (quale parola, su quale campagna) è la
// decisione stessa, e cambiarla vorrebbe dire un'altra operazione.
export async function cambiaCorrispondenzaOperazione(fd: FormData) {
  const id = testo(fd, "id");
  const corrispondenza = testo(fd, "corrispondenza");
  if (!id || !corrispondenza) return;
  if (!["exact", "phrase", "broad"].includes(corrispondenza)) return;

  const op = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!op) return;
  // Una volta eseguita è storia: si cambia su Google, non qui.
  if (op.stato !== "in_attesa" && op.stato !== "approvata") return;

  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(op.parametri ?? "{}");
  } catch {
    p = {};
  }
  const prima = String(p.corrispondenza ?? "—");
  p.corrispondenza = corrispondenza;

  await prisma.operazioneAdv.update({
    where: { id },
    data: { parametri: JSON.stringify(p) },
  });

  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: `Corrispondenza di «${String(p.testo ?? op.bersaglio)}»: ${prima} → ${corrispondenza}`,
    dettaglio:
      corrispondenza === "broad"
        ? "Attenzione: la generica blocca ogni ricerca che contenga queste parole in qualsiasi ordine"
        : null,
  });
  revalidatePath("/operazioni");
}
