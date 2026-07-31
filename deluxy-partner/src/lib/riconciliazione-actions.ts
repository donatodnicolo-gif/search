"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { aggiornaAnagrafica, creaAnagrafica, anagraficaPerId, type CampiAnagrafica } from "./anagrafiche";
import { campiPropostiPerNome } from "./riconciliazione-fic";
import { ibanValido, diagnosiIban } from "./impostazioni";
import { allineaPartnerDaRegistro } from "./allinea-registro";
import { registra } from "./registro";

// Conferma la riconciliazione di un cliente FIC e INVIA i campi al registro
// Anagrafiche (solo se la scrittura è configurata). L'azione parte solo da un
// click esplicito dell'operatore, un record per volta.
export async function confermaRiconciliazione(
  ficNome: string,
  partnerId: string,
  anagraficaId: string,
  campiJson: string
) {
  // Ricalcola SEMPRE i campi lato server dai dati FIC correnti: così la conferma
  // usa la logica aggiornata (es. include la ragione sociale) anche se la pagina
  // nel browser è una versione vecchia. Fallback al payload della pagina solo se
  // il cliente FIC non è più reperibile.
  let campi: CampiAnagrafica = await campiPropostiPerNome(ficNome);
  if (Object.keys(campi).length === 0) {
    try {
      campi = JSON.parse(campiJson);
    } catch {
      campi = {};
    }
  }

  const res = await aggiornaAnagrafica(anagraficaId, campi);
  const esito = res.ok ? "ok" : res.errore;

  // IL COLLEGAMENTO SUL PARTNER. Mancava: la conferma scriveva solo la propria
  // tabella, e la scheda ritrovava il record del registro soltanto perché lo
  // cercava per nome a ogni apertura — finché il nome combaciava. Un partner
  // «riconciliato» ma non collegato è, per il resto dell'app, un partner senza
  // dati fiscali: è così che una fattura elettronica si blocca.
  if (res.ok) {
    await prisma.partner.update({ where: { id: partnerId }, data: { anagraficaId } });
    // e si porta in locale ciò che serve FUORI dalla scheda: il beneficiario
    // dei bonifici e l'email dell'amministrazione per i solleciti.
    await allineaPartnerDaRegistro(partnerId).catch(() => null);
    revalidatePath(`/partner/${partnerId}`, "layout");
  }

  await prisma.riconciliazioneAnagrafica.upsert({
    where: { ficNome },
    create: {
      ficNome,
      partnerId,
      anagraficaId,
      stato: res.ok ? "confermata" : "ignorata",
      campiInviati: Object.keys(campi).join(", ") || null,
      esito,
    },
    update: {
      partnerId,
      anagraficaId,
      // se l'invio fallisce non marchiamo "confermata": resta da ritentare
      ...(res.ok ? { stato: "confermata" } : {}),
      campiInviati: Object.keys(campi).join(", ") || null,
      esito,
    },
  });

  revalidatePath("/registrazioni/riconciliazione", "layout");
}

// Crea il partner nel registro Anagrafiche (o lo aggancia se già esiste per
// nome+città) con i dati osservati, e collega l'id al partner Deluxy
// (anagraficaId). Da usare per i partner abbinati ma non ancora nel registro.
export async function creaInAnagrafiche(partnerId: string, campiJson: string) {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) redirect("/registrazioni/riconciliazione?errore=" + encodeURIComponent("Partner non trovato."));
  if (partner.anagraficaId) {
    // già collegato: niente da creare
    redirect("/registrazioni/riconciliazione");
  }
  let campi: CampiAnagrafica = {};
  try {
    campi = JSON.parse(campiJson);
  } catch {
    campi = {};
  }
  const res = await creaAnagrafica({
    nome: partner.nome,
    ragioneSociale: partner.ragioneSociale,
    citta: partner.citta,
    categoria: partner.categoria,
    idEsterno: partner.id,
    campi,
  });
  if (!res.ok) {
    redirect("/registrazioni/riconciliazione?errore=" + encodeURIComponent(res.errore));
  }
  // collega l'anagrafica creata al partner Deluxy
  await prisma.partner.update({ where: { id: partnerId }, data: { anagraficaId: res.id } });
  await prisma.riconciliazioneAnagrafica.upsert({
    where: { ficNome: partner.nome },
    create: { ficNome: partner.nome, partnerId, anagraficaId: res.id, stato: "confermata", campiInviati: Object.keys(campi).join(", ") || null, esito: `${res.esito} nel registro` },
    update: { anagraficaId: res.id, stato: "confermata", esito: `${res.esito} nel registro` },
  });
  revalidatePath("/registrazioni/riconciliazione", "layout");
  revalidatePath(`/partner/${partnerId}`, "layout");
  redirect(`/registrazioni/riconciliazione?creato=${encodeURIComponent(partner.nome)}`);
}

// Salva i dati bancari (IBAN, intestatario del conto, banca) di un partner: li
// scrive sul partner (per i bonifici SEPA futuri) e, se la scrittura è attiva,
// li invia al registro Anagrafiche (datiFinanziari).
//
// L'intestatario non è un di più: è il nome a cui esce il bonifico, la banca
// controlla che combaci con l'IBAN e col nome sbagliato il pagamento viene
// rifiutato. Non si deduce dall'insegna — «NEGOZIO ROSATO» incassa su un conto
// intestato a un'altra società — quindi si prende da chi abbiamo già pagato
// (beneficiari Qonto) e si corregge a mano dove serve.
export type EsitoSalvataggio = { ok: boolean; testo: string } | null;

// Versione che NON ricarica la pagina: torna l'esito al componente, che lo
// mostra accanto alla riga.
//
// Serve perché questa pagina interroga Fatture in Cloud e Qonto: ricostruirla
// dopo ogni salvataggio costa secondi, e con cinquanta righe da compilare
// significa aspettare cinquanta volte per un dato che riguarda una riga sola.
// Il redirect è rimasto solo dove serve davvero (errori di validazione a monte).
export async function salvaDatiBancariInline(
  partnerId: string,
  anagraficaId: string | null,
  _precedente: EsitoSalvataggio,
  fd: FormData
): Promise<EsitoSalvataggio> {
  const iban = String(fd.get("iban") ?? "").replace(/\s/g, "").toUpperCase();
  const banca = String(fd.get("banca") ?? "").trim();
  const intestatarioConto = String(fd.get("intestatarioConto") ?? "").trim();

  const diag = iban ? diagnosiIban(iban) : { ok: true as const };
  if (!diag.ok) {
    return {
      ok: false,
      testo:
        `IBAN rifiutato: ${diag.motivo}.` +
        (diag.forse ? ` Forse è ${diag.forse} (la I si scambia col 1, la O con lo 0).` : ""),
    };
  }

  await prisma.partner.update({
    where: { id: partnerId },
    data: { iban: iban || null, intestatarioConto: intestatarioConto || null },
  });

  const salvati = [
    iban ? "IBAN" : null,
    intestatarioConto ? "intestatario" : null,
    banca ? "banca" : null,
  ].filter(Boolean);
  const cosa = salvati.length ? salvati.join(" + ") : "campi svuotati";

  if (anagraficaId && (iban || banca || intestatarioConto)) {
    const res = await aggiornaAnagrafica(anagraficaId, {
      ...(iban ? { iban } : {}),
      ...(intestatarioConto ? { intestatarioConto } : {}),
      ...(banca ? { banca } : {}),
    });
    if (!res.ok) return { ok: false, testo: `Salvato qui, ma il registro no: ${res.errore}` };
    return { ok: true, testo: `${cosa} — salvati anche in Anagrafiche` };
  }
  // la scheda partner mostra questi dati: quella va rinfrescata
  revalidatePath(`/partner/${partnerId}`, "layout");
  return { ok: true, testo: `${cosa} — salvati (nessun record collegato nel registro)` };
}


// Segna un cliente FIC come "ignorato" (non riproporlo nella riconciliazione).
export async function ignoraRiconciliazione(ficNome: string, partnerId?: string) {
  await prisma.riconciliazioneAnagrafica.upsert({
    where: { ficNome },
    create: { ficNome, partnerId: partnerId ?? null, stato: "ignorata" },
    update: { stato: "ignorata" },
  });
  revalidatePath("/registrazioni/riconciliazione", "layout");
}

// Riporta un cliente FIC in "da riconciliare" (annulla conferma/ignora).
export async function riapriRiconciliazione(ficNome: string) {
  await prisma.riconciliazioneAnagrafica.deleteMany({ where: { ficNome } });
  revalidatePath("/registrazioni/riconciliazione", "layout");
}

// Abbina MANUALMENTE un cliente "solo FIC" (senza match automatico) a un partner
// FINANCE scelto dall'operatore, e ne porta i dati fiscali nel registro. Se il
// partner è già nel registro aggiorna; altrimenti lo crea e lo collega.
export async function riconciliaManuale(ficNome: string, fd: FormData) {
  const rif = String(fd.get("partner") ?? "").trim();
  const err = (m: string) => redirect("/registrazioni/riconciliazione?errore=" + encodeURIComponent(m));
  if (!rif) err("Scegli un partner FINANCE da abbinare al cliente FIC.");
  // risolvi il partner per id, poi per nome esatto, poi per nome parziale univoco
  let partnerOk =
    (await prisma.partner.findUnique({ where: { id: rif } })) ??
    (await prisma.partner.findFirst({ where: { nome: { equals: rif, mode: "insensitive" } } }));
  if (!partnerOk) {
    const sim = await prisma.partner.findMany({ where: { nome: { contains: rif, mode: "insensitive" } }, take: 2 });
    partnerOk = sim.length === 1 ? sim[0] : null;
  }
  if (!partnerOk) {
    redirect("/registrazioni/riconciliazione?errore=" + encodeURIComponent(`Nessun partner FINANCE corrisponde a «${rif}». Scrivi il nome esatto.`));
  }
  const partner = partnerOk; // non-null: sopra abbiamo già fatto redirect se null

  const campi: CampiAnagrafica = await campiPropostiPerNome(ficNome);
  const campiInviati = Object.keys(campi).join(", ") || null;

  if (partner.anagraficaId) {
    const res = await aggiornaAnagrafica(partner.anagraficaId, campi);
    await prisma.riconciliazioneAnagrafica.upsert({
      where: { ficNome },
      create: { ficNome, partnerId: partner.id, anagraficaId: partner.anagraficaId, stato: res.ok ? "confermata" : "ignorata", campiInviati, esito: res.ok ? "ok" : res.errore },
      update: { partnerId: partner.id, anagraficaId: partner.anagraficaId, ...(res.ok ? { stato: "confermata" } : {}), campiInviati, esito: res.ok ? "ok" : res.errore },
    });
    if (!res.ok) err(res.errore);
  } else {
    const res = await creaAnagrafica({
      nome: partner.nome,
      ragioneSociale: partner.ragioneSociale,
      citta: partner.citta,
      categoria: partner.categoria,
      idEsterno: partner.id,
      campi,
    });
    if (!res.ok) {
      redirect("/registrazioni/riconciliazione?errore=" + encodeURIComponent(res.errore));
    }
    await prisma.partner.update({ where: { id: partner.id }, data: { anagraficaId: res.id } });
    await prisma.riconciliazioneAnagrafica.upsert({
      where: { ficNome },
      create: { ficNome, partnerId: partner.id, anagraficaId: res.id, stato: "confermata", campiInviati, esito: `${res.esito} nel registro` },
      update: { partnerId: partner.id, anagraficaId: res.id, stato: "confermata", esito: `${res.esito} nel registro` },
    });
  }
  revalidatePath("/registrazioni/riconciliazione", "layout");
  redirect(`/registrazioni/riconciliazione?creato=${encodeURIComponent(`${ficNome} → ${partner.nome}`)}`);
}

// Collega un partner FINANCE a un'anagrafica GIÀ ESISTENTE nel registro, dato il
// suo id (o l'URL della scheda). Serve quando i due nomi non combaciano — es.
// «DR VRANJES gennaio» qui e «Dr. Vranjes» nel registro — dove la riconciliazione
// automatica non aggancia e «Crea in Anagrafiche» produrrebbe un doppione.
export async function collegaAnagraficaEsistente(partnerId: string, fd: FormData) {
  const grezzo = String(fd.get("anagraficaRif") ?? "").trim();
  const err = (m: string) => redirect(`/partner/${partnerId}?anag=${encodeURIComponent(m)}`);
  if (!grezzo) err("Incolla l'id o il link della scheda in Anagrafiche.");
  // accetta sia l'id nudo sia un URL tipo .../partner/<id>
  const id = grezzo.includes("/") ? grezzo.replace(/[?#].*$/, "").split("/").filter(Boolean).pop()! : grezzo;

  const anagrafica = await anagraficaPerId(id);
  if (!anagrafica) {
    err(`Nessuna anagrafica trovata con id «${id}» (o registro non raggiungibile).`);
  }
  // l'id del registro è unico su Partner: se un altro lo usa, spiega chi
  const altro = await prisma.partner.findFirst({
    where: { anagraficaId: id, NOT: { id: partnerId } },
    select: { nome: true },
  });
  if (altro) err(`Quell'anagrafica è già collegata al partner «${altro.nome}».`);

  await prisma.partner.update({ where: { id: partnerId }, data: { anagraficaId: id } });
  revalidatePath(`/partner/${partnerId}`, "layout");
  revalidatePath("/registrazioni/riconciliazione", "layout");
  redirect(`/partner/${partnerId}?anag=${encodeURIComponent(`Collegato a «${anagrafica!.nome}» nel registro`)}`);
}

// Toglie il collegamento col registro (per correggere un abbinamento sbagliato).
// Non tocca i dati nel registro: rimuove solo il riferimento su questo partner.
export async function scollegaAnagrafica(partnerId: string) {
  await prisma.partner.update({ where: { id: partnerId }, data: { anagraficaId: null } });
  revalidatePath(`/partner/${partnerId}`, "layout");
  revalidatePath("/registrazioni/riconciliazione", "layout");
  redirect(`/partner/${partnerId}?anag=${encodeURIComponent("Collegamento al registro rimosso")}`);
}

// Forza il ricarico dei dati esterni in cache (clienti FIC + beneficiari Qonto):
// utile dopo aver aggiunto un cliente in FIC o un beneficiario in Qonto, senza
// aspettare la scadenza dei 10 minuti.
export async function aggiornaDatiEsterniRiconciliazione() {
  revalidateTag("ric-fic");
  revalidateTag("ric-qonto");
  revalidatePath("/registrazioni/riconciliazione", "layout");
  redirect("/registrazioni/riconciliazione?aggiornato=1");
}

// Riallinea in locale i dati anagrafici di TUTTI i partner leggendoli dal
// registro. Da usare dopo una serie di riconciliazioni, o quando ci si accorge
// che una scheda mostra i dati del registro ma l'app non li vede (perché li
// legge dalla copia locale, che era rimasta vuota).
export async function allineaAnagraficheTutti() {
  const { allineaTuttiDaRegistro } = await import("./allinea-registro");
  const esiti = await allineaTuttiDaRegistro();
  const cambiati = esiti.filter((e) => e.campi.length > 0);
  const scollegati = esiti.filter((e) => !e.collegato);
  await registra({
    azione: `Anagrafiche riallineate dal registro: ${cambiati.length} partner aggiornati`,
    categoria: "anagrafiche",
    dettaglio: `${esiti.length} controllati · ${scollegati.length} non trovati nel registro`,
  });
  revalidatePath("/registrazioni/riconciliazione", "layout");
  revalidatePath("/partner", "layout");
  redirect(
    `/registrazioni/riconciliazione?allineati=${cambiati.length}&controllati=${esiti.length}&mancanti=${scollegati.length}`
  );
}
