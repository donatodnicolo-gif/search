"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { authAttiva, leggiSessione, SESSION_COOKIE, type Sessione } from "./auth";
import { spingiEventoInAgenda } from "./calendario";
import { inviaMail } from "./mail";
import { proponiRicorrenza, schedaCliente } from "./orders";
import { daOraItaliana } from "./ore";
import { sostituisciVariabili } from "./variabili";
import { TIPI_ATTIVITA } from "./etichette";

// Ogni action ricontrolla la sessione (il middleware non basta: una server
// action è un endpoint). In sviluppo senza segreto la porta è aperta.
async function richiediSessione(): Promise<Sessione | null> {
  if (!authAttiva()) return null; // sviluppo locale: aperto
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  if (!sessione) redirect("/login");
  return sessione;
}

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

// Dove tornare a fine azione: il form lo dichiara, mai URL esterni.
function ritorno(fd: FormData, fallback: string): string {
  const t = testo(fd, "torna");
  return t.startsWith("/") ? t : fallback;
}

function conEsito(path: string, esito: "ok" | string): string {
  const sep = path.includes("?") ? "&" : "?";
  return esito === "ok" ? `${path}${sep}esito=ok` : `${path}${sep}errore=${encodeURIComponent(esito)}`;
}

// ---------------------------------------------------------------------------
// Attività (diario della relazione)

export async function registraAttivita(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const chiaveCliente = testo(fd, "chiaveCliente");
  const titolo = testo(fd, "titolo");
  const tipo = testo(fd, "tipo") || "nota";
  const back = ritorno(fd, "/");
  if (!chiaveCliente || !titolo) redirect(conEsito(back, "Serve almeno un titolo per l'attività."));
  if (!(tipo in TIPI_ATTIVITA)) redirect(conEsito(back, "Tipo di attività sconosciuto."));

  await prisma.attivita.create({
    data: {
      chiaveCliente,
      nomeCliente: testo(fd, "nomeCliente"),
      tipo,
      titolo,
      dettaglio: testo(fd, "dettaglio") || null,
      autore: sessione?.nome ?? "",
      quando: daOraItaliana(testo(fd, "quando")) ?? new Date(),
    },
  });
  revalidatePath(back);
  redirect(conEsito(back, "ok"));
}

export async function eliminaAttivita(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const back = ritorno(fd, "/");
  if (id) await prisma.attivita.delete({ where: { id } }).catch(() => {});
  revalidatePath(back);
  redirect(back);
}

// ---------------------------------------------------------------------------
// Ricorrenze: si PROPONGONO a Orders (che ne è la casa), non si salvano qui.

export async function aggiungiRicorrenza(fd: FormData): Promise<void> {
  await richiediSessione();
  const back = ritorno(fd, "/");
  const cliente = testo(fd, "cliente");
  const giorno = Number(testo(fd, "giorno"));
  const mese = Number(testo(fd, "mese"));
  if (!cliente || !giorno || !mese) redirect(conEsito(back, "Servono giorno e mese della ricorrenza."));

  const esito = await proponiRicorrenza({
    cliente,
    giorno,
    mese,
    destinatario: testo(fd, "destinatario") || undefined,
    titolo: testo(fd, "titolo") || undefined,
    tipo: testo(fd, "tipo") || undefined,
    note: testo(fd, "note") || undefined,
  });
  revalidatePath(back);
  redirect(conEsito(back, esito.ok ? "ok" : esito.errore));
}

// ---------------------------------------------------------------------------
// Eventi e inviti

export async function salvaEvento(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const titolo = testo(fd, "titolo");
  const inizio = daOraItaliana(testo(fd, "dataInizio"));
  const back = ritorno(fd, "/eventi");
  if (!titolo || !inizio) redirect(conEsito(back, "Servono un titolo e una data."));

  const dati = {
    titolo,
    descrizione: testo(fd, "descrizione") || null,
    luogo: testo(fd, "luogo"),
    dataInizio: inizio,
    dataFine: daOraItaliana(testo(fd, "dataFine")),
    dressCode: testo(fd, "dressCode"),
    capienza: testo(fd, "capienza") ? Number(testo(fd, "capienza")) || null : null,
    stato: testo(fd, "stato") || "aperto",
    note: testo(fd, "note") || null,
  };

  const evento = id
    ? await prisma.evento.update({ where: { id }, data: dati })
    : await prisma.evento.create({ data: dati });

  // L'agenda di tutte le app è il Calendario: si spinge lì, best-effort.
  await spingiEventoInAgenda({
    id: evento.id,
    titolo: evento.titolo,
    descrizione: evento.descrizione,
    luogo: evento.luogo,
    inizio: evento.dataInizio,
    fine: evento.dataFine,
    annullato: evento.stato === "annullato",
  });

  revalidatePath("/eventi");
  redirect(`/eventi/${evento.id}`);
}

export async function cambiaStatoEvento(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !["bozza", "aperto", "concluso", "annullato"].includes(stato)) redirect("/eventi");

  const evento = await prisma.evento.update({ where: { id }, data: { stato } });
  await spingiEventoInAgenda({
    id: evento.id,
    titolo: evento.titolo,
    descrizione: evento.descrizione,
    luogo: evento.luogo,
    inizio: evento.dataInizio,
    fine: evento.dataFine,
    annullato: stato === "annullato",
  });
  revalidatePath(`/eventi/${id}`);
  redirect(`/eventi/${id}`);
}

export async function aggiungiInvitato(fd: FormData): Promise<void> {
  await richiediSessione();
  const eventoId = testo(fd, "eventoId");
  const chiaveCliente = testo(fd, "chiaveCliente");
  const back = ritorno(fd, `/eventi/${eventoId}`);
  if (!eventoId || !chiaveCliente) redirect(conEsito(back, "Manca il cliente da invitare."));

  await prisma.invito.upsert({
    where: { eventoId_chiaveCliente: { eventoId, chiaveCliente } },
    create: {
      eventoId,
      chiaveCliente,
      nomeCliente: testo(fd, "nomeCliente"),
      emailCliente: testo(fd, "emailCliente"),
    },
    update: {}, // già in lista: non si tocca il suo stato
  });
  revalidatePath(back);
  redirect(conEsito(back, "ok"));
}

export async function cambiaStatoInvito(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  const back = ritorno(fd, "/eventi");
  const validi = ["da_invitare", "invitato", "confermato", "declinato", "partecipato"];
  if (!id || !validi.includes(stato)) redirect(back);

  await prisma.invito.update({
    where: { id },
    data: {
      stato,
      ...(stato === "invitato" ? { invitatoIl: new Date() } : {}),
      ...(stato === "confermato" || stato === "declinato" ? { rispostaIl: new Date() } : {}),
    },
  });
  revalidatePath(back);
  redirect(back);
}

export async function rimuoviInvito(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const back = ritorno(fd, "/eventi");
  if (id) await prisma.invito.delete({ where: { id } }).catch(() => {});
  revalidatePath(back);
  redirect(back);
}

// ---------------------------------------------------------------------------
// Template mail

export async function salvaTemplate(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const nome = testo(fd, "nome");
  const oggetto = testo(fd, "oggetto");
  const corpo = String(fd.get("corpo") ?? "").replace(/\r\n/g, "\n").trim();
  const back = ritorno(fd, "/mail/template");
  if (!nome || !oggetto || !corpo) redirect(conEsito(back, "Servono nome, oggetto e testo del template."));

  try {
    if (id) await prisma.templateMail.update({ where: { id }, data: { nome, oggetto, corpo } });
    else await prisma.templateMail.create({ data: { nome, oggetto, corpo } });
  } catch {
    redirect(conEsito(back, `Esiste già un template che si chiama «${nome}».`));
  }
  revalidatePath("/mail/template");
  redirect(conEsito(back, "ok"));
}

// Tre template eleganti per non partire dal foglio bianco. Solo se non
// esistono già: rilanciare non duplica e non sovrascrive.
export async function creaTemplateDiPartenza(): Promise<void> {
  await richiediSessione();
  const partenza = [
    {
      nome: "Auguri di compleanno",
      oggetto: "I nostri auguri, {{nome}}",
      corpo:
        "Gentile {{nome}},\n\noggi è un giorno speciale e ci teniamo a farle i nostri auguri più sinceri.\n\nSe desidera festeggiare con un pensiero fiorito — per sé o per chi ama — siamo come sempre a sua completa disposizione, con la cura di sempre.\n\nBuon compleanno,\nil team Deluxy",
    },
    {
      nome: "Invito a evento",
      oggetto: "Un invito riservato: {{evento}}",
      corpo:
        "Gentile {{nome}},\n\nabbiamo il piacere di invitarla a {{evento}}, {{dataEvento}} presso {{luogoEvento}}.\n\nUna serata riservata ai nostri clienti più cari: ci farebbe davvero piacere averla con noi.\n\nCi basta un cenno di risposta a questa mail per riservarle il posto.\n\nCon i più cordiali saluti,\nil team Deluxy",
    },
    {
      nome: "Ben ritrovare",
      oggetto: "Ci manca, {{nome}}",
      corpo:
        "Gentile {{nome}},\n\nè passato un po' di tempo dal suo ultimo ordine e ci faceva piacere salutarla.\n\nSe c'è un'occasione in arrivo — una ricorrenza, un pensiero, un grazie — saremo felici di prendercene cura come merita.\n\nA presto,\nil team Deluxy",
    },
  ];
  for (const t of partenza) {
    await prisma.templateMail.upsert({ where: { nome: t.nome }, create: t, update: {} });
  }
  revalidatePath("/mail/template");
  redirect("/mail/template");
}

export async function eliminaTemplate(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  if (id) await prisma.templateMail.delete({ where: { id } }).catch(() => {});
  revalidatePath("/mail/template");
  redirect("/mail/template");
}

// ---------------------------------------------------------------------------
// Invio mail personalizzata

export async function inviaMailPersonalizzata(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const chiaveCliente = testo(fd, "chiaveCliente");
  const destinatario = testo(fd, "destinatario");
  const oggettoGrezzo = testo(fd, "oggetto");
  const corpoGrezzo = String(fd.get("corpo") ?? "").replace(/\r\n/g, "\n").trim();
  const invitoId = testo(fd, "invitoId");
  const eventoId = testo(fd, "eventoId");
  const back = ritorno(fd, "/mail");

  if (!destinatario || !destinatario.includes("@")) redirect(conEsito(back, "Serve l'email del destinatario."));
  if (!oggettoGrezzo || !corpoGrezzo) redirect(conEsito(back, "Servono oggetto e testo della mail."));

  // Rete di sicurezza: se nel testo sono rimaste {{variabili}}, si risolvono
  // qui con i dati veri del cliente — mai spedire un segnaposto.
  let oggetto = oggettoGrezzo;
  let corpo = corpoGrezzo;
  if (/\{\{/.test(oggetto + corpo) && chiaveCliente) {
    const scheda = await schedaCliente(chiaveCliente);
    const evento = eventoId
      ? await prisma.evento.findUnique({ where: { id: eventoId } })
      : null;
    const cliente = scheda.ok ? scheda.dati : null;
    const ev = evento
      ? { titolo: evento.titolo, dataInizio: evento.dataInizio, luogo: evento.luogo, dressCode: evento.dressCode }
      : null;
    oggetto = sostituisciVariabili(oggetto, cliente, ev);
    corpo = sostituisciVariabili(corpo, cliente, ev);
  }
  if (/\{\{/.test(oggetto + corpo)) {
    redirect(conEsito(back, "Nel testo restano variabili non risolte ({{…}}): completale prima di inviare."));
  }

  const esito = await inviaMail({ a: destinatario, oggetto, corpo });

  const registro = await prisma.mailInviata.create({
    data: {
      chiaveCliente: chiaveCliente || destinatario.toLowerCase(),
      nomeCliente: testo(fd, "nomeCliente"),
      destinatario,
      oggetto,
      corpo,
      esito: esito.ok ? "inviata" : "errore",
      errore: esito.ok ? null : esito.errore,
      templateId: testo(fd, "templateId") || null,
      eventoId: eventoId || null,
      autore: sessione?.nome ?? "",
    },
  });

  // Se era un invito, l'invito passa a «invitato» con la mail agganciata.
  if (esito.ok && invitoId) {
    await prisma.invito
      .update({ where: { id: invitoId }, data: { stato: "invitato", invitatoIl: new Date(), mailId: registro.id } })
      .catch(() => {});
  }

  revalidatePath(back);
  redirect(conEsito(back, esito.ok ? "ok" : esito.errore));
}
