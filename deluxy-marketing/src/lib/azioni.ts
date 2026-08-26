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
import { accodaOperazione } from "./operazioni";
import { BRANDS, STATI_AZIONE, STATI_AZIONE_APERTI, STATI_CAMPAGNA, STATI_CAMPAGNA_NOSTRI, testoKeywordPulito } from "./dominio";
import { CHIAVE_APIKEY, CHIAVE_CARTELLA, idCartellaDrive, sincronizzaDrive } from "./drive";
import { elaboraAnalisi, mappaCampagneCitate, operazioneDaProposta, proposteDi, riconciliaAnalisi, schedaDi } from "./scheda-analisi";
import { risolviLocalita } from "./geo-target";
// Statico e non `await import()` come il resto di guardrail: serve dentro le
// query, non dentro il corpo delle funzioni. `guardrail.ts` non importa nulla,
// nessun rischio di ciclo.
import { MODIFICHE_CHE_PESANO } from "./guardrail";

// Dove mandare dopo aver messo qualcosa in coda, con l'esito scritto.
// Gli avvisi viaggiano DUE volte apposta: qui, per chi ha appena premuto, e
// sulla riga dell'operazione, per chi approverà — che può essere un'altra
// persona un altro giorno, e quel messaggio nell'URL non lo vedrà mai.
function esitoInCoda(cosa: string, avvisi: string[], torna?: string | null) {
  const qs = new URLSearchParams({ esito: `In coda, da approvare: ${cosa}` });
  if (avvisi.length > 0) qs.set("avvisi", avvisi.join(" · "));
  // ⚠️ DA DOVE si veniva. Senza, dopo aver approvato si restava su
  // /operazioni e la strada indietro andava rifatta a memoria — campagna,
  // gruppo, filtro. Il ritorno viaggia con l'esito e diventa un bottone.
  if (torna) qs.set("torna", torna);
  return `/operazioni?${qs.toString()}`;
}
import { registra } from "./registro";
import { CATEGORIE_ORDINE, LINGUE_CAMPAGNA, linguaDaNome, NEGOZI_ORDINE } from "./vendite-campagna";
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

// Le due strade opposte del cambio di stato, e perché non sono la stessa cosa.
//
// ⚠️ **Un bottone che sembra agire e invece annota.** Fino al 09/08/2026
// portare una campagna a «in pausa» scriveva `Campagna.stato` e generava un
// PROMEMORIA che nessuno eseguiva: su Google la campagna restava accesa e
// continuava a spendere. Misurato su `[Deluxy] Catering Milan B2B`: nell'app
// `in_pausa`, su Google `ENABLED`, zero operazioni in coda.
//
// E c'era un secondo giro di vite: `in_pausa` non è fra gli
// `STATI_CAMPAGNA_NOSTRI`, quindi al primo import successivo Google riscriveva
// «attiva». La pausa non fermava Google **e non restava nemmeno nell'app**.
//
// Adesso:
//   · `in_pausa` / `attiva`  → MESSA IN CODA (`pausa_campagna`/`attiva_campagna`),
//     approvazione a mano, e la esegue lo script. Lo stato dell'app NON si
//     tocca: quello è un fatto di Google, e scriverlo prima che accada sarebbe
//     di nuovo raccontare una cosa per un'altra.
//   · `bozza` / `in_lancio` / `defunta` → restano scelte NOSTRE, si scrivono e
//     basta: l'import non le tocca (sono `STATI_CAMPAGNA_NOSTRI`).
//   · `conclusa` → resta il promemoria: eliminare una campagna non è fra le
//     operazioni che lo script sa fare, e fingere il contrario sarebbe lo
//     stesso difetto di prima.
const STATI_DA_ESEGUIRE: Record<string, "pausa_campagna" | "attiva_campagna"> = {
  in_pausa: "pausa_campagna",
  attiva: "attiva_campagna",
};

export async function cambiaStatoCampagna(stato: string, fd: FormData) {
  const id = testo(fd, "id");
  if (!id || !stato || !(STATI_CAMPAGNA as readonly string[]).includes(stato)) return;
  const prima = await prisma.campagna.findUnique({ where: { id } });
  if (!prima) return;

  const daEseguire = STATI_DA_ESEGUIRE[stato];

  // ——— Gli stati che vivono su Google: si passa dalla coda ———
  if (daEseguire) {
    // Una sola in volo per volta: due pause della stessa campagna in coda
    // sarebbero la seconda un doppione che lo script rifà a vuoto.
    const inVolo = await prisma.operazioneAdv.findFirst({
      where: { campagnaId: id, tipo: daEseguire, stato: { in: ["in_attesa", "approvata"] } },
    });
    if (inVolo) {
      redirect(
        `/campagne/${id}?bloccata=${encodeURIComponent(
          `C'è già un'operazione «${daEseguire}» in coda per questa campagna: approvala in Operazioni invece di rifarla.`
        )}`
      );
    }

    const { validaModifica } = await import("./guardrail");
    const esito = validaModifica({
      classe: prima.classe,
      livello: "L2",
      deltaBudgetPct: null,
      rollbackPiano: null,
      ultimaModifica: null,
      l2Settimana: 0,
    });

    const op = await accodaOperazione({
      data: {
        tipo: daEseguire,
        canale: prima.canale,
        bersaglio: prima.nome,
        idEsterno: prima.idEsterno,
        motivo: "Deciso dalle pillole di stato sulla scheda campagna",
        avvisi: esito.avvisi.length > 0 ? esito.avvisi.join(" · ") : null,
        livello: "L2",
        prima: `su Google: ${prima.statoPiattaforma ?? "non ancora letto"}`,
        campagnaId: id,
      },
    });
    await registra({
      autore: "utente",
      tipo: "creazione",
      entita: "operazione",
      entitaId: op.id,
      titolo: `In coda (da approvare): ${daEseguire} su "${prima.nome}"`,
      dettaglio: esito.avvisi.join(" — "),
    });
    // ⚠️ Si dice CHIARAMENTE che finché non si approva su Google non cambia
    // niente: è tutta la differenza fra questo bottone e quello di prima.
    const verbo = stato === "in_pausa" ? "messa in pausa" : "riattivata";
    redirect(
      `/operazioni?esito=${encodeURIComponent(
        `«${prima.nome}» sarà ${verbo} su Google dopo l'approvazione. Fino ad allora su Google resta ${
          prima.statoPiattaforma ?? "com'era"
        }.`
      )}`
    );
  }

  // ——— Gli stati che sono solo nostri: si scrivono e basta ———
  if (prima.stato === stato) return;
  const campagna = await prisma.campagna.update({ where: { id }, data: { stato } });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "campagna",
    entitaId: id,
    titolo: `Campagna "${campagna.nome}" → ${stato}`,
  });

  if (stato === "in_lancio") {
    await prisma.azione.create({
      data: {
        titolo: `Far partire "${campagna.nome}"`,
        descrizione: `Deciso dall'app Marketing il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}: la campagna è pronta e va fatta partire.`,
        brand: campagna.brand,
        canale: campagna.canale,
        priorita: "alta",
        owner: "utente",
        campagnaId: campagna.id,
        eventi: { create: { tipo: "creazione", autore: "sistema", testo: "Generata dal passaggio a «in lancio»" } },
      },
    });
  } else if (stato === "conclusa") {
    // Eliminare una campagna non è fra le operazioni dello script: resta un
    // lavoro da fare a mano, e lo si dice invece di far finta.
    await prisma.azione.create({
      data: {
        titolo: `Eseguire su ${campagna.canale === "meta_ads" ? "Meta" : "Google Ads"}: concludere "${campagna.nome}"`,
        descrizione: `Deciso dall'app Marketing il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}. ⚠️ Concludere una campagna NON è fra le operazioni che lo script sa eseguire: va fatto in interfaccia. Al termine chiudere questa azione con l'esito reale.`,
        brand: campagna.brand,
        canale: campagna.canale,
        priorita: "alta",
        owner: "utente",
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

// La lingua da sola, dal titolo della campagna: è la cosa che si corregge più
// spesso e stava in fondo a un blocco richiuso.
//
// ⚠️ **Si riparte dal legame che c'è già.** Quando `origine = "manuale"` la
// scheda prende il legame per intero e non deduce più niente: scrivere qui la
// sola lingua cancellerebbe prodotto, città e negozio, e l'attribuzione delle
// vendite si spegnerebbe di colpo. Si legge il legame corrente — dedotto o
// manuale che sia — e si cambia solo la lingua.
export async function impostaLinguaCampagna(campagnaId: string, fd: FormData) {
  if (!campagnaId) return;
  // ⚠️ PIÙ lingue: una campagna può servire davvero due pubblici. Si salvano
  // separate da virgola, e l'ordine non conta — per questo il confronto più
  // sotto ordina prima di decidere se è cambiato qualcosa.
  //
  // ⚠️ La lingua VERA di quello che si compra sta sul GRUPPO di annunci: qui
  // si dichiara a chi vende la campagna nel suo insieme, e serve solo a
  // tagliare il venduto di contesto per paese.
  const scelte = fd
    .getAll("lingua")
    .map((v) => String(v))
    .filter((v) => (LINGUE_CAMPAGNA as readonly string[]).includes(v));
  const lingua = scelte.length > 0 ? [...new Set(scelte)].sort().join(",") : null;

  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    select: { id: true, nome: true, brand: true },
  });
  if (!campagna) return;

  const { legameDiCampagna } = await import("./vendite-campagna");
  const { legame } = await legameDiCampagna(campagna);
  const comeSta = legame.lingua ? [...new Set(legame.lingua.split(","))].sort().join(",") : null;
  if (comeSta === lingua) return;

  const dati = {
    categoria: legame.categoria,
    negozio: legame.negozio,
    citta: legame.citta,
    lingua,
    origine: "manuale",
    motivo: "lingua scelta a mano dal titolo della campagna",
  };
  await prisma.legameCampagnaShopify.upsert({
    where: { campagnaId },
    create: { campagnaId, ...dati },
    update: dati,
  });
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "campagna",
    entitaId: campagnaId,
    titolo: `Lingue di "${campagna.nome}": ${lingua ?? "non dichiarate"}`,
    dettaglio: "scelta dal titolo della campagna; l'attribuzione delle vendite la legge da qui",
  });
  revalidatePath(`/campagne/${campagnaId}`);
  revalidatePath("/keywords");
  // ⚠️ `revalidatePath` da solo non basta QUI: i numeri sotto si aggiornavano
  // (il blocco vendite li rilegge) ma il menù in testa tornava a mostrare
  // «lingua non dichiarata» finché non si ricaricava a mano — cioè l'esatto
  // aspetto di un salvataggio non riuscito, su un salvataggio riuscito.
  // Il ritorno esplicito rirende la pagina intera e il menù segue il dato.
  redirect(testo(fd, "ritorno") || `/campagne/${campagnaId}`);
}

// Torna alla deduzione dal nome: cancella la riga, il prossimo caricamento
// della scheda la ricrea leggendo il nome della campagna.
export async function ripristinaLegameShopify(campagnaId: string) {
  if (!campagnaId) return;
  await prisma.legameCampagnaShopify.deleteMany({ where: { campagnaId } });
  revalidatePath(`/campagne/${campagnaId}`);
}

// ---------- Scheda delle analisi ----------

// Il bottone «Elabora la scheda» su /analisi/[id]: legge il documento da
// Drive, lo passa all'AI e salva la scheda strutturata. Rilanciarlo su
// un'analisi già elaborata la RIFÀ — è voluto: il documento su Drive può
// essere cambiato, e il modello anche.
export async function elaboraSchedaAnalisi(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const esito = await elaboraAnalisi(id);
  await registra({
    autore: "utente",
    tipo: "sync",
    entita: "analisi",
    entitaId: id,
    titolo: esito.ok ? "Scheda dell'analisi elaborata" : "Elaborazione della scheda FALLITA",
    dettaglio: esito.ok
      ? `verdetto ${esito.verdetto} · ${esito.kpi} KPI · ${esito.findings} findings · ${esito.campagne} campagne citate`
      : esito.errore,
  });
  revalidatePath(`/analisi/${id}`);
  revalidatePath("/analisi");
  redirect(`/analisi/${id}${esito.ok ? "" : `?scheda=fallita&errore=${encodeURIComponent(esito.errore.slice(0, 200))}`}`);
}

// Il bottone «Metti in coda» su un'azione della scheda: la proposta dell'AI
// diventa un'operazione DA APPROVARE — la stessa catena delle PropostaAi
// (app → coda → approvazione → script), nessuna scorciatoia. Il codice
// riverifica tutto: la mappa dell'AI non è un permesso.
export async function accodaAzioneScheda(fd: FormData) {
  const analisiId = String(fd.get("analisi") ?? "");
  const indice = Number(fd.get("indice"));
  // Quale delle proposte dell'azione: un'azione può tradursi in più
  // operazioni (una per campagna), e il bottone dice quale.
  const quale = Number(fd.get("op") ?? 0);
  if (!analisiId || !Number.isInteger(indice) || indice < 0) return;

  const analisi = await prisma.analisi.findUnique({ where: { id: analisiId } });
  if (!analisi) return;
  const scheda = schedaDi(analisi);
  const azione = scheda?.azioni[indice];
  const proposta = azione ? proposteDi(azione)[quale] : undefined;
  if (!scheda || !azione || !proposta) return;

  // L'aggancio alla campagna VERA, con la regola di sempre: l'ambiguo non si
  // aggancia. E il canale è quello della campagna, non dell'analisi.
  const agganci = await mappaCampagneCitate([proposta.campagna], {
    brand: analisi.brand,
    canale: analisi.canale,
  });
  const aggancio = agganci.get(proposta.campagna);
  if (!aggancio) {
    redirect(`/analisi/${analisiId}?coda=fallita&errore=${encodeURIComponent(`Campagna «${proposta.campagna}» non agganciabile senza ambiguità: si accoda da /operazioni a mano.`)}`);
  }
  const campagna = await prisma.campagna.findUnique({
    where: { id: aggancio.id },
    select: { id: true, nome: true, canale: true, account: true },
  });
  if (!campagna) return;

  const pronta = operazioneDaProposta(proposta, campagna.canale);
  if (!pronta) {
    redirect(`/analisi/${analisiId}?coda=fallita&errore=${encodeURIComponent("Questa proposta non passa la revisione del codice: parametri incompleti o tipo non eseguibile sul canale.")}`);
  }

  const operazione = await accodaOperazione({
    data: {
      tipo: pronta.tipo,
      canale: campagna.canale,
      account: campagna.account,
      bersaglio: campagna.nome,
      parametri: pronta.parametri ? JSON.stringify(pronta.parametri) : null,
      motivo: `Dall'analisi «${analisi.titolo}»${azione.codice ? ` (${azione.codice})` : ""}: ${azione.testo.slice(0, 300)}`,
      campagnaId: campagna.id,
      richiestaDa: "utente",
    },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    entitaId: operazione.id,
    titolo: `In coda dall'analisi: ${pronta.tipo} su ${campagna.nome}`,
    dettaglio: operazione.motivo,
  });
  revalidatePath(`/analisi/${analisiId}`);
  revalidatePath("/operazioni");
  redirect(`/operazioni?torna=${encodeURIComponent(`/analisi/${analisiId}`)}`);
}

// Il bottone «Riconcilia adesso»: rifà l'incrocio scheda ↔ coda operazioni.
export async function riconciliaSchedaAnalisi(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const esito = await riconciliaAnalisi(id);
  await registra({
    autore: "utente",
    tipo: "sync",
    entita: "analisi",
    entitaId: id,
    titolo: esito.ok ? "Azioni dell'analisi riconciliate con la coda" : "Riconciliazione FALLITA",
    dettaglio: esito.ok
      ? `${esito.fatte} fatte · ${esito.inCorso} in corso · ${esito.fallite} fallite`
      : esito.errore,
  });
  revalidatePath(`/analisi/${id}`);
  redirect(`/analisi/${id}${esito.ok ? "" : `?coda=fallita&errore=${encodeURIComponent(esito.errore.slice(0, 200))}`}`);
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

/**
 * Rimette in coda una campagna «eseguita» che Google ha in realtà RIFIUTATO.
 *
 * ⚠️ `riapriOperazione` esclude apposta le eseguite, ed è giusto: rifare
 * un'operazione andata a buon fine vorrebbe dire una seconda campagna, una
 * seconda negativa, una seconda keyword. Qui l'eccezione è ammessa **solo
 * perché si può dimostrare che la campagna non esiste**, e i controlli sono gli
 * stessi che disegnano l'avviso:
 *   1. è una `nuova_campagna` eseguita;
 *   2. la campagna nell'app non ha né `idEsterno` né `statoPiattaforma`, cioè
 *      Google non l'ha mai nominata;
 *   3. dopo il lancio è arrivata almeno un'ANAGRAFICA di quell'account — il
 *      giro che manda TUTTE le campagne, comprese le ferme — e lei non c'era.
 * Se anche uno solo dei tre non regge, non si tocca niente: il dubbio non
 * autorizza a riscrivere su un account pubblicitario vero.
 */
export async function rilanciaCampagnaRifiutata(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!op || op.tipo !== "nuova_campagna" || op.stato !== "eseguita" || !op.campagnaId || !op.account) return;

  const campagna = await prisma.campagna.findUnique({
    where: { id: op.campagnaId },
    select: { idEsterno: true, statoPiattaforma: true, nome: true },
  });
  if (!campagna || campagna.idEsterno || campagna.statoPiattaforma) return;

  const anagrafiche = await prisma.ricezioneDati.count({
    where: {
      fonte: "google_ads",
      account: op.account,
      tipo: "anagrafica",
      ricevutoIl: { gt: op.eseguitaIl ?? op.creataIl },
    },
  });
  if (anagrafiche === 0) return; // troppo presto: il caricamento è asincrono

  await prisma.operazioneAdv.update({
    where: { id },
    data: { stato: "in_attesa", approvataDa: null, approvataIl: null, eseguitaIl: null, esito: null },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: `Rimessa in coda: campagna "${campagna.nome}" rifiutata da Google`,
    dettaglio:
      `Il caricamento risultava eseguito ma l'account ${op.account} ha rimandato l'elenco delle campagne ` +
      `${anagrafiche} volte senza nominarla. Torna fra quelle da approvare.`,
  });
  revalidatePath("/operazioni");
  redirect("/operazioni");
}

/**
 * Riprova un COMPLETAMENTO di campagna riuscito solo a metà.
 *
 * ⚠️ Perché è un'eccezione, e perché qui è sicura. `riapriOperazione` esclude
 * apposta le eseguite: rifare un'operazione andata a buon fine vorrebbe dire
 * una seconda campagna, una seconda keyword, una seconda negativa. Il
 * completamento però è **l'unica operazione fatta per essere ripetibile**, e lo
 * è nello script, non per fiducia: le località già presenti le salta, il gruppo
 * lo riusa se c'è, le keyword già dentro le salta, e l'annuncio lo crea solo se
 * il gruppo non ne ha. Ripeterlo riprova **soltanto il pezzo che era fallito**.
 *
 * Nasce dal caso vero del 19/08/2026: sulla WORLD-ENG erano entrati 9 località,
 * il gruppo e 15 keyword, e l'annuncio era stato rifiutato per
 * `DESTINATION_NOT_WORKING`. Sistemata la landing non c'era **nessun modo**
 * nell'app di riprovare solo l'annuncio: bisognava rifare tutto il modulo di
 * lancio, che avrebbe creato una seconda campagna.
 *
 * ⚠️ Solo se l'esito dichiara un problema: un completamento andato tutto bene
 * non si ripete, non ci sarebbe niente da fare e il bottone confonderebbe.
 * ⚠️ E torna «da approvare», non approvata: scrive su Google, e la rete che
 * regge tutto il resto non si buca per comodità.
 */
export async function riprovaCompletamento(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!op || op.tipo !== "completa_campagna" || op.stato !== "eseguita") return;
  // Il controllo è ripetuto qui e non solo sul bottone: un bottone nascosto
  // non è una rete.
  if (!/ATTENZIONE|RIFIUTAT|non trovate|ambigu/i.test(op.esito ?? "")) return;

  await prisma.operazioneAdv.update({
    where: { id },
    data: {
      stato: "in_attesa",
      approvataDa: null,
      approvataIl: null,
      eseguitaIl: null,
      // ⚠️ L'esito vecchio si conserva nel motivo: è la ragione per cui si sta
      // riprovando, e buttarlo via renderebbe la riga incomprensibile fra un
      // mese. Il campo `esito` invece si svuota, perché il prossimo giro ne
      // scriverà uno nuovo e due esiti insieme sarebbero una bugia.
      esito: null,
      motivo:
        `${op.motivo ? op.motivo + " · " : ""}Riprovato il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}: ` +
        `il giro precedente aveva lasciato indietro qualcosa — ${(op.esito ?? "").slice(0, 400)}`,
    },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: `Completamento rimesso in coda: ${op.bersaglio}`,
    dettaglio:
      "Il completamento è ripetibile per costruzione: località già presenti, gruppo e keyword " +
      "già dentro vengono saltati, quindi riprova solo il pezzo che era fallito. Torna «da approvare».",
  });
  revalidatePath("/operazioni");
  redirect("/operazioni");
}

/**
 * «Lo so, è voluto»: chiude una divergenza fra l'app e Google **e allinea
 * l'app**, perché lo stato su Google è un fatto e quello dell'app un giudizio.
 *
 * ⚠️ NON tocca Google. Non è una modifica alla piattaforma, è una dichiarazione
 * su una modifica già fatta là da una persona: l'app smette di dire il
 * contrario e si mette d'accordo col fatto.
 *
 * ⚠️ Perché ALLINEA e non si limita a zittire l'avviso. Il caso vero (18/08):
 * quattro keyword risultavano `in_pausa` nell'app e su Google erogavano — le
 * aveva riattivate l'utente. Chiudere solo l'avviso avrebbe lasciato l'app a
 * dire «in pausa» di parole che spendono, cioè avrebbe scambiato un avviso
 * fastidioso con una bugia silenziosa. Vale la stessa regola del pallino di
 * stato sui gruppi: comanda il fatto, il giudizio gli va dietro.
 */
export async function accettaDivergenza(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!op || op.stato !== "eseguita" || op.divergenzaAccettataIl) return;

  const motivo = testo(fd, "motivo") ?? null;
  let allineato = "";

  // Le keyword: lo stato dell'app segue quello di Google, riga per riga.
  if (op.tipo === "pausa_keyword" || op.tipo === "attiva_keyword" || op.tipo === "nuova_keyword") {
    const campagna = op.campagnaId
      ? await prisma.campagna.findUnique({ where: { id: op.campagnaId }, select: { nome: true } })
      : null;
    const p = op.parametri ? (JSON.parse(op.parametri) as Record<string, unknown>) : {};
    const pulito = testoKeywordPulito(String(p.testo ?? op.bersaglio ?? ""));
    if (campagna && pulito) {
      const righe = await prisma.copyAnnuncio.findMany({
        where: { tipo: "keyword", campagna: campagna.nome, testo: { startsWith: pulito, mode: "insensitive" } },
        select: { id: true, testo: true, statoPiattaforma: true, stato: true },
      });
      // ⚠️ Il confine di parola: «flowers milan» non deve prendersi dietro
      // «flowers milano», che è un altro criterio con un altro stato.
      const sue = righe.filter((r) => {
        const t = r.testo.toLowerCase();
        const w = pulito.toLowerCase();
        return t === w || t.startsWith(w + " (");
      });
      let n = 0;
      for (const r of sue) {
        const nuovo = r.statoPiattaforma === "PAUSED" ? "in_pausa" : r.statoPiattaforma === "ENABLED" ? "attiva" : null;
        if (!nuovo || nuovo === r.stato) continue;
        await prisma.copyAnnuncio.update({ where: { id: r.id }, data: { stato: nuovo } });
        n++;
      }
      if (n > 0) allineato = ` L'app è stata allineata a Google su ${n} ${n === 1 ? "criterio" : "criteri"}.`;
    }
  }

  // Campagne e gruppi: stessa idea, il fatto comanda.
  if ((op.tipo === "pausa_campagna" || op.tipo === "attiva_campagna") && op.campagnaId) {
    const c = await prisma.campagna.findUnique({ where: { id: op.campagnaId }, select: { statoPiattaforma: true, stato: true } });
    const nuovo = c?.statoPiattaforma === "PAUSED" ? "in_pausa" : c?.statoPiattaforma === "ENABLED" ? "attiva" : null;
    // ⚠️ Gli stati NOSTRI (defunta, bozza, in_lancio) non si toccano: sono
    // decisioni dell'app che non hanno un gemello su Google.
    if (nuovo && c && nuovo !== c.stato && !(STATI_CAMPAGNA_NOSTRI as readonly string[]).includes(c.stato)) {
      await prisma.campagna.update({ where: { id: op.campagnaId }, data: { stato: nuovo } });
      allineato = " Lo stato della campagna nell'app è stato allineato a Google.";
    }
  }
  if ((op.tipo === "pausa_gruppo" || op.tipo === "attiva_gruppo") && op.gruppoId) {
    const g = await prisma.gruppo.findUnique({ where: { id: op.gruppoId }, select: { statoPiattaforma: true, stato: true } });
    const nuovo = g?.statoPiattaforma === "PAUSED" ? "in_pausa" : g?.statoPiattaforma === "ENABLED" ? "attivo" : null;
    if (nuovo && g && nuovo !== g.stato) {
      await prisma.gruppo.update({ where: { id: op.gruppoId }, data: { stato: nuovo } });
      allineato = " Lo stato del gruppo nell'app è stato allineato a Google.";
    }
  }

  await prisma.operazioneAdv.update({
    where: { id },
    data: {
      divergenzaAccettataIl: new Date(),
      divergenzaAccettataDa: "utente",
      divergenzaMotivo: motivo,
    },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: `Divergenza dichiarata VOLUTA: ${op.tipo} su ${op.bersaglio}`,
    dettaglio:
      "Google riporta qualcosa di diverso da quello che diceva l'app, ed è una decisione presa in Google Ads." +
      allineato +
      (motivo ? ` Motivo: ${motivo}` : ""),
  });
  revalidatePath("/operazioni");
  redirect("/operazioni");
}

// ---------- Landing ----------

/**
 * Registra in blocco le landing scelte dal censimento (`/landing/censimento`).
 *
 * Le URL arrivano già normalizzate dal censimento; brand e lingua viaggiano
 * accanto perché il censimento li ha ricavati dalle CAMPAGNE che ci mandano —
 * un fatto — e ricavarli di nuovo qui dal solo testo della URL vorrebbe dire
 * buttare via l'informazione migliore per usarne una peggiore.
 *
 * ⚠️ `upsert` e non `create`: fra il caricamento della pagina e il click una
 * URL può essere stata registrata da un'altra parte, e far fallire l'intero
 * blocco per una riga già presente sarebbe il comportamento peggiore. Chi
 * c'era già non viene toccato — un `update` sovrascriverebbe scopo, stato e
 * scorecard messi a mano con dei valori dedotti.
 */
export async function registraLandingDalCensimento(fd: FormData) {
  const scelte = fd.getAll("scelte").map((v) => String(v)).filter(Boolean);
  if (scelte.length === 0) redirect("/landing/censimento?esito=nessuna");

  const meta = new Map<string, { brand: string; lingua: string | null }>();
  for (const s of scelte) {
    meta.set(s, {
      brand: String(fd.get(`brand:${s}`) ?? "cross"),
      lingua: (fd.get(`lingua:${s}`) ? String(fd.get(`lingua:${s}`)) : null) || null,
    });
  }

  let create = 0;
  for (const url of scelte) {
    const m = meta.get(url)!;
    const prima = await prisma.landingPage.findUnique({ where: { url }, select: { id: true } });
    if (prima) continue;
    await prisma.landingPage.create({
      data: {
        url,
        brand: m.brand,
        lingua: m.lingua,
        // ⚠️ «da_verificare», non «attiva»: che ci arrivi un annuncio dice che
        // la pagina è in uso, non che sia giusta. Lo stato «attiva» è un
        // giudizio che qualcuno deve dare guardandola.
        stato: "da_verificare",
        note: "Censita dalle destinazioni degli annunci letti da Google.",
      },
    });
    create++;
  }

  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "landing",
    titolo: `Censite ${create} landing dalle destinazioni degli annunci`,
    dettaglio: `${scelte.length} selezionate · ${create} nuove · ${scelte.length - create} già presenti`,
  });
  revalidatePath("/landing");
  redirect(`/landing/censimento?esito=${create}`);
}

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
  const stato = testo(fd, "stato");
  const ritorno = testo(fd, "ritorno");
  let testoKeyword = testo(fd, "keyword");
  // ⚠️ Dalla scheda gruppo arriva l'ID della riga, non il testo: senza questo
  // ramo l'azione usciva in silenzio e il selettore di stato del gruppo NON
  // HA MAI SALVATO NIENTE — scoperto il 10/08 provando «defunta». Si risale
  // al testo e si applica per PAROLA su tutte le campagne, come da /keywords:
  // lo stato di una keyword è un giudizio sulla parola, non su una copia.
  if (!testoKeyword) {
    const id = testo(fd, "id");
    if (id) {
      const riga = await prisma.copyAnnuncio.findUnique({ where: { id }, select: { testo: true } });
      testoKeyword = riga?.testo ?? null;
    }
  }
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
    dettaglio: righe.length > 1 ? `applicato a ${righe.length} righe` : null,
  });
  revalidatePath("/keywords");
  // Il redirect esplicito, non solo revalidate: un <select> controllato che
  // non vede la pagina nuova torna al valore vecchio e sembra non salvare
  // (trappola già pagata due volte, 06/08 e 08/08).
  if (ritorno) {
    revalidatePath(ritorno.split("?")[0]);
    redirect(ritorno);
  }
}

// Lo stato a PIÙ keyword in un colpo: si spuntano le caselle (le stesse di
// «Escludi le selezionate») e si applica. Per PAROLA su tutte le campagne,
// lo stesso metro del cambio singolo — e con «defunta» un gruppo di parole
// morte sparisce in un gesto invece che in cinquanta.
export async function cambiaStatoKeywordSelezionate(fd: FormData) {
  const ritorno = testo(fd, "ritorno") ?? "/keywords";
  const statoNuovo = testo(fd, "statoNuovo");
  const scelte = fd
    .getAll("scelte")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!statoNuovo || scelte.length === 0) {
    redirect(
      `${ritorno}${ritorno.includes("?") ? "&" : "?"}bloccata=${encodeURIComponent(
        !statoNuovo
          ? "Scegli quale stato applicare alle keyword selezionate"
          : "Nessuna keyword selezionata"
      )}`
    );
  }

  // ⚠️ SOLO le righe che si stanno guardando, quando il form dichiara il
  // contesto (campagna e gruppo). Il cambio SINGOLO vale per parola su tutte
  // le campagne — è un giudizio sulla parola — ma in blocco su cinquanta
  // parole quella regola diventa una falciata invisibile: l'11/08 «defunta»
  // sulle sole in pausa di un gruppo ha marcato 168 righe, di cui 53 ATTIVE
  // su Google e sparse su nove campagne. Chi spunta cinquanta caselle si
  // aspetta di agire su quelle cinquanta.
  const nomeCampagna = testo(fd, "campagnaNome");
  const nomeGruppo = testo(fd, "gruppoNome");
  const esito = await prisma.copyAnnuncio.updateMany({
    where: {
      tipo: "keyword",
      testo: { in: scelte },
      ...(nomeCampagna ? { campagna: nomeCampagna } : {}),
      ...(nomeGruppo ? { gruppo: { contains: nomeGruppo } } : {}),
    },
    data: { stato: statoNuovo! },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "copy",
    titolo: `${scelte.length} keyword → ${statoNuovo}${nomeGruppo ? ` (gruppo ${nomeGruppo})` : ""}`,
    dettaglio:
      scelte.slice(0, 8).map((t) => `«${t}»`).join(" · ") +
      (scelte.length > 8 ? ` e altre ${scelte.length - 8}` : "") +
      ` · ${esito.count} righe toccate`,
  });
  revalidatePath("/keywords");
  revalidatePath(ritorno.split("?")[0]);
  redirect(ritorno);
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
    // ⚠️ Anche COSA era: l'avviso deve poterla nominare, o chi legge se la va
    // a cercare nello storico (o non se la cerca affatto).
    ultimaModificaVoce: campagna.modifiche[0] ?? null,
  });
  // Il change control non rifiuta più (04/08/2026): quello che avrebbe detto
  // resta scritto nello storico accanto alla modifica, così fra un mese si sa
  // che era stata fatta *sapendo* l'impatto — e non per distrazione.
  if (esito.avvisi.length > 0) {
    await registra({
      autore: "utente", tipo: "modifica", entita: "campagna", entitaId: campagnaId,
      titolo: `Modifica con avvisi del change control su "${campagna.nome}"`,
      dettaglio: esito.avvisi.join(" · "),
    });
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
  // ⚠️ `revalidatePath` NON basta, ed è la TERZA volta che costa un giro a
  // vuoto (lingua campagna 06/08, corrispondenza operazione 08/08, rinomina
  // e stato gruppo 09/08). Il salvataggio funziona, ma chi guarda non vede
  // cambiare niente — il <dialog> resta aperto sopra la pagina, o il <select>
  // controllato torna al valore di prima — e conclude che il bottone non
  // faccia nulla. Serve il ritorno esplicito, che ricarica davvero.
  redirect(`/campagne/${id}`);
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
        eventi: { create: { tipo: "creazione", autore: "sistema", testo: `Generata dall'occasione "${nome}" (${data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })})` } },
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
  // Da dove si veniva: si conserva nel redirect, cosi il bottone «torna
  // dove eri» resta anche dopo il click che lo rendeva utile.
  const torna = testo(fd, "torna");
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.update({
    where: { id },
    data: { stato: "approvata", approvataIl: new Date(), approvataDa: "utente" },
  });
  await registra({
    autore: "utente", tipo: "stato", entita: "operazione", entitaId: id,
    titolo: `Approvata: ${op.tipo} su ${op.bersaglio}`,
    // ⚠️ Su META non passa nessuno script: esegue l'app, e solo quando
    //    qualcuno preme «Esegui adesso» in Operazioni. Dire «alla prossima
    //    passata» anche li vorrebbe dire promettere un automatismo che non
    //    esiste, e lasciare l'operazione ferma per giorni ad aspettare un
    //    motore che non partira' mai.
    dettaglio:
      op.canale === "meta_ads"
        ? "Su Meta non c'e nessuno script: esegue l'app quando premi «Esegui adesso» in Operazioni."
        : "Lo script la eseguira alla prossima passata",
  });
  revalidatePath("/operazioni");
  if (torna) redirect(`/operazioni?torna=${encodeURIComponent(torna)}`);
}

// Approvare PIÙ operazioni insieme: si spuntano e si approva in un colpo.
//
// ⚠️ Restano intatte le tre cose che sono la rete vera: si approva solo ciò
// che è GIÀ in coda (nessuna operazione nasce qui), solo quelle spuntate a
// mano, e lo script le esegue comunque una per una riferendo l'esito di
// ognuna. Sparisce il click ripetuto trenta volte, non il controllo.
export async function approvaOperazioniSelezionate(fd: FormData) {
  const torna = testo(fd, "torna");
  const scelte = fd
    .getAll("scelte")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const coda = (extra: Record<string, string>) => {
    const qs = new URLSearchParams(extra);
    if (torna) qs.set("torna", torna);
    return `/operazioni?${qs.toString()}`;
  };
  if (scelte.length === 0) {
    redirect(coda({ bloccata: "Nessuna operazione selezionata" }));
  }

  // ⚠️ Solo quelle ANCORA in attesa: fra il caricamento della pagina e il
  // click qualcuno può averne approvata o annullata una, e riapprovare
  // un'annullata la resusciterebbe senza che nessuno l'abbia chiesto.
  const aperte = await prisma.operazioneAdv.findMany({
    where: { id: { in: scelte }, stato: "in_attesa" },
    select: { id: true, tipo: true, bersaglio: true },
  });
  if (aperte.length === 0) {
    redirect(coda({ bloccata: "Nessuna di quelle scelte era ancora da approvare" }));
  }

  await prisma.operazioneAdv.updateMany({
    where: { id: { in: aperte.map((o) => o.id) } },
    data: { stato: "approvata", approvataIl: new Date(), approvataDa: "utente" },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    titolo: `Approvate insieme: ${aperte.length} operazioni`,
    dettaglio:
      aperte.slice(0, 8).map((o) => `${o.tipo} su ${o.bersaglio}`).join(" · ") +
      (aperte.length > 8 ? ` e altre ${aperte.length - 8}` : "") +
      (scelte.length > aperte.length
        ? ` · ${scelte.length - aperte.length} non erano più da approvare`
        : ""),
  });

  revalidatePath("/operazioni");
  redirect(
    coda({
      esito: `${aperte.length} ${aperte.length === 1 ? "operazione approvata" : "operazioni approvate"}: lo script le eseguirà alla prossima passata`,
    })
  );
}

export async function annullaOperazione(fd: FormData) {
  // Da dove si veniva: si conserva nel redirect, cosi il bottone «torna
  // dove eri» resta anche dopo il click che lo rendeva utile.
  const torna = testo(fd, "torna");
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.update({ where: { id }, data: { stato: "annullata" } });
  await registra({
    autore: "utente", tipo: "stato", entita: "operazione", entitaId: id,
    titolo: `Annullata: ${op.tipo} su ${op.bersaglio}`,
  });
  revalidatePath("/operazioni");
  if (torna) redirect(`/operazioni?torna=${encodeURIComponent(torna)}`);
}

export async function creaOperazione(fd: FormData) {
  // Da dove si veniva: torna con l esito e diventa il bottone «torna indietro» su /operazioni.
  const ritorno = testo(fd, "ritorno");

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

  const { validaModifica, addBeforePause } = await import("./guardrail");
  const esito = validaModifica({
    classe: campagna.classe,
    livello,
    deltaBudgetPct: deltaPct,
    rollbackPiano: testo(fd, "rollbackPiano"),
    ultimaModifica: campagna.modifiche[0]?.eseguitaIl ?? null,
    // ⚠️ Anche COSA era: l'avviso deve poterla nominare, o chi legge se la va
    // a cercare nello storico (o non se la cerca affatto).
    ultimaModificaVoce: campagna.modifiche[0] ?? null,
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
  if (abp) esito.avvisi.push(abp);
  // Il freeze da incidente non ferma più: avvisa. Resta l'informazione che
  // conta — su questa campagna c'è un guasto aperto — e la decisione è di chi
  // approva, non del codice.
  if (campagna.incidenti.length > 0) {
    esito.avvisi.push(
      `Incidente ${campagna.incidenti[0].codice} APERTO su questa campagna: finché non è chiuso, quello che si misura qui è sporcato dal guasto.`
    );
  }

  const op = await accodaOperazione({
    data: {
      tipo,
      canale: campagna.canale,
      bersaglio: campagna.nome,
      idEsterno: campagna.idEsterno,
      parametri: budget != null ? JSON.stringify({ budget }) : null,
      motivo: testo(fd, "motivo"),
      avvisi: esito.avvisi.length > 0 ? esito.avvisi.join(" · ") : null,
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
    dettaglio: [op.motivo, op.avvisi].filter(Boolean).join(" — "),
  });
  redirect(esitoInCoda(`${tipo} su ${campagna.nome}`, esito.avvisi, ritorno));
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

  const avvisi: string[] = [];
  if (campagna.incidenti.length > 0) {
    avvisi.push(
      `Incidente ${campagna.incidenti[0].codice} APERTO su ${campagna.nome}: finché non è chiuso, quello che si misura qui è sporcato dal guasto.`
    );
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
    // ⚠️ Anche COSA era: l'avviso deve poterla nominare, o chi legge se la va
    // a cercare nello storico (o non se la cerca affatto).
    ultimaModificaVoce: campagna.modifiche[0] ?? null,
      l2Settimana,
    });
    avvisi.push(...esito.avvisi);
  }

  const op = await accodaOperazione({
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
      avvisi: avvisi.length > 0 ? avvisi.join(" · ") : null,
      livello,
      prima: tipo === "nuova_keyword" || tipo === "negativa" ? "assente" : "attiva",
      campagnaId,
    },
  });
  await registra({
    autore: "utente", tipo: "creazione", entita: "operazione", entitaId: op.id,
    titolo: `In coda (da approvare): ${tipo} "${kwTesto}" su ${campagna.nome}`,
    dettaglio: [op.motivo, op.avvisi].filter(Boolean).join(" — "),
  });
  redirect(esitoInCoda(`${tipo} «${kwTesto}» su ${campagna.nome}`, avvisi, ritorno));
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
// Porta qui una parola che funziona su un'altra campagna del brand, dalla
// tabella «quello che rende altrove e qui manca».
//
// `adattaA` è la città di questa campagna quando la parola ne nomina un'altra:
// «flower delivery milan» dentro Roma non serve a niente com'è — comprerebbe
// ricerche di chi vuole consegne a Milano — mentre riscritta è esattamente
// quella che manca. Se è `null` la parola si porta com'è.
export async function portaIdealeQui(campagnaId: string, testoOriginale: string, adattaA: string | null) {
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    select: { id: true, nome: true, canale: true, idEsterno: true },
  });
  if (!campagna) return;

  const pulito = testoKeywordPulito(testoOriginale);
  let finale = pulito;
  if (adattaA) {
    const { perAltraCitta } = await import("./nuova-campagna");
    const riscritto = perAltraCitta(pulito, adattaA);
    if (!riscritto) return;
    finale = riscritto;
  }

  const op = await accodaOperazione({
    data: {
      tipo: "nuova_keyword",
      canale: campagna.canale,
      bersaglio: campagna.nome,
      idEsterno: campagna.idEsterno,
      parametri: JSON.stringify({ testo: finale, corrispondenza: "broad" }),
      motivo: adattaA
        ? `Adattata da «${pulito}» per ${adattaA}: la parola rende su un'altra città e qui manca.`
        : `Portata da un'altra campagna del brand: funziona lì e qui manca.`,
      // ⚠️ La parola adattata non ha storia QUI: i numeri che l'hanno fatta
      // proporre sono dell'altra città. Chi approva deve saperlo.
      avvisi: adattaA
        ? `«${finale}» è riscritta da «${pulito}»: su questa città non ha nessun dato alle spalle, la somiglianza non è una misura.`
        : null,
      livello: "L1",
      prima: "assente",
      campagnaId,
    },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    entitaId: op.id,
    titolo: `In coda (da approvare): «${finale}» su ${campagna.nome}`,
    dettaglio: adattaA ? `Adattata da «${pulito}» per ${adattaA}` : `Portata da un'altra campagna`,
  });
  redirect(
    esitoInCoda(
      `«${finale}» su ${campagna.nome}`,
      adattaA
        ? [`«${finale}» è riscritta da «${pulito}»: su questa città non ha ancora nessun dato.`]
        : []
    )
  );
}


/**
 * Le ideali che mancano, portate qui PIU' D'UNA ALLA VOLTA.
 *
 * ⚠️ Perche' serviva: una parola per volta significa un giro di pagina, una
 * conferma e un ritorno per ognuna — con nove suggerimenti sono nove viaggi
 * per un gesto che si decide in blocco («queste sei si', queste tre no»).
 *
 * ⚠️ Ognuna resta un'OPERAZIONE SUA, non un lotto unico. Chi approva deve
 * poter dire si' a cinque e no a una, e se lo script ne sbaglia una le altre
 * non devono cadere con lei. Qui si risparmiano i clic, non i controlli.
 *
 * ⚠️ L'adattamento si RICALCOLA qui, non si prende dalla pagina: il bottone
 * mostra «Adatta: roma flowers», ma cio' che arriva dal browser e' solo la
 * parola d'origine. Ricalcolare vuol dire che la regola sta in un posto solo
 * (`perAltraCitta`) e che una pagina vecchia aperta in un'altra scheda non
 * puo' far entrare una riscrittura che oggi non faremmo piu'.
 */
export async function portaIdealiQui(campagnaId: string, citta: string | null, fd: FormData) {
  const scelte = fd.getAll("ideali").map(String).filter(Boolean);
  if (scelte.length === 0) return;

  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    select: { id: true, nome: true, canale: true, idEsterno: true },
  });
  if (!campagna) return;

  const { perAltraCitta } = await import("./nuova-campagna");
  const messe: string[] = [];
  const avvisi: string[] = [];

  for (const originale of scelte) {
    const pulito = testoKeywordPulito(originale);
    let finale = pulito;
    if (citta) {
      const riscritto = perAltraCitta(pulito, citta);
      // Se non e' riscrivibile si porta com'e': e' il caso delle parole che
      // non nominano nessuna citta', ed e' esattamente quello che fa il
      // bottone «Porta qui» della riga singola.
      if (riscritto) finale = riscritto;
    }

    const op = await accodaOperazione({
      data: {
        tipo: "nuova_keyword",
        canale: campagna.canale,
        bersaglio: campagna.nome,
        idEsterno: campagna.idEsterno,
        parametri: JSON.stringify({ testo: finale, corrispondenza: "broad" }),
        motivo:
          finale !== pulito
            ? `Adattata da «${pulito}» per ${citta}: la parola rende su un'altra città e qui manca.`
            : `Portata da un'altra campagna del brand: funziona lì e qui manca.`,
        avvisi:
          finale !== pulito
            ? `«${finale}» è riscritta da «${pulito}»: su questa città non ha nessun dato alle spalle, la somiglianza non è una misura.`
            : null,
        livello: "L1",
        prima: "assente",
        campagnaId,
      },
    });
    messe.push(finale);
    if (finale !== pulito) avvisi.push(`«${finale}» è riscritta da «${pulito}»: qui non ha ancora nessun dato.`);
    await registra({
      autore: "utente",
      tipo: "creazione",
      entita: "operazione",
      entitaId: op.id,
      titolo: `In coda (da approvare): «${finale}» su ${campagna.nome}`,
      dettaglio:
        finale !== pulito
          ? `Adattata da «${pulito}» per ${citta} · scelta insieme ad altre ${scelte.length - 1}`
          : `Portata da un'altra campagna · scelta insieme ad altre ${scelte.length - 1}`,
    });
  }

  redirect(
    esitoInCoda(
      messe.length === 1
        ? `«${messe[0]}» su ${campagna.nome}`
        : `${messe.length} parole su ${campagna.nome}: ${messe.map((m) => `«${m}»`).join(", ")}`,
      avvisi
    )
  );
}
// ---------- «Adatta»: la parola riscritta per QUESTA campagna ----------
// L'AI propone parole che funzionano altrove, e spesso quelle parole nominano
// un'altra città: «flower delivery milan» dentro la campagna di Roma non serve
// a niente — comprerebbe ricerche di gente che vuole consegne a Milano.
//
// Adattare vuol dire riscriverla per la città di questa campagna, traducendo
// la lingua: «flower delivery milan» → «flower delivery rome», «fiori milano»
// → «fiori roma». Poi entra in coda come ogni altra scrittura.
//
// ⚠️ La parola adattata **non ha storia**: i numeri che l'AI ha usato per
// proporla sono di Milano, non di Roma. Il motivo dell'operazione lo dice, così
// chi approva sa che sta scommettendo su una somiglianza, non leggendo un dato.
export async function adattaProposta(propostaId: string) {
  const p = await prisma.propostaAi.findUnique({
    where: { id: propostaId },
    include: { campagna: { select: { id: true, nome: true, canale: true, idEsterno: true } } },
  });
  if (!p || p.stato !== "proposta") return;

  const { cittaDiNome, perAltraCitta } = await import("./nuova-campagna");
  const citta = cittaDiNome(p.campagna.nome);
  if (!citta) return;
  const riscritto = perAltraCitta(testoKeywordPulito(p.testo), citta);
  if (!riscritto) return;

  const op = await accodaOperazione({
    data: {
      tipo: "nuova_keyword",
      canale: p.campagna.canale,
      bersaglio: p.campagna.nome,
      idEsterno: p.campagna.idEsterno,
      parametri: JSON.stringify({ testo: riscritto, corrispondenza: "broad" }),
      motivo: `Adattata da «${testoKeywordPulito(p.testo)}» per ${citta}. ⚠️ I numeri su cui l'AI l'ha proposta sono dell'altra città: qui la parola non ha storia.`,
      livello: "L1",
      prima: "assente",
      campagnaId: p.campagnaId,
    },
  });
  await prisma.propostaAi.update({
    where: { id: propostaId },
    data: { stato: "accettata", decisaIl: new Date() },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    entitaId: op.id,
    titolo: `In coda (da approvare): «${riscritto}» su ${p.campagna.nome}`,
    dettaglio: `Adattata da «${p.testo}» per ${citta}`,
  });
  revalidatePath(`/campagne/${p.campagnaId}`);
  redirect(esitoInCoda(`«${riscritto}» su ${p.campagna.nome}`, [
    `«${riscritto}» è stata riscritta da «${testoKeywordPulito(p.testo)}»: su questa città non ha ancora nessun dato.`,
  ]));
}

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
    const op = await accodaOperazione({
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
        descrizione: `Proposta dall'AI il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}: ${p.motivo}\n\nNumeri su cui è stata fatta: ${p.numeri ?? "—"}.\n\nLe offerte non si toccano da script: va fatto in interfaccia Google Ads.`,
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
// L'obiettivo scelto a schermo, tradotto nei due campi che l'app usa davvero.
//
// ⚠️ `tipoConversione` non è una decorazione: decide se il ROAS è una domanda
// sensata. Su una campagna a contatti il valore conversione è simbolico
// (1,00 €), quindi il ROAS risulterebbe una perdita netta e chi guarda la
// spegnerebbe. «Traffico» e «notorietà» non hanno NESSUNO dei due tipi: si
// lascia `null`, che vuol dire «non giudicarla con quel metro», invece di
// infilarle a forza in «vendite» — un valore inventato si propaga in ogni
// classifica che quel campo tocca.
const CONVERSIONE_DI_OBIETTIVO: Record<string, string | null> = {
  vendite: "vendite",
  contatti: "lead",
  traffico: null,
  notorieta: null,
};

const ETICHETTA_OBIETTIVO: Record<string, string> = {
  vendite: "Vendite",
  contatti: "Contatti (lead)",
  traffico: "Traffico al sito",
  notorieta: "Notorietà",
};

export async function lanciaCampagna(fd: FormData) {
  const nome = testo(fd, "nome");
  const brand = testo(fd, "brand") ?? "gifts";
  const budget = numeroDa(fd, "budget");
  // Il brand di partenza torna indietro con l'errore: senza, un modulo
  // respinto ricompariva su «gifts» anche a chi stava lavorando su Flowers, e
  // la seconda volta la campagna nasceva sul marchio sbagliato.
  const tornaBrand = testo(fd, "tornaBrand");
  const indietro = (messaggio: string) =>
    `/campagne/lancia?errore=${encodeURIComponent(messaggio)}${tornaBrand ? `&brand=${encodeURIComponent(tornaBrand)}` : ""}`;
  if (!nome || !budget || budget <= 0) {
    redirect(indietro("Servono almeno nome e budget giornaliero"));
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
    redirect(indietro(`Copy bloccato dal lint 7.2/7.3 — ${problemi[0]}${problemi.length > 1 ? ` (e altre ${problemi.length - 1})` : ""}`));
  }
  if (titoli.length > 0 && titoli.length < 3) {
    redirect(indietro("Un annuncio RSA vuole almeno 3 titoli (meglio 8-10)"));
  }
  if (titoli.length >= 3 && (descrizioni.length < 2 || !finalUrl)) {
    redirect(indietro("Con i titoli servono almeno 2 descrizioni e la URL finale"));
  }
  const troppoLunghi = titoli.filter((t) => t.length > 30).length + descrizioni.filter((d) => d.length > 90).length;
  if (troppoLunghi > 0) {
    redirect(indietro("Limiti Google: titoli max 30 caratteri, descrizioni max 90"));
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

  // ——— Quello che il bulk upload NON sa portare su Google ———
  //
  // Le colonne del CSV degli Scripts sono quelle di Google Ads Editor:
  // campagna, budget, tipo, stato, gruppo, keyword, annuncio. Obiettivo,
  // località, lingua, strategia di offerta e negative NON ci stanno.
  //
  // ⚠️ Raccoglierle e buttarle via sarebbe il difetto peggiore: il modulo le
  // chiede, quindi chi le scrive crede di averle impostate, e la campagna
  // verrebbe accesa convinti che il targeting ci sia. Restano scritte in tre
  // posti — sui campi della campagna dove esistono, nelle note e nei parametri
  // dell'operazione — e la pagina dichiara che vanno messe a mano. La checklist
  // 4.1 è comunque un passaggio manuale prima dell'accensione: è lì che si fa.
  const obiettivoTipo = testo(fd, "obiettivoTipo") ?? "vendite";
  const lingua = testo(fd, "lingua");
  const strategia = testo(fd, "strategia");
  const localita = [
    ...fd.getAll("localita").map((v) => String(v).trim()),
    ...(testo(fd, "localitaAltre") ?? "").split(",").map((v) => v.trim()),
  ].filter(Boolean);
  const negative = (testo(fd, "negative") ?? "")
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);

  // ⚠️ COSA ARRIVA DAVVERO SU GOOGLE, e cosa no. Fino al 18/08/2026 qui dentro
  // finivano strategia, località, lingua e negative, tutte dichiarate «da
  // impostare a mano» perché si credeva che il bulk upload non avesse le
  // colonne. Ne aveva: la prova è arrivata dal registro caricamenti, che ha
  // rifiutato una campagna per una colonna obbligatoria che non sapevamo
  // esistesse. Adesso:
  //   · strategia → colonna «Bid strategy type» (obbligatoria)
  //   · lingua    → colonna «Language targeting»
  //   · località  → una riga per località, con l'ID (i nomi hanno una lingua,
  //                 gli id no: vedi lib/geo-target.ts)
  //   · negative  → NON dal caricamento: si mettono in coda come operazioni
  //                 `negativa` quando Google conferma che la campagna esiste,
  //                 perché lì c'è `createNegativeKeyword` che si rilegge e
  //                 quindi sappiamo se sono entrate. Una negativa che sparisce
  //                 in silenzio è la peggiore: la campagna eroga su ricerche
  //                 che qualcuno aveva deciso di escludere.
  //   · obiettivo → resta un'etichetta nostra. Su Google l'«obiettivo» è un
  //                 involucro dell'interfaccia, non un campo che uno script
  //                 possa scrivere: elencarlo fra le cose da mettere a mano
  //                 farebbe cercare per sempre un interruttore che non c'è.
  const geo = await risolviLocalita(localita);
  // ⚠️ Niente resta «da mettere a mano» per default. Le località che l'app non
  // sa tradurre le chiede a Google lo script al momento del lancio, e nell'esito
  // dice quali ha trovato, quali erano ambigue e quali no. Scriverle qui come
  // «da fare a mano» sarebbe un compito assegnato prima di sapere se serve.
  const daMano: string[] = [];

  const campagna = await prisma.campagna.create({
    data: {
      nome,
      brand,
      canale: "google_ads",
      stato: "bozza",
      budgetGiornaliero: budget,
      obiettivo: ETICHETTA_OBIETTIVO[obiettivoTipo] ?? obiettivoTipo,
      // Su «traffico» e «notorietà» resta null: vedi CONVERSIONE_DI_OBIETTIVO.
      tipoConversione: CONVERSIONE_DI_OBIETTIVO[obiettivoTipo] ?? null,
      note:
        "Creata dall'app: in coda per il lancio su Google Ads (nasce in pausa). " +
        `Il caricamento porta budget, strategia${strategia ? ` (${strategia})` : ""}` +
        `${lingua ? `, lingua ${lingua}` : ""}` +
        `${geo.risolte.length > 0 ? `, ${geo.risolte.length} località` : ""}` +
        ", gruppo, keyword e annuncio. " +
        (geo.nonRisolte.length > 0
          ? `${geo.nonRisolte.join(", ")}: l'id non lo so, lo chiede a Google lo script quando lancia — ` +
            "nell'esito dell'operazione c'è scritto se le ha trovate. "
          : "") +
        (negative.length > 0
          ? `Le ${negative.length} parole da escludere vanno in coda da sole appena Google conferma la campagna. `
          : "") +
        (daMano.length > 0
          ? `DA IMPOSTARE A MANO in Google Ads prima di accenderla — ${daMano.join(" · ")}.`
          : "La checklist 4.1 va fatta prima di accenderla."),
    },
  });

  const op = await accodaOperazione({
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
        strategia,
        lingua,
        // Le località già tradotte in id: lo script scrive righe, non indovina
        // nomi. `localita` resta coi nomi scritti a mano, per il paper trail.
        localitaId: geo.risolte.map((l) => l.id),
        localita,
        // ⚠️ Quelle che l'app non sa tradurre NON si buttano: viaggiano coi
        // nomi e le chiede a Google lo script, che l'elenco completo ce l'ha
        // (`risolviLocalitaSuGoogle`). Se un nome dà più risultati lo script
        // non sceglie e li elenca nell'esito — «Como» è una città e una
        // provincia, e indovinare vorrebbe dire far erogare la campagna in un
        // posto che nessuno ha deciso.
        localitaNomi: geo.nonRisolte,
        // Le negative NON le porta il caricamento: aspettano che la campagna
        // esista e diventano operazioni loro (vedi il commento sopra).
        negative,
        // Registrato per il paper trail: su Google non è un campo scrivibile.
        obiettivoTipo,
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
    dettaglio:
      `${keywords.length} keyword · ${titoli.length} titoli · ${descrizioni.length} descrizioni · ${budget} €/g` +
      ` — da impostare a mano: ${daMano.join(" · ")}`,
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
  // ⚠️ `revalidatePath` NON basta, ed è la TERZA volta che costa un giro a
  // vuoto (lingua campagna 06/08, corrispondenza operazione 08/08, rinomina
  // e stato gruppo 09/08). Il salvataggio funziona, ma chi guarda non vede
  // cambiare niente — il <dialog> resta aperto sopra la pagina, o il <select>
  // controllato torna al valore di prima — e conclude che il bottone non
  // faccia nulla. Serve il ritorno esplicito, che ricarica davvero.
  redirect(`/gruppi/${id}`);
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
  // ⚠️ `revalidatePath` NON basta, ed è la TERZA volta che costa un giro a
  // vuoto (lingua campagna 06/08, corrispondenza operazione 08/08, rinomina
  // e stato gruppo 09/08). Il salvataggio funziona, ma chi guarda non vede
  // cambiare niente — il <dialog> resta aperto sopra la pagina, o il <select>
  // controllato torna al valore di prima — e conclude che il bottone non
  // faccia nulla. Serve il ritorno esplicito, che ricarica davvero.
  redirect(`/campagne/${id}`);
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
  // ⚠️ `revalidatePath` NON basta, ed è la TERZA volta che costa un giro a
  // vuoto (lingua campagna 06/08, corrispondenza operazione 08/08, rinomina
  // e stato gruppo 09/08). Il salvataggio funziona, ma chi guarda non vede
  // cambiare niente — il <dialog> resta aperto sopra la pagina, o il <select>
  // controllato torna al valore di prima — e conclude che il bottone non
  // faccia nulla. Serve il ritorno esplicito, che ricarica davvero.
  redirect(`/gruppi/${id}`);
}

// Pausa/riattivazione di un gruppo SULLA PIATTAFORMA: come per le campagne
// passa dalla coda approvata a mano, con gli stessi guardrail della campagna
// che lo contiene (freeze incidenti, blackout 72h, max 1 L2/L3 a settimana).
export async function creaOperazioneGruppo(fd: FormData) {
  // Da dove si veniva: torna con l esito e diventa il bottone «torna indietro» su /operazioni.
  const ritorno = testo(fd, "ritorno");

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
    // ⚠️ Anche COSA era: l'avviso deve poterla nominare, o chi legge se la va
    // a cercare nello storico (o non se la cerca affatto).
    ultimaModificaVoce: campagna.modifiche[0] ?? null,
    l2Settimana,
  });
  if (campagna.incidenti.length > 0) {
    esito.avvisi.push(
      `Incidente ${campagna.incidenti[0].codice} APERTO sulla campagna che contiene questo gruppo: finché non è chiuso, quello che si misura è sporcato dal guasto.`
    );
  }

  const op = await accodaOperazione({
    data: {
      tipo,
      canale: gruppo.canale,
      bersaglio: gruppo.nome,
      idEsterno: gruppo.idEsterno,
      parametri: JSON.stringify({ gruppo: gruppo.nome, campagna: campagna.nome }),
      motivo: testo(fd, "motivo"),
      avvisi: esito.avvisi.length > 0 ? esito.avvisi.join(" · ") : null,
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
    dettaglio: [op.motivo, op.avvisi].filter(Boolean).join(" — "),
  });
  redirect(esitoInCoda(`${tipo} su «${gruppo.nome}»`, esito.avvisi, ritorno));
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
  // Da dove si veniva: torna con l esito e diventa il bottone «torna indietro» su /operazioni.
  const ritorno = testo(fd, "ritorno");

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
  const avvisiTermine =
    termine.campagna.incidenti.length > 0
      ? `Incidente ${termine.campagna.incidenti[0].codice} APERTO su questa campagna: finché non è chiuso, quello che si misura è sporcato dal guasto.`
      : null;
  const op = await accodaOperazione({
    data: {
      tipo: "negativa",
      canale: termine.campagna.canale,
      bersaglio: termine.campagna.nome,
      parametri: JSON.stringify({ testo: termine.testo }),
      motivo: `Termine di ricerca senza resa: ${(termine.spesa ?? 0).toFixed(2)} € spesi, ${termine.conversioni ?? 0} conversioni`,
      avvisi: avvisiTermine,
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
    dettaglio: [op.motivo, op.avvisi].filter(Boolean).join(" — "),
  });
  redirect(esitoInCoda(`negativa «${termine.testo}»`, avvisiTermine ? [avvisiTermine] : [], ritorno));
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
    // ⚠️ UNA STRADA SOLA (24/08/2026). Qui c'era una TERZA copia del giro
    // TikTok, oltre a quella della rotta v1 — e non era una copia identica:
    // **non scriveva la consegna in `/ricezione`** e **non chiamava
    // `deduciTipoConversione`**. Premendo «Aggiorna TikTok ora» i dati
    // entravano senza lasciare traccia, e la pagina che serve a rispondere a
    // «cosa sto ricevendo e da quando» non ne sapeva niente. Tre copie della
    // stessa cosa non restano uguali: divergono, e la differenza si scopre
    // mesi dopo, guardando un numero che non torna.
    const { eseguiSyncTikTok } = await import("./sync-tiktok");
    const esito = await eseguiSyncTikTok({ giorni }, "utente");
    revalidatePath(dove);
    if (!esito.ok) redirect(`${dove}?aggiornamento=tiktok-non-configurato`);
    redirect(`${dove}?aggiornamento=tiktok-fatto&righe=${esito.totaleMetriche}`);
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
export async function depositaLogAzioniOra() {
  "use server";
  // ⚠️ Lo stesso motore del cron serale (`lib/ponte-drive.ts`), non una copia:
  // il bottone serve a vedere subito se il ponte regge, e se le due strade
  // divergessero la prova non proverebbe niente di quello che gira davvero.
  const { depositaAppendAzioni } = await import("./ponte-drive");
  const esito = await depositaAppendAzioni();
  revalidatePath("/impostazioni");
  if (!esito.ok) {
    redirect(`/impostazioni?salvato=ponte-no&perche=${encodeURIComponent(esito.errore.slice(0, 200))}`);
  }
  if (!esito.scritto) {
    redirect(`/impostazioni?salvato=ponte-niente&perche=${encodeURIComponent(esito.motivo.slice(0, 200))}`);
  }
  redirect(
    `/impostazioni?salvato=ponte-ok&perche=${encodeURIComponent(`${esito.nome} · ${esito.voci} operazioni`)}`
  );
}

export async function depositaRisultatiOra() {
  "use server";
  // Stessa funzione del cron settimanale, non una copia.
  const { depositaRisultati } = await import("./ponte-risultati");
  const esito = await depositaRisultati();
  revalidatePath("/impostazioni");
  if (!esito.ok) {
    redirect(`/impostazioni?salvato=ponte-no&perche=${encodeURIComponent(esito.errore.slice(0, 200))}`);
  }
  redirect(
    `/impostazioni?salvato=ponte-ok&perche=${encodeURIComponent(
      esito.file.map((f) => `${f.nome} (${f.righe} righe)`).join(" · ").slice(0, 220),
    )}`
  );
}

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
// Il lavoro su UNA campagna: avviso incidente, anti-doppioni, coda, registro.
// È il cuore condiviso fra la barra della scheda campagna/gruppo (una campagna
// sola) e la pagina globale delle parole cercate (una campagna per parola):
// due strade che accodassero in modo diverso darebbero due code diverse.
async function accodaNegativeSuCampagna(
  campagnaId: string,
  scelte: string[],
  corrispondenza: string
): Promise<{ nome: string; accodate: number; giaInCoda: number; avviso: string | null } | null> {
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    include: { incidenti: { where: { stato: "aperto" }, select: { codice: true } } },
  });
  if (!campagna) return null;

  // Il freeze da incidente non ferma più (04/08/2026): viaggia come avviso
  // sull'operazione, e lo legge chi approva.
  const avvisoIncidente =
    campagna.incidenti.length > 0
      ? `Incidente ${campagna.incidenti[0].codice} APERTO su ${campagna.nome}: finché non è chiuso, quello che si misura è sporcato dal guasto.`
      : null;

  // Le parole già in coda non si riaccodano: succede a chi torna sulla pagina
  // e rispunta le stesse, e la coda si riempirebbe di doppioni da approvare.
  const inCoda = await prisma.operazioneAdv.findMany({
    where: { campagnaId, tipo: "negativa", stato: { in: ["in_attesa", "approvata"] } },
    select: { parametri: true },
  });
  const gia = new Set(
    inCoda
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
    await accodaOperazione({
      data: {
        tipo: "negativa",
        canale: campagna.canale,
        bersaglio: campagna.nome,
        idEsterno: campagna.idEsterno,
        // Esatta: si esclude QUELLA ricerca, non tutto cio che le somiglia
        parametri: JSON.stringify({ testo: pulito, corrispondenza }),
        motivo: `Esclusa insieme ad altre ${nuove.length - 1 > 0 ? `${nuove.length - 1} parole` : ""}`.trim(),
        avvisi: avvisoIncidente,
        livello: "L0",
        prima: "assente",
        campagnaId,
      },
    });
  }

  if (nuove.length > 0) {
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
  }

  return {
    nome: campagna.nome,
    accodate: nuove.length,
    giaInCoda: scelte.length - nuove.length,
    avviso: avvisoIncidente,
  };
}

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

  const esito = await accodaNegativeSuCampagna(campagnaId!, scelte, testo(fd, "corrispondenza") || "exact");
  if (!esito) return;

  redirect(
    esitoInCoda(`${esito.accodate} negative su ${esito.nome}`, esito.avviso ? [esito.avviso] : [], ritorno));
}

// Dalla pagina globale delle parole cercate: le righe appartengono a campagne
// DIVERSE, quindi le caselle portano l'id del termine — non il testo — e ogni
// parola diventa una negativa sulla campagna in cui è stata cercata. Il testo
// da solo non basterebbe: la stessa parola cercata su due campagne è due righe,
// e la negativa va messa dove la ricerca è avvenuta.
export async function escludiTerminiSelezionati(fd: FormData) {
  const ritorno = testo(fd, "ritorno") ?? "/termini";
  const ids = fd
    .getAll("scelte")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (ids.length === 0) {
    redirect(`${ritorno}${ritorno.includes("?") ? "&" : "?"}bloccata=${encodeURIComponent("Nessuna parola selezionata")}`);
  }

  const corrispondenza = testo(fd, "corrispondenza") || "exact";
  const termini = await prisma.termineRicerca.findMany({
    where: { id: { in: ids } },
    select: { id: true, testo: true, campagnaId: true },
  });

  const perCampagna = new Map<string, string[]>();
  for (const t of termini) {
    const lista = perCampagna.get(t.campagnaId) ?? [];
    lista.push(t.testo);
    perCampagna.set(t.campagnaId, lista);
  }

  let accodate = 0;
  const campagne: string[] = [];
  const avvisi: string[] = [];
  for (const [campagnaId, testi] of perCampagna) {
    const esito = await accodaNegativeSuCampagna(campagnaId, testi, corrispondenza);
    if (!esito) continue;
    accodate += esito.accodate;
    if (esito.accodate > 0) campagne.push(esito.nome);
    if (esito.avviso) avvisi.push(esito.avviso);
  }

  // Il giudizio segue, come nell'«Escludi» di riga: la parola resta segnata
  // «da escludere» anche qui, o la tabella la riproporrebbe come mai guardata.
  await prisma.termineRicerca.updateMany({
    where: { id: { in: termini.map((t) => t.id) } },
    data: { stato: "da_escludere" },
  });
  revalidatePath("/termini");

  redirect(
    esitoInCoda(
      `${accodate} negative su ${campagne.length} campagn${campagne.length === 1 ? "a" : "e"}`,
      avvisi
    , ritorno));
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


/**
 * Rimette in coda un'operazione FALLITA.
 *
 * ⚠️ Perche' serviva: una riga «Fallita» nell'app non aveva NESSUN bottone.
 * Lo storico diceva cos'era andato storto e lasciava l'utente li': l'unica
 * strada era rifare tutto da capo dal punto di partenza — per un annuncio,
 * riscrivere quindici titoli. Il 21/08/2026 e' successo davvero (l'annuncio
 * della WORLD-ENG, «Bersaglio non trovato»), ed e' stata la domanda giusta:
 * *«ma se e' fallito dovrei avere il bottone per riaprirlo»*.
 *
 * ⚠️ Torna «da approvare», MAI approvata. Fallita vuol dire che qualcosa non
 * ha funzionato: la causa va sistemata prima, e l'approvazione e' il momento
 * in cui una persona dichiara di averlo fatto. Saltarlo vorrebbe dire
 * ritentare in automatico contro un guasto che c'e' ancora.
 *
 * ⚠️ `nuova_campagna` NON passa di qui: ha la sua strada
 * (`rilanciaCampagnaRifiutata`) che pretende **tre prove** che la campagna su
 * Google non esista. Rimettere in coda una creazione di campagna senza quelle
 * prove significa rischiare una SECONDA campagna che spende sul serio.
 *
 * ⚠️ Sulle altre creazioni (annuncio, keyword) l'avvertenza resta e sta nel
 * bottone: se lo script e' morto DOPO aver scritto su Google, riprovare
 * duplica. Le reti dello script coprono le negative (`negativaPresente`) e il
 * completamento (idempotente per costruzione); per l'annuncio no — un gruppo
 * con piu' annunci e' normale e lo script non puo' distinguere il doppione
 * dalla cosa chiesta.
 */
export async function riprovaFallita(fd: FormData) {
  const torna = testo(fd, "torna");
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!op || op.stato !== "fallita") return;
  if (op.tipo === "nuova_campagna") return; // ha la sua strada, con le prove

  await prisma.operazioneAdv.update({
    where: { id },
    data: {
      stato: "in_attesa",
      approvataDa: null,
      approvataIl: null,
      eseguitaIl: null,
      // L'esito vecchio non si butta: e' la ragione per cui si sta
      // riprovando. Si sposta nel motivo, e `esito` si svuota perche' il
      // prossimo giro ne scrivera' uno nuovo.
      esito: null,
      motivo:
        `${op.motivo ? op.motivo + " · " : ""}Rimessa in coda il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} ` +
        `dopo un tentativo fallito — ${(op.esito ?? "").slice(0, 400)}`,
    },
  });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: `Rimessa in coda dopo un fallimento: ${op.tipo} su ${op.bersaglio}`,
    dettaglio:
      `Il tentativo precedente diceva: ${(op.esito ?? "(nessun esito)").slice(0, 300)}. ` +
      "Torna fra quelle da approvare: se la causa non e' stata sistemata fallira' di nuovo.",
  });
  revalidatePath("/operazioni");
  if (torna) redirect(`/operazioni?torna=${encodeURIComponent(torna)}`);
  redirect("/operazioni");
}

/**
 * Riporta un annuncio NELLE CASELLE in cui era stato scritto: quello fallito
 * per correggerlo, quello ancora in coda per cambiarlo prima che parta.
 *
 * Rimettere in coda lo stesso identico annuncio serve quando la causa era
 * fuori (lo script, un id che non rispondeva). Ma se la causa erano i TESTI —
 * un titolo rifiutato, la landing sbagliata — riprovarli tali e quali
 * fallisce di nuovo. E un annuncio che aspetta l'approvazione non e' ancora
 * un fatto: e' un testo fermo, e per cambiargli una virgola non si deve
 * essere costretti ad annullarlo e riscrivere quindici titoli.
 *
 * ⚠️ Se l'operazione era ANCORA IN CODA viene ANNULLATA. Sono la stessa cosa
 * vista due volte, non due annunci: lasciare in coda il vecchio mentre si
 * scrive il nuovo vuol dire approvarli tutti e due e ritrovarsi con due
 * annunci quasi uguali che vanno in gara fra loro nello stesso gruppo.
 *
 * ⚠️ Una FALLITA invece resta fallita: non si riscrive la storia. In quel
 * caso rimettere in coda crea un'operazione NUOVA, ed e' giusto che nel
 * registro si veda il tentativo andato male accanto a quello buono.
 */
export async function riprendiAnnuncioAccodato(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const op = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!op || op.tipo !== "nuovo_annuncio" || !op.gruppoId) return;
  if (!["in_attesa", "approvata", "fallita"].includes(op.stato)) return;

  let par: { titoli?: string[]; descrizioni?: string[]; finalUrl?: string } = {};
  try {
    par = op.parametri ? JSON.parse(op.parametri) : {};
  } catch {
    return; // parametri illeggibili: meglio non aprire una bozza vuota
  }

  const titoli = (par.titoli ?? []).join("\n");
  const descrizioni = (par.descrizioni ?? []).join("\n");
  if (!titoli && !descrizioni) return;

  await prisma.bozzaAnnuncio.upsert({
    where: { gruppoId: op.gruppoId },
    update: { titoli, descrizioni, finalUrl: par.finalUrl ?? null },
    create: { gruppoId: op.gruppoId, titoli, descrizioni, finalUrl: par.finalUrl ?? null },
  });
  // ⚠️ Se era ancora in coda si toglie di mezzo: quello che si sta per
  // riscrivere lo sostituisce. C'e' una finestra in cui lo script potrebbe
  // averla gia' presa (le approvate le esegue quando passa): annullarla la
  // stringe quanto si puo' da qui.
  const eraInCoda = op.stato === "in_attesa" || op.stato === "approvata";
  if (eraInCoda) {
    await prisma.operazioneAdv.update({
      where: { id },
      data: {
        stato: "annullata",
        esito: "Annullata: l'annuncio e' stato ripreso per essere modificato, lo sostituisce quello nuovo.",
      },
    });
  }
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: eraInCoda
      ? `Annuncio ripreso dalla coda per modifica: ${op.bersaglio}`
      : `Annuncio fallito riaperto per correzione: ${op.bersaglio}`,
    dettaglio: eraInCoda
      ? "I testi tornano nella bozza del gruppo e l'operazione in coda e' stata annullata: la sostituisce quella che nascera' dalla modifica."
      : "I testi tornano nella bozza del gruppo. L'operazione fallita resta nello storico.",
  });
  revalidatePath(`/gruppi/${op.gruppoId}`);
  redirect(`/gruppi/${op.gruppoId}?correggi=1`);
}

/**
 * Parole da escludere SCRITTE A MANO.
 *
 * ⚠️ Perché mancava. Fino a oggi si poteva escludere solo quello che era già
 * in un elenco — una ricerca fatta da qualcuno, una keyword esistente —
 * cioè si poteva reagire, non prevenire. Per una parola che nessuno ha ancora
 * cercato («funerale», «gratis», il nome di un concorrente) non c'era nessun
 * posto in cui scriverla, e su una campagna nuova è esattamente il momento in
 * cui si sa già cosa NON si vuole comprare.
 *
 * ⚠️ Le negative vivono sulla CAMPAGNA: lo script le crea con
 * `campagna.createNegativeKeyword`. Anche partendo dalla scheda di un gruppo,
 * si escludono per tutta la campagna — ed è scritto nel dialogo.
 *
 * ⚠️ L0: escludere non sposta budget e non tocca creativi. Le negative di
 * lancio erano state accodate a L1 e avrebbero fatto scattare il blackout di
 * 72 ore sedici volte (corretto il 19/08/2026): lo stesso errore non si rifà.
 */
export async function accodaNegativeScritte(input: {
  campagnaId: string;
  parole: string[];
  corrispondenza: string;
  motivo: string;
  ritorno: string;
}): Promise<{ ok: true; messe: number; gia: number } | { ok: false; errore: string }> {
  const campagna = await prisma.campagna.findUnique({
    where: { id: input.campagnaId },
    select: { id: true, nome: true, canale: true, idEsterno: true },
  });
  if (!campagna) return { ok: false, errore: "Campagna non trovata." };

  const corrispondenza = ["exact", "phrase", "broad"].includes(input.corrispondenza)
    ? input.corrispondenza
    : "exact";

  // Ripulite e senza doppioni fra loro: la stessa parola scritta due volte
  // nella casella non deve diventare due operazioni.
  const viste = new Set<string>();
  const parole: string[] = [];
  for (const p of input.parole) {
    const pulito = testoKeywordPulito(String(p)).trim();
    if (!pulito) continue;
    const chiave = pulito.toLowerCase();
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    parole.push(pulito);
  }
  if (parole.length === 0) return { ok: false, errore: "Non c'è nessuna parola da escludere." };

  // ⚠️ Quelle già in coda non si riaccodano: succede a chi torna sulla pagina
  // e riscrive le stesse, e la coda si riempirebbe di doppioni da approvare.
  // Quelle già presenti SU GOOGLE l'app non le conosce (non le importa): le
  // intercetta lo script al momento di scrivere, e lo riferisce.
  const inCoda = await prisma.operazioneAdv.findMany({
    where: { campagnaId: campagna.id, tipo: "negativa", stato: { in: ["in_attesa", "approvata"] } },
    select: { parametri: true },
  });
  const gia = new Set(
    inCoda
      .map((o) => {
        try {
          return String(JSON.parse(o.parametri ?? "{}").testo ?? "").toLowerCase();
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
  const nuove = parole.filter((p) => !gia.has(p.toLowerCase()));

  for (const p of nuove) {
    const op = await accodaOperazione({
      data: {
        tipo: "negativa",
        canale: campagna.canale,
        bersaglio: campagna.nome,
        idEsterno: campagna.idEsterno,
        parametri: JSON.stringify({ testo: p, corrispondenza }),
        motivo:
          input.motivo.trim() ||
          "Scritta a mano: parola per cui non vogliamo comparire.",
        livello: "L0",
        prima: "assente",
        campagnaId: campagna.id,
      },
    });
    await registra({
      autore: "utente",
      tipo: "creazione",
      entita: "operazione",
      entitaId: op.id,
      titolo: `In coda (da approvare): escludi «${p}» da ${campagna.nome}`,
      dettaglio: `Corrispondenza ${corrispondenza}. ${input.motivo.trim()}`.trim(),
    });
  }

  revalidatePath(input.ritorno.split("?")[0]);
  revalidatePath("/operazioni");
  return { ok: true, messe: nuove.length, gia: parole.length - nuove.length };
}

/**
 * Esegue ADESSO le operazioni Meta già approvate.
 *
 * ⚠️ Su Meta non c'è nessuno script che passa da solo: il motore è l'app, e
 * parte solo quando qualcuno preme. È una scelta (`esegui/meta` non ha cron):
 * finché la scrittura su Meta non avrà fatto qualche giro vero sotto gli occhi
 * di una persona, non deve poter partire da sola di notte.
 *
 * Il difetto era che quella scelta non si vedeva: una coda Meta approvata
 * restava ferma per sempre, identica a una che sta per essere eseguita. Il
 * bottone la rende una decisione invece di un'attesa.
 *
 * ⚠️ Non decide niente da sé: esegue solo le APPROVATE, dieci per volta, e
 * ogni esito finisce sulla riga dell'operazione come per Google.
 */
export async function eseguiMetaAdesso() {
  const { eseguiOperazioniMeta } = await import("./meta-scrittura");
  const esito = await eseguiOperazioniMeta({ limite: 10 });

  const riassunto = esito.spento
    ? `Scrittura su Meta spenta: non ho toccato niente. ${esito.nota ?? ""}`
    : esito.eseguite + esito.fallite + esito.saltate === 0
      ? "Niente di approvato in coda su Meta."
      : `Meta: ${esito.eseguite} eseguite, ${esito.fallite} fallite, ${esito.saltate} saltate` +
        (esito.saltate > 0 ? " (saltate = senza id di piattaforma: non si tocca un omonimo)" : "") + ".";

  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: "meta",
    titolo: "Esecuzione manuale delle operazioni Meta",
    dettaglio: riassunto,
  });
  revalidatePath("/operazioni");
  redirect(`/operazioni?esito=${encodeURIComponent(riassunto)}`);
}

/**
 * Cambia le LOCALITÀ di una campagna: ne aggiunge, ne toglie.
 *
 * ⚠️ Le località l'app le leggeva da settimane e non le sapeva cambiare: per
 * spostare una campagna da Milano a tutta l'Italia si andava in Google Ads.
 * Dove esce un annuncio è una delle poche decisioni che spostano la spesa, ed
 * è la più facile da dimenticare — una campagna nata per una città ci resta
 * finché qualcuno non se ne accorge dai numeri.
 *
 * ⚠️ L2, non L1: cambiare dove esce un annuncio non è un ritocco.
 *
 * ⚠️ I NOMI NON SI RISOLVONO QUI. Li cerca lo script su Google al momento di
 * eseguire (`risolviLocalitaSuGoogle`), perché è là che esiste l'elenco vero e
 * perché un nome ambiguo — «Como» città e provincia — deve fermare
 * l'esecuzione, non essere indovinato dall'app. Qui si controlla solo che
 * qualcosa ci sia.
 */
export async function accodaCambioLocalita(input: {
  campagnaId: string;
  aggiungi: string[];
  togli: string[];
  motivo: string;
  ritorno: string;
}): Promise<{ ok: true; messaggio: string } | { ok: false; errore: string }> {
  const campagna = await prisma.campagna.findUnique({
    where: { id: input.campagnaId },
    select: { id: true, nome: true, canale: true, idEsterno: true, account: true, localita: true },
  });
  if (!campagna) return { ok: false, errore: "Campagna non trovata." };
  if (campagna.canale !== "google_ads") {
    return {
      ok: false,
      errore: "Per adesso le località si cambiano solo sulle campagne Google: su Meta il targeting sta sugli ad set e l'app non li importa ancora.",
    };
  }

  // Gli id scritti a mano si distinguono dai nomi: sono solo cifre.
  const aggiungiId: number[] = [];
  const aggiungiNomi: string[] = [];
  for (const x of input.aggiungi.map((s) => s.trim()).filter(Boolean)) {
    if (/^[0-9]+$/.test(x)) aggiungiId.push(Number(x));
    else aggiungiNomi.push(x);
  }
  const togli = input.togli.map(String).filter(Boolean);
  if (aggiungiId.length + aggiungiNomi.length + togli.length === 0) {
    return { ok: false, errore: "Non hai indicato niente da aggiungere né da togliere." };
  }

  // ⚠️ La stessa rete dello script, ripetuta qui: una campagna senza località
  // esce OVUNQUE. Meglio fermarla prima che arrivi in coda.
  const mirate = campagna.localita.filter((l) => !l.esclusa).length;
  if (mirate > 0 && mirate + aggiungiId.length + aggiungiNomi.length - togli.length <= 0) {
    return {
      ok: false,
      errore: "Così toglieresti tutte le località: senza targeting geografico Google fa uscire la campagna ovunque. Aggiungi prima dove deve uscire.",
    };
  }

  const inCoda = await prisma.operazioneAdv.findFirst({
    where: { campagnaId: campagna.id, tipo: "localita", stato: { in: ["in_attesa", "approvata"] } },
  });
  if (inCoda) {
    return {
      ok: false,
      errore: "C'è già un cambio di località in coda per questa campagna: approvalo o annullalo prima di farne un altro.",
    };
  }

  const nomiTolti = campagna.localita
    .filter((l) => togli.includes(l.idEsterno))
    .map((l) => l.nome);

  const op = await accodaOperazione({
    data: {
      tipo: "localita",
      canale: campagna.canale,
      account: campagna.account,
      bersaglio: campagna.nome,
      idEsterno: campagna.idEsterno,
      campagnaId: campagna.id,
      parametri: JSON.stringify({ aggiungiId, aggiungiNomi, togliId: togli }),
      motivo:
        input.motivo.trim() ||
        `Località: ${aggiungiId.length + aggiungiNomi.length} da aggiungere, ${togli.length} da togliere`,
      avvisi: nomiTolti.length
        ? `Verranno tolte: ${nomiTolti.join(", ")}. Dopo l'esecuzione la campagna non uscirà più lì.`
        : null,
      livello: "L2",
      prima: campagna.localita.filter((l) => !l.esclusa).map((l) => l.nome).join(", ") || "nessuna",
    },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    entitaId: op.id,
    titolo: `In coda (da approvare): località su ${campagna.nome}`,
    dettaglio:
      `${[...aggiungiNomi, ...aggiungiId.map(String)].join(", ") || "niente"} da aggiungere` +
      (nomiTolti.length ? ` · da togliere: ${nomiTolti.join(", ")}` : ""),
  });

  revalidatePath(input.ritorno.split("?")[0]);
  revalidatePath("/operazioni");
  return {
    ok: true,
    messaggio:
      "Cambio di località messo in coda: ora va approvato." +
      (aggiungiNomi.length ? " I nomi li risolverà lo script su Google al momento di eseguire." : ""),
  };
}

/**
 * Mette in coda i budget cambiati su più campagne insieme.
 *
 * ⚠️ UNA OPERAZIONE PER CAMPAGNA, non un lotto: chi approva deve poter dire
 * sì a quattro e no a una, e se lo script inciampa su una campagna le altre
 * non devono cadere con lei. È la stessa regola delle keyword portate altrove
 * e delle liste di esclusione.
 *
 * ⚠️ SOLO QUELLO CHE È CAMBIATO. Rimandare anche i budget identici vorrebbe
 * dire far scattare il blackout di 72 ore su campagne che non hanno cambiato
 * niente — e riempire la coda di modifiche che non modificano.
 *
 * ⚠️ L2, come ogni cambio di budget dal guardrail: sposta la spesa.
 *
 * ⚠️ NON è una programmazione. L'operazione parte quando qualcuno la approva
 * e lo script passa (su Meta quando qualcuno preme): non esiste un «vale dal
 * primo del mese». Guardare il tetto di un mese futuro serve a decidere, non
 * a schedulare.
 */
export async function accodaBudgetCampagne(input: {
  brand: string;
  modifiche: { campagnaId: string; budget: number }[];
  motivo: string;
  /**
   * Da quando può partire (gg/mm/aaaa in formato ISO). Vuoto = appena
   * approvata, come è sempre stato.
   *
   * ⚠️ È una data di PARTENZA, non un orario: l'operazione parte al primo
   * giro utile dopo quel giorno. Su Google lo script passa da solo, su Meta
   * esegue chi preme — promettere il minuto sarebbe promettere una cosa che
   * non dipende da noi.
   */
  dal?: string;
}): Promise<{ ok: true; messaggio: string } | { ok: false; errore: string }> {
  const modifiche = input.modifiche.filter((m) => m.campagnaId && Number.isFinite(m.budget) && m.budget > 0);
  if (modifiche.length === 0) return { ok: false, errore: "Non c'è nessun budget nuovo da mettere in coda." };

  const campagne = await prisma.campagna.findMany({
    where: { id: { in: modifiche.map((m) => m.campagnaId) } },
    select: { id: true, nome: true, canale: true, idEsterno: true, account: true, budgetGiornaliero: true },
  });
  const per = new Map(campagne.map((c) => [c.id, c]));

  // Quelle che hanno già un cambio in coda si saltano: due modifiche di
  // budget sulla stessa campagna vorrebbero dire che la seconda cancella la
  // prima, senza che nessuno l'abbia deciso.
  const inCoda = await prisma.operazioneAdv.findMany({
    where: {
      tipo: "budget",
      campagnaId: { in: modifiche.map((m) => m.campagnaId) },
      stato: { in: ["in_attesa", "approvata"] },
    },
    select: { campagnaId: true },
  });
  const gia = new Set(inCoda.map((o) => o.campagnaId));

  // ⚠️ Una data nel PASSATO non si accetta in silenzio: farebbe partire tutto
  // al primo giro, cioè l'opposto di quello che chiede chi la scrive.
  let daEseguireDal: Date | null = null;
  if (input.dal) {
    const d = new Date(`${input.dal}T00:00:00`);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, errore: "La data di partenza non si legge." };
    }
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    if (d.getTime() < oggi.getTime()) {
      return {
        ok: false,
        errore: "La data di partenza è nel passato: così partirebbero al primo giro. Lascia vuoto se le vuoi subito.",
      };
    }
    if (d.getTime() > oggi.getTime()) daEseguireDal = d;
  }

  let messe = 0;
  const saltate: string[] = [];
  for (const m of modifiche) {
    const c = per.get(m.campagnaId);
    if (!c) continue;
    if (gia.has(c.id)) {
      saltate.push(c.nome);
      continue;
    }
    const prima = c.budgetGiornaliero;
    const variazione = prima && prima > 0 ? ((m.budget - prima) / prima) * 100 : null;
    const op = await accodaOperazione({
      data: {
        tipo: "budget",
        canale: c.canale,
        account: c.account,
        bersaglio: c.nome,
        idEsterno: c.idEsterno,
        campagnaId: c.id,
        parametri: JSON.stringify({ budget: m.budget }),
        motivo:
          input.motivo.trim() ||
          `Budget adattato al tetto del mese${variazione != null ? ` (${variazione > 0 ? "+" : ""}${Math.round(variazione)}%)` : ""}`,
        avvisi:
          variazione != null && Math.abs(variazione) >= 50
            ? `Variazione forte: ${variazione > 0 ? "+" : ""}${Math.round(variazione)}%. Su Google un salto così rimette la campagna in apprendimento.`
            : null,
        livello: "L2",
        prima: prima != null ? `budget ${prima} €/g` : "budget non noto",
        daEseguireDal,
      },
    });
    messe++;
    await registra({
      autore: "utente",
      tipo: "creazione",
      entita: "operazione",
      entitaId: op.id,
      titolo: `In coda (da approvare): budget ${m.budget} €/g su ${c.nome}`,
      dettaglio: `Prima: ${prima != null ? `${prima} €/g` : "non noto"}. ${input.motivo.trim()}`.trim(),
    });
  }

  revalidatePath("/budget/adatta");
  revalidatePath("/operazioni");
  return {
    ok: true,
    messaggio:
      `${messe === 1 ? "1 modifica messa" : `${messe} modifiche messe`} in coda` +
      (daEseguireDal
        ? `, programmate dal ${daEseguireDal.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}: restano ferme fino a quel giorno anche se le approvi adesso.`
        : ".") +
      (saltate.length
        ? ` Saltate perché ne hanno già una in coda: ${saltate.join(", ")}.`
        : ""),
  };
}

/**
 * Mette in coda una ESTENSIONE nuova per la campagna.
 *
 * ⚠️ Le estensioni si potevano solo GUARDARE: 247 in archivio, e per
 * aggiungerne una si andava in Google Ads. Sono spazio gratuito nella pagina
 * dei risultati — un annuncio più alto viene guardato di più a parità di
 * offerta — quindi la cosa costosa non è aggiungerle: è non farlo.
 *
 * ⚠️ SOLO LE TRE TESTUALI (sitelink, callout, snippet). Le immagini vogliono
 * un file già caricato nell'account, e un file non entra in un'operazione:
 * offrirle qui vorrebbe dire un bottone che fallisce sempre.
 *
 * ⚠️ L0: aggiungere un'estensione non sposta budget e non tocca chi vede
 * l'annuncio — allunga quello che si vede. È la stessa scala delle negative.
 *
 * ⚠️ Il DOPPIONE si ferma QUI, dove si sa cosa c'è già: lo script non lo
 * controlla (Google accetterebbe due callout identici) perché l'unica
 * copia completa di quello che esiste sta nell'app.
 */
export async function accodaEstensione(input: {
  campagnaId: string;
  tipo: string;
  testo: string;
  url: string;
  descrizione1: string;
  descrizione2: string;
  header: string;
  valori: string[];
  ritorno: string;
}): Promise<{ ok: true; messaggio: string } | { ok: false; errore: string }> {
  const tipo = ["sitelink", "callout", "snippet"].includes(input.tipo) ? input.tipo : null;
  if (!tipo) return { ok: false, errore: "Tipo di estensione non riconosciuto." };

  const campagna = await prisma.campagna.findUnique({
    where: { id: input.campagnaId },
    select: { id: true, nome: true, canale: true, idEsterno: true, account: true },
  });
  if (!campagna) return { ok: false, errore: "Campagna non trovata." };
  if (campagna.canale !== "google_ads") {
    return {
      ok: false,
      errore: "Le estensioni si creano solo sulle campagne Google: su Meta non esistono con questa forma.",
    };
  }

  // I minimi di Google, ripetuti qui perché una regola che vive solo nel
  // browser non è una regola.
  if (tipo === "sitelink" && (!input.testo || !/^https?:\/\//i.test(input.url))) {
    return { ok: false, errore: "Un sitelink vuole il testo del link e una destinazione che cominci con http:// o https://." };
  }
  if (tipo === "callout" && !input.testo) return { ok: false, errore: "Il callout vuole il testo." };
  if (tipo === "snippet" && (!input.header || input.valori.filter(Boolean).length < 3)) {
    return { ok: false, errore: "Uno snippet vuole l'intestazione e almeno 3 valori: è il minimo di Google, non una nostra preferenza." };
  }

  // ⚠️ Il doppione: la stessa estensione, sulla stessa campagna, o già
  // presente nell'archivio letto da Google. Aggiungerla di nuovo non rompe
  // niente ma sporca il conto e non si vede più a cosa serve.
  const chiave = tipo === "snippet" ? input.header : input.testo;
  const gia = await prisma.copyAnnuncio.findFirst({
    where: {
      tipo: tipo === "snippet" ? "snippet" : tipo,
      campagna: campagna.nome,
      testo: { equals: chiave, mode: "insensitive" },
    },
  });
  if (gia) {
    return {
      ok: false,
      errore: `Su questa campagna c'è già «${chiave}»: non ne aggiungo una seconda uguale.`,
    };
  }
  const inCoda = await prisma.operazioneAdv.findFirst({
    where: {
      tipo: "estensione",
      campagnaId: campagna.id,
      stato: { in: ["in_attesa", "approvata"] },
      parametri: { contains: chiave },
    },
  });
  if (inCoda) return { ok: false, errore: `«${chiave}» è già in coda per questa campagna.` };

  const op = await accodaOperazione({
    data: {
      tipo: "estensione",
      canale: campagna.canale,
      account: campagna.account,
      bersaglio: campagna.nome,
      idEsterno: campagna.idEsterno,
      campagnaId: campagna.id,
      parametri: JSON.stringify({
        tipo,
        testo: input.testo,
        url: input.url,
        descrizione1: input.descrizione1 || null,
        descrizione2: input.descrizione2 || null,
        header: input.header,
        valori: input.valori.filter(Boolean).slice(0, 10),
      }),
      motivo: `Nuova estensione ${tipo}: «${chiave}»`,
      livello: "L0",
      prima: "assente",
    },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    entitaId: op.id,
    titolo: `In coda (da approvare): ${tipo} «${chiave}» su ${campagna.nome}`,
    dettaglio: "L'estensione nasce nell'account e viene agganciata a questa campagna.",
  });

  revalidatePath(input.ritorno.split("?")[0]);
  revalidatePath("/operazioni");
  return { ok: true, messaggio: `Estensione «${chiave}» messa in coda: ora va approvata.` };
}
// ---------- Riportare in attesa un'operazione già approvata ----------
// Diverso da annullare: annullare la scarta, questo la rimette in coda da
// decidere. Serve quando si approva in fretta e poi si vuole ripensarci senza
// perdere l'operazione — il testo, il motivo e il livello restano quelli.
// Vale solo finché lo script non l'ha eseguita: dopo, l'unica strada è
// l'operazione opposta.
export async function riapriOperazione(fd: FormData) {
  // Da dove si veniva: si conserva nel redirect, cosi il bottone «torna
  // dove eri» resta anche dopo il click che lo rendeva utile.
  const torna = testo(fd, "torna");
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
  if (torna) redirect(`/operazioni?torna=${encodeURIComponent(torna)}`);
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
  // ⚠️ Più parole in un colpo solo. Il dialogo può arrivare con una parola
  // (dalla riga) o con dieci (dalla selezione multipla): `getAll` le prende
  // tutte, e il resto del lavoro è lo stesso per ognuna. Con più parole la
  // traduzione NON si applica — una casella sola non può correggerne dieci, e
  // proporre dieci traduzioni non verificate è peggio che non tradurle.
  const parole = fd
    .getAll("testo")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const piuParole = parole.length > 1;
  const parola = parole[0];
  const ritorno = testo(fd, "ritorno") ?? "/keywords";
  // ⚠️ Il ripiego è la corrispondenza più STRETTA, non la più larga: se il
  // dialogo non manda niente, «generica» su una parola nata esatta comprerebbe
  // molte più ricerche di quelle volute.
  const corrispondenza = testo(fd, "corrispondenza") ?? "exact";
  // Il motivo, se chi chiama ne ha uno più vero di quello standard: le parole
  // proposte dall'AI non sono «portate da un'altra campagna», e scriverlo
  // sarebbe falso. Chi approva deve leggere da dove nasce davvero la parola.
  const motivoDichiarato = testo(fd, "motivo");
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

  const campagne = await prisma.campagna.findMany({
    where: { id: { in: destinazioni } },
    include: { incidenti: { where: { stato: "aperto" }, select: { codice: true } } },
  });

  const fatte: string[] = [];
  const saltate: string[] = [];

  for (const parolaOra of parole) {
  const pulito = testoKeywordPulito(parolaOra);
  for (const c of campagne) {
    // Il freeze da incidente non salta più la campagna: l'operazione entra in
    // coda con l'avviso addosso, e chi approva decide.
    const avvisoFreeze =
      c.incidenti.length > 0
        ? `Incidente ${c.incidenti[0].codice} APERTO su questa campagna: finché non è chiuso, quello che si misura è sporcato dal guasto.`
        : null;

    // Se la parola c'è già in quella campagna non si riaccoda: succede
    // spuntando una campagna che la aveva già, e in coda comparirebbe
    // un'aggiunta che Google rifiuterebbe come duplicata.
    //
    // ⚠️ Il confronto era `contains`, e diceva «ce l'ha già» per parole
    // DIVERSE che contenevano quella. Misurato il 05/08/2026 su «fiori a
    // domicilio milano» in «[Deluxy] - Fiori Milano ITA»: tre righe trovate —
    // «mandare fiori a domicilio milano», «… e provincia», «… in giornata» —
    // e **nessuna** era quella parola. L'aggiunta veniva rifiutata a torto, e
    // il messaggio non diceva quale riga l'avesse bloccata, quindi l'errore
    // era invisibile. Ora `contains` fa solo da setaccio grosso e la decisione
    // la prende il confronto sul testo ripulito.
    // Il testo per QUESTA campagna. La casella del dialogo è la fonte —
    // l'app propone, la persona decide.
    //
    // ⚠️ La chiave è la CAMPAGNA, non la lingua. Prima era `testo_${lingua}`, e
    // due campagne della stessa lingua ma di città diverse ricevevano per forza
    // lo stesso testo: «rome flower delivery service» finiva identica su Roma e
    // su Milano. Sbagliare città costa come sbagliare lingua.
    const riscritto = piuParole ? null : testo(fd, `testo_${c.id}`);
    const pulitoQui = riscritto ? testoKeywordPulito(riscritto) : pulito;
    // ⚠️ In quale GRUPPO finisce. Senza, `creaKeyword` nello script prende il
    // primo gruppo attivo della campagna: la parola compra le ricerche giuste
    // con gli annunci sbagliati, e non lo dice nessuno.
    const gruppoScelto = testo(fd, `gruppo_${c.id}`);

    const candidate = await prisma.copyAnnuncio.findMany({
      where: { tipo: "keyword", campagna: c.nome, testo: { contains: pulitoQui } },
      select: { testo: true },
    });
    const gia = candidate.find(
      (k) => testoKeywordPulito(k.testo).toLowerCase() === pulitoQui.toLowerCase()
    );
    if (gia) {
      // Si dice QUALE riga l'ha bloccata: senza, «ce l'ha già» è una parola
      // contro l'altra e non c'è modo di accorgersi se è sbagliata.
      saltate.push(`${c.nome} (ce l'ha già come «${gia.testo}»)`);
      continue;
    }

    await accodaOperazione({
      data: {
        tipo: "nuova_keyword",
        canale: c.canale,
        bersaglio: c.nome,
        idEsterno: c.idEsterno,
        parametri: JSON.stringify({
          testo: pulitoQui,
          corrispondenza,
          ...(gruppoScelto ? { gruppo: gruppoScelto } : {}),
        }),
        motivo:
          motivoDichiarato ??
          (pulitoQui.toLowerCase() !== pulito.toLowerCase()
            ? `Portata da un'altra campagna e riscritta per questa: «${pulito}» → «${pulitoQui}»`
            : `Portata da un'altra campagna: funzionava lì`),
        avvisi: avvisoFreeze,
        livello: "L1",
        prima: "assente",
        campagnaId: c.id,
      },
    });
    fatte.push(
      piuParole
        ? `«${pulitoQui}» su ${c.nome}`
        : pulitoQui.toLowerCase() !== pulito.toLowerCase()
          ? `${c.nome} («${pulitoQui}»)`
          : c.nome
    );
  }
  }

  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    titolo: piuParole
      ? `${parole.length} parole in coda: ${fatte.length} operazioni`
      : `«${testoKeywordPulito(parola)}» in coda su ${fatte.length} campagne`,
    dettaglio:
      (fatte.length > 0 ? fatte.join(" · ") : "nessuna") +
      (saltate.length > 0 ? ` · saltate: ${saltate.join(", ")}` : ""),
  });

  // ⚠️ Prima qui c'era `redirect("/operazioni")` e basta. Se tutte le campagne
  // scelte venivano saltate — la parola c'era già, o la campagna è congelata —
  // l'utente atterrava su una pagina dove non era comparso niente di nuovo e
  // nessuno gli diceva perché: dal di fuori è un bottone che non funziona.
  // Le saltate finivano solo nello storico, che non è dove uno guarda.
  const comeSiChiama = piuParole ? `${parole.length} parole` : `«${testoKeywordPulito(parola)}»`;
  const messaggio =
    fatte.length > 0
      ? `${comeSiChiama} in coda: ${fatte.length} operazion${fatte.length === 1 ? "e" : "i"} — ${fatte.join(" · ")}`
      : `${comeSiChiama}: niente è entrato in coda`;
  // ⚠️ Si torna DOVE si era, non sempre in coda. Chi mette in coda dieci
  // parole di fila veniva sbalzato su /operazioni ogni volta e doveva rifare
  // tutto il percorso: filtro, tema, riga, dialogo. Il `ritorno` il dialogo lo
  // manda già — veniva solo buttato via qui in fondo.
  //
  // L'esito viaggia col ritorno: si vede cos'è successo senza che la pagina
  // cambi sotto i piedi, e alla coda ci si va quando si vuole.
  const qs = new URLSearchParams({ esito: messaggio });
  if (saltate.length > 0) qs.set("saltate", saltate.join(" · "));
  const separatore = ritorno.includes("?") ? "&" : "?";
  redirect(`${ritorno}${separatore}${qs.toString()}`);
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
  // ⚠️ `revalidatePath` da solo non basta, ed è la seconda volta: il dato sul
  // database cambia, ma il menù torna a mostrare il valore di prima finché non
  // si ricarica a mano. Chi lo usa vede «a frase» diventare di nuovo «esatta»
  // da solo e conclude che il salvataggio non funziona — mentre ha funzionato.
  // Il ritorno esplicito rirende la pagina e il menù segue il dato.
  // (Stessa cosa su `impostaLinguaCampagna`, 06/08/2026.)
  redirect("/operazioni");
}

// ---------- Liste esclusioni: le regole con cui una ricerca finisce negativa ----------

/** Accende o spegne le regole e aggiorna l'elenco dei concorrenti. */
export async function salvaRegoleEsclusione(fd: FormData) {
  const { CHIAVE_REGOLE, CHIAVE_CONCORRENTI } = await import("./esclusioni");
  const attive = fd.getAll("regola").map((v) => String(v)).join(",");
  const concorrenti = testo(fd, "concorrenti") ?? "";

  // ⚠️ Si scrive sempre, anche la stringa vuota: "nessuna regola accesa" è una
  // scelta, e trattarla come "non ho ricevuto niente" renderebbe impossibile
  // spegnere l'ultima regola.
  for (const [chiave, valore] of [
    [CHIAVE_REGOLE, attive],
    [CHIAVE_CONCORRENTI, concorrenti],
  ] as const) {
    await prisma.impostazione.upsert({
      where: { chiave },
      create: { chiave, valore },
      update: { valore },
    });
  }
  redirect("/esclusioni?salvato=1");
}

/**
 * Passa in rassegna le parole cercate e mette in coda una negativa per ognuna
 * che una regola accesa colpisce.
 *
 * ⚠️ **Non esclude niente da sé.** Ogni riga diventa un'operazione `in_attesa`
 * con scritto DA DOVE viene: le regole propongono, una persona approva. Una
 * regola che spegne traffico senza che nessuno la guardi è il modo di perdere
 * ricerche buone e accorgersene dal fatturato.
 */
export async function applicaRegoleEsclusione(fd: FormData) {
  const { CHIAVE_REGOLE, CHIAVE_CONCORRENTI, concorrentiDa, regoleAttiveDa, valutaRicerca } =
    await import("./esclusioni");
  const { linguaDaNome } = await import("./vendite-campagna");

  const soloCampagna = testo(fd, "campagnaId");

  const [impRegole, impConcorrenti] = await Promise.all([
    prisma.impostazione.findUnique({ where: { chiave: CHIAVE_REGOLE } }),
    prisma.impostazione.findUnique({ where: { chiave: CHIAVE_CONCORRENTI } }),
  ]);
  const attive = regoleAttiveDa(impRegole?.valore);
  const concorrenti = concorrentiDa(impConcorrenti?.valore);

  if (attive.length === 0) {
    redirect(`/esclusioni?bloccata=${encodeURIComponent("Nessuna regola accesa: non c'è niente da applicare.")}`);
  }

  // Una lettura sola: termini + campagne. Una query per termine su Postgres
  // remoto vorrebbe dire centinaia di andate e ritorno.
  const termini = await prisma.termineRicerca.findMany({
    where: soloCampagna ? { campagnaId: soloCampagna } : {},
    select: { id: true, testo: true, campagnaId: true, spesa: true, clic: true, conversioni: true },
  });
  const idCampagne = [...new Set(termini.map((t) => t.campagnaId))];
  const campagne = await prisma.campagna.findMany({
    where: { id: { in: idCampagne }, stato: { notIn: ["defunta", "conclusa"] } },
    select: { id: true, nome: true, canale: true, idEsterno: true },
  });
  const perId = new Map(campagne.map((c) => [c.id, c]));

  // Le negative già in coda o già eseguite: non se ne accodano due uguali.
  const gia = await prisma.operazioneAdv.findMany({
    where: { tipo: "negativa", stato: { in: ["in_attesa", "approvata", "eseguita"] } },
    select: { campagnaId: true, parametri: true },
  });
  const giaFatte = new Set(
    gia.map((o) => {
      let t = "";
      try {
        t = String((JSON.parse(o.parametri ?? "{}") as { testo?: string }).testo ?? "");
      } catch {
        t = "";
      }
      return `${o.campagnaId ?? ""}|${t.toLowerCase()}`;
    })
  );

  const messe: string[] = [];
  const perRegola: Record<string, number> = {};

  for (const t of termini) {
    const c = perId.get(t.campagnaId);
    if (!c) continue;
    const v = valutaRicerca(t.testo, {
      linguaCampagna: linguaDaNome(c.nome),
      attive,
      concorrenti,
    });
    if (!v) continue;
    if (giaFatte.has(`${c.id}|${t.testo.toLowerCase()}`)) continue;
    giaFatte.add(`${c.id}|${t.testo.toLowerCase()}`);

    await accodaOperazione({
      data: {
        tipo: "negativa",
        canale: c.canale,
        bersaglio: c.nome,
        idEsterno: c.idEsterno,
        // ⚠️ Esatta, non generica: si esclude QUESTA ricerca, non ogni ricerca
        // che contenga quelle parole. Una negativa generica nata da una regola
        // automatica spegnerebbe molto più del voluto.
        parametri: JSON.stringify({ testo: t.testo, corrispondenza: "exact" }),
        motivo: `Regola «${v.regola}»: ${v.motivo}`,
        livello: "L0",
        prima: "assente",
        campagnaId: c.id,
        // Da dove viene: in approvazione si legge che NON l'ha chiesta una persona.
        richiestaDa: "regole-ai",
      },
    });
    perRegola[v.regola] = (perRegola[v.regola] ?? 0) + 1;
    messe.push(`«${t.testo}» su ${c.nome}`);
  }

  await registra({
    autore: "regole-ai",
    tipo: "creazione",
    entita: "operazione",
    titolo: `Liste esclusioni: ${messe.length} negative proposte`,
    dettaglio:
      Object.entries(perRegola)
        .map(([r, n]) => `${r}: ${n}`)
        .join(" · ") || "nessuna",
  });

  const riepilogo =
    messe.length === 0
      ? "Nessuna ricerca colpita dalle regole accese: niente da approvare."
      : `${messe.length} negative in coda da approvare — ` +
        Object.entries(perRegola)
          .map(([r, n]) => `${r}: ${n}`)
          .join(" · ");
  redirect(`/operazioni?esito=${encodeURIComponent(riepilogo)}`);
}

/**
 * Corregge il testo di una parola in coda, prima che diventi vera.
 *
 * ⚠️ **Solo finché è `in_attesa`.** La corrispondenza si può ritoccare anche
 * su un'operazione già approvata, il testo no: chi ha approvato ha approvato
 * *quella* parola, e cambiargliela sotto vorrebbe dire eseguire una cosa che
 * nessuno ha guardato. Se serve, si ritira l'approvazione e poi si corregge.
 */
export async function cambiaTestoOperazione(fd: FormData) {
  const id = testo(fd, "id");
  const nuovo = testo(fd, "testo");
  if (!id || !nuovo) return;

  const op = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!op) return;
  if (op.stato !== "in_attesa") {
    redirect(
      `/operazioni?bloccata=${encodeURIComponent(
        "Il testo si corregge solo finché l'operazione è da approvare: ritira l'approvazione e riprova."
      )}`
    );
  }

  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(op.parametri ?? "{}");
  } catch {
    p = {};
  }
  const prima = String(p.testo ?? op.bersaglio);
  const pulito = testoKeywordPulito(nuovo);
  if (pulito === "" || pulito.toLowerCase() === prima.toLowerCase()) {
    redirect("/operazioni");
  }
  p.testo = pulito;

  await prisma.operazioneAdv.update({
    where: { id },
    data: {
      parametri: JSON.stringify(p),
      // Il motivo porta la correzione con sé: chi approva domani deve poter
      // vedere che la parola non è più quella che era stata proposta.
      motivo: `${op.motivo ? `${op.motivo} · ` : ""}Testo corretto a mano: «${prima}» → «${pulito}»`,
    },
  });

  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: `Testo dell'operazione: «${prima}» → «${pulito}»`,
    dettaglio: `${op.tipo} su ${op.bersaglio}`,
  });

  // ⚠️ Non basta `revalidatePath`: è la stessa trappola già pagata due volte
  // sui menù controllati. Si torna alla pagina, così quello che si legge è
  // quello che c'è sul database.
  redirect(`/operazioni?esito=${encodeURIComponent(`Testo corretto: «${prima}» → «${pulito}»`)}`);
}


/** Il menù «vai a un altro gruppo» in cima alla scheda gruppo. */
export async function vaiAlGruppo(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  redirect(`/gruppi/${id}`);
}

/**
 * Corregge a mano il brand di una campagna.
 *
 * ⚠️ **Da qui in poi nessun import lo tocca** (`brandManuale`), come per il
 * legame Shopify scelto a mano. Senza il blocco, una sync mirata su un account
 * rimetterebbe il brand di quell'account e la correzione durerebbe fino al
 * giro dopo — che è il modo di far sembrare l'app rotta mentre funziona.
 *
 * Nasce da un caso vero (09/08/2026): `[Palloncini] - AWARENESS` risultava di
 * Cake con **1.137,67 €** di spesa attribuiti, e sul conto Meta di Cake quella
 * campagna non esiste. Non c'era nessun modo di correggerlo dall'app.
 */
export async function impostaBrandCampagna(campagnaId: string, fd: FormData) {
  if (!campagnaId) return;
  const scelto = testo(fd, "brand");
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    select: { id: true, nome: true, brand: true, account: true },
  });
  if (!campagna) return;

  // Svuotare il campo vuol dire «torna a dedurlo»: si toglie il blocco e il
  // prossimo import rimette il brand dell'account. È l'annullamento, e deve
  // esistere — una scelta che non si può disfare è una trappola.
  if (!scelto) {
    await prisma.campagna.update({ where: { id: campagnaId }, data: { brandManuale: false } });
    await registra({
      autore: "utente",
      tipo: "modifica",
      entita: "campagna",
      entitaId: campagnaId,
      titolo: `Brand di "${campagna.nome}": torna a dedurlo dall'account`,
    });
    redirect(testo(fd, "ritorno") || `/campagne/${campagnaId}`);
  }

  if (!(BRANDS as readonly string[]).includes(scelto) && scelto !== "cross") return;
  if (campagna.brand === scelto && true) {
    // Stesso brand ma scelto a mano: si segna comunque il blocco, altrimenti
    // «confermo che è giusto» non avrebbe modo di essere detto.
    await prisma.campagna.update({ where: { id: campagnaId }, data: { brandManuale: true } });
    redirect(testo(fd, "ritorno") || `/campagne/${campagnaId}`);
  }

  await prisma.campagna.update({
    where: { id: campagnaId },
    data: { brand: scelto, brandManuale: true },
  });
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "campagna",
    entitaId: campagnaId,
    titolo: `Brand di "${campagna.nome}": ${campagna.brand} → ${scelto}`,
    dettaglio: `deciso a mano; nessun import lo sovrascrive più${
      campagna.account ? ` · account letto dall'import: ${campagna.account}` : " · account non ancora noto"
    }`,
  });
  revalidatePath(`/campagne/${campagnaId}`);
  revalidatePath("/campagne");
  // ⚠️ Ritorno esplicito, non solo `revalidatePath`: è la terza volta che un
  // `<select>` controllato torna al valore vecchio e sembra che non abbia
  // salvato. Vedi `impostaLinguaCampagna` e `cambiaCorrispondenzaOperazione`.
  redirect(testo(fd, "ritorno") || `/campagne/${campagnaId}`);
}

/**
 * La lingua di un gruppo di annunci: quella VERA, quella in cui gli annunci
 * sono scritti.
 *
 * ⚠️ Sta sul gruppo e non sulla campagna perché è qui che la domanda ha una
 * risposta secca. Una campagna può servire due pubblici insieme — «Gifts
 * Milano» con dentro «Regali in Italiano» e «Regali Inglese» — e infatti le
 * sue lingue si dichiarano al plurale. Il gruppo parla una lingua e basta.
 *
 * Svuotare il campo torna alla deduzione dal nome: una scelta che non si può
 * disfare è una trappola.
 */
export async function impostaLinguaGruppo(gruppoId: string, fd: FormData) {
  if (!gruppoId) return;
  const scelta = testo(fd, "lingua");
  const { LINGUE_CAMPAGNA } = await import("./vendite-campagna");
  const lingua =
    scelta && (LINGUE_CAMPAGNA as readonly string[]).includes(scelta) ? scelta : null;

  const gruppo = await prisma.gruppo.findUnique({
    where: { id: gruppoId },
    select: { id: true, nome: true, lingua: true },
  });
  if (!gruppo || gruppo.lingua === lingua) {
    redirect(testo(fd, "ritorno") || `/gruppi/${gruppoId}`);
  }

  await prisma.gruppo.update({ where: { id: gruppoId }, data: { lingua } });
  await registra({
    autore: "utente",
    tipo: "modifica",
    entita: "gruppo",
    entitaId: gruppoId,
    titolo: `Lingua del gruppo "${gruppo!.nome}": ${lingua ?? "torna alla deduzione dal nome"}`,
    dettaglio: "è la lingua in cui sono scritti gli annunci di questo gruppo",
  });
  revalidatePath(`/gruppi/${gruppoId}`);
  // ⚠️ Ritorno esplicito: `revalidatePath` da solo lascia il menù sul valore
  // vecchio, ed è la quarta volta che questa trappola si presenta.
  redirect(testo(fd, "ritorno") || `/gruppi/${gruppoId}`);
}
