"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { authAttiva, type Sessione } from "./auth";
import { sessioneCorrente } from "./sessione-server";
import { spingiEventoInAgenda } from "./calendario";
import { inviaMail } from "./mail";
import { proponiRicorrenza, schedaCliente } from "./orders";
import { daOraItaliana } from "./ore";
import { sostituisciVariabili } from "./variabili";
import { TIPI_ATTIVITA } from "./etichette";

// Ogni action ricontrolla la sessione (il middleware non basta: una server
// action è un endpoint), e la ricontrolla CON la revoca (sessione-server.ts):
// password cambiata = fuori, cookie da cancellare. In sviluppo senza segreto
// la porta è aperta.
async function richiediSessione(): Promise<Sessione | null> {
  if (!authAttiva()) return null; // sviluppo locale: aperto
  const sessione = await sessioneCorrente();
  if (!sessione) redirect("/logout");
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
// Nuovo ordine con link di pagamento (via Customer Service)

import { creaOrdineCS, type DatiCreazione, type EsitoCreazione } from "./nuovo-ordine";

// Chiamata dal form client: riceve i dati già composti, crea l'ordine
// passando dal Customer Service e RITORNA l'esito (niente redirect: il link
// di pagamento si mostra subito e non si persiste da nessuna parte — si
// copia e si manda, come vuole la regola di Orders sui link col segreto).
export async function creaOrdineDalCrm(
  dati: Omit<DatiCreazione, "operatore"> & { chiaveCliente: string; nomeCliente: string },
): Promise<EsitoCreazione> {
  const sessione = await richiediSessione();

  const { chiaveCliente, nomeCliente, ...corpo } = dati;
  const esito = await creaOrdineCS({
    ...corpo,
    operatore: { id: "deluxy-crm", nome: `CRM — ${sessione?.nome ?? "Team Deluxy"}` },
  });

  // Il diario racconta il gesto (senza il link: quello si chiede quando
  // serve). Best-effort: un diario che fallisce non deve annullare l'ordine.
  if (esito.ok && chiaveCliente) {
    const titolo = esito.ordineNumero
      ? `Ordine ${esito.ordineNumero} creato e segnato pagato`
      : "Ordine creato con link di pagamento";
    await prisma.attivita
      .create({
        data: {
          chiaveCliente,
          nomeCliente,
          tipo: "ordine",
          titolo,
          dettaglio: [
            corpo.righe
              .map((r) => `${r.quantita > 1 ? `${r.quantita}× ` : ""}${r.titolo ?? "prodotto dal catalogo"}`)
              .join(", "),
            corpo.consegna.data ? `Consegna ${corpo.consegna.data}${corpo.consegna.fascia ? ` (${corpo.consegna.fascia})` : ""}` : "",
            esito.inviato ? "Shopify ha mandato la mail col link." : "",
          ]
            .filter(Boolean)
            .join("\n"),
          autore: sessione?.nome ?? "",
        },
      })
      .catch(() => {});
    revalidatePath(`/clienti/${encodeURIComponent(chiaveCliente)}`);
  }

  return esito;
}

// ---------------------------------------------------------------------------
// Liste costruite dall'AI

import { eseguiCriteri, generaCriteriDaBrief, type CriteriLista } from "./liste-ai";
import { inviaWA, linkWaMe, numeroWhatsApp } from "./whatsapp";
import type { ClienteVariabili } from "./variabili";
import type { ClienteRiga } from "./orders";

function membriDaClienti(clienti: ClienteRiga[]) {
  return clienti.map((c) => ({
    chiaveCliente: c.cliente,
    nome: c.nome ?? "",
    email: c.email ?? "",
    telefono: c.telefono ?? "",
    citta: c.citta ?? "",
    segmento: c.segmento,
    ordini: c.ordini,
    speso: c.speso,
    ultimoOrdine: c.ultimoOrdine ? new Date(c.ultimoOrdine) : null,
  }));
}

function variabiliDaMembro(m: {
  nome: string;
  citta: string;
  segmento: string;
  ordini: number;
  speso: number;
  ultimoOrdine: Date | null;
}): ClienteVariabili {
  return {
    nome: m.nome || null,
    citta: m.citta || null,
    segmento: m.segmento,
    ordini: m.ordini,
    speso: m.speso,
    ultimoOrdine: m.ultimoOrdine,
  };
}

export async function creaListaAI(fd: FormData): Promise<void> {
  await richiediSessione();
  const brief = String(fd.get("brief") ?? "").trim();
  if (brief.length < 10) redirect(conEsito("/liste", "Racconta il brief in almeno una frase."));

  const generata = await generaCriteriDaBrief(brief);
  if (!generata.ok) redirect(conEsito("/liste", generata.errore));

  const eseguita = await eseguiCriteri(generata.criteri);
  if (!eseguita.ok) redirect(conEsito("/liste", eseguita.errore));

  const listaDb = await prisma.listaClienti.create({
    data: {
      nome: generata.nome,
      brief,
      criteri: generata.criteri as object,
      spiegazione: generata.spiegazione,
      note: eseguita.note.join("\n"),
      modello: generata.modello,
      membri: { create: membriDaClienti(eseguita.clienti) },
    },
  });
  revalidatePath("/liste");
  redirect(`/liste/${listaDb.id}`);
}

// Riesegue la ricetta sui dati di OGGI: i membri si sostituiscono (la lista è
// una selezione, non un archivio), il brief e i criteri restano.
export async function rigeneraLista(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const listaDb = await prisma.listaClienti.findUnique({ where: { id } });
  if (!listaDb) redirect("/liste");

  const eseguita = await eseguiCriteri(listaDb.criteri as CriteriLista);
  if (!eseguita.ok) redirect(conEsito(`/liste/${id}`, eseguita.errore));

  await prisma.$transaction([
    prisma.membroLista.deleteMany({ where: { listaId: id } }),
    prisma.listaClienti.update({
      where: { id },
      data: {
        note: eseguita.note.join("\n"),
        generataIl: new Date(),
        membri: { create: membriDaClienti(eseguita.clienti) },
      },
    }),
  ]);
  revalidatePath(`/liste/${id}`);
  redirect(conEsito(`/liste/${id}`, "ok"));
}

export async function eliminaLista(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  if (id) await prisma.listaClienti.delete({ where: { id } }).catch(() => {});
  revalidatePath("/liste");
  redirect("/liste");
}

export async function rimuoviMembro(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const back = ritorno(fd, "/liste");
  if (id) await prisma.membroLista.delete({ where: { id } }).catch(() => {});
  revalidatePath(back);
  redirect(back);
}

// L'invio a lista: una mail PER OGNI membro con email, ognuna con le SUE
// variabili. Sequenziale (l'SMTP dietro AI Mail non ama le raffiche), con
// tetto per giro: si rilancia e riprende da chi non l'ha ancora ricevuta.
const TETTO_INVIO_LISTA = 150;

export async function inviaMailALista(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const listaId = testo(fd, "listaId");
  const templateId = testo(fd, "templateId");
  const back = `/liste/${listaId}`;

  const [listaDb, template] = await Promise.all([
    prisma.listaClienti.findUnique({ where: { id: listaId }, include: { membri: true } }),
    prisma.templateMail.findUnique({ where: { id: templateId } }),
  ]);
  if (!listaDb) redirect("/liste");
  if (!template) redirect(conEsito(back, "Scegli un template."));

  // Chi ha già ricevuto QUESTO template da QUESTA lista non lo riceve due volte.
  const giaInviate = new Set(
    (
      await prisma.mailInviata.findMany({
        where: { listaId, templateId, esito: "inviata" },
        select: { chiaveCliente: true },
      })
    ).map((m) => m.chiaveCliente),
  );

  const destinatari = listaDb.membri.filter((m) => m.email && !giaInviate.has(m.chiaveCliente));
  const giro = destinatari.slice(0, TETTO_INVIO_LISTA);

  let inviate = 0;
  let fallite = 0;
  for (const m of giro) {
    const oggetto = sostituisciVariabili(template.oggetto, variabiliDaMembro(m), null);
    const corpo = sostituisciVariabili(template.corpo, variabiliDaMembro(m), null);
    if (/\{\{/.test(oggetto + corpo)) {
      fallite++;
      await prisma.mailInviata.create({
        data: {
          chiaveCliente: m.chiaveCliente,
          nomeCliente: m.nome,
          destinatario: m.email,
          oggetto,
          corpo,
          esito: "errore",
          errore: "Variabili non risolte per questo cliente",
          templateId,
          listaId,
          autore: sessione?.nome ?? "",
        },
      });
      continue;
    }
    const esito = await inviaMail({ a: m.email, oggetto, corpo });
    await prisma.mailInviata.create({
      data: {
        chiaveCliente: m.chiaveCliente,
        nomeCliente: m.nome,
        destinatario: m.email,
        oggetto,
        corpo,
        esito: esito.ok ? "inviata" : "errore",
        errore: esito.ok ? null : esito.errore,
        templateId,
        listaId,
        autore: sessione?.nome ?? "",
      },
    });
    if (esito.ok) inviate++;
    else fallite++;
  }

  const restanti = destinatari.length - giro.length;
  const messaggio =
    `Inviate ${inviate}, non partite ${fallite}` +
    (restanti > 0 ? `; restano ${restanti}: rilancia per continuare` : "") +
    ". Il dettaglio è nel registro Mail.";
  revalidatePath(back);
  redirect(conEsito(back, inviate > 0 || fallite === 0 ? "ok" : messaggio) + (inviate > 0 ? `&dettaglio=${encodeURIComponent(messaggio)}` : ""));
}

// ---------------------------------------------------------------------------
// WhatsApp: template, invio singolo, invio a lista, canale assistito

export async function salvaTemplateWA(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const nome = testo(fd, "nome");
  const corpo = String(fd.get("testo") ?? "").replace(/\r\n/g, "\n").trim();
  const back = ritorno(fd, "/whatsapp");
  if (!nome || !corpo) redirect(conEsito(back, "Servono nome e testo del template."));
  try {
    if (id) await prisma.templateWhatsApp.update({ where: { id }, data: { nome, testo: corpo } });
    else await prisma.templateWhatsApp.create({ data: { nome, testo: corpo } });
  } catch {
    redirect(conEsito(back, `Esiste già un template che si chiama «${nome}».`));
  }
  revalidatePath("/whatsapp");
  redirect(conEsito(back, "ok"));
}

export async function eliminaTemplateWA(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  if (id) await prisma.templateWhatsApp.delete({ where: { id } }).catch(() => {});
  revalidatePath("/whatsapp");
  redirect("/whatsapp");
}

export async function inviaWhatsAppSingolo(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const chiaveCliente = testo(fd, "chiaveCliente");
  const telefonoGrezzo = testo(fd, "telefono");
  const corpo = String(fd.get("testo") ?? "").replace(/\r\n/g, "\n").trim();
  const numeroId = testo(fd, "numeroId");
  const back = ritorno(fd, "/whatsapp");

  const numero = numeroWhatsApp(telefonoGrezzo);
  if (!numero) redirect(conEsito(back, `Numero non utilizzabile per WhatsApp: «${telefonoGrezzo}» (serve il prefisso internazionale).`));
  if (!corpo) redirect(conEsito(back, "Serve il testo del messaggio."));

  const esito = await inviaWA({ a: numero, testo: corpo, numeroId: numeroId || undefined });
  await prisma.messaggioWhatsApp.create({
    data: {
      chiaveCliente: chiaveCliente || numero,
      nomeCliente: testo(fd, "nomeCliente"),
      telefono: numero,
      testo: corpo,
      canale: "api",
      esito: esito.ok ? "inviato" : "errore",
      errore: esito.ok ? null : esito.errore,
      autore: sessione?.nome ?? "",
    },
  });
  revalidatePath(back);
  redirect(conEsito(back, esito.ok ? "ok" : esito.errore));
}

// Il canale assistito: la chat si apre sul WhatsApp dell'operatore col testo
// pronto. Qui si REGISTRA il gesto (chiamata dal client al momento del clic).
export async function registraWaMe(dati: {
  chiaveCliente: string;
  nomeCliente: string;
  telefono: string;
  testo: string;
  listaId?: string;
}): Promise<{ ok: boolean }> {
  const sessione = await richiediSessione();
  await prisma.messaggioWhatsApp
    .create({
      data: {
        chiaveCliente: dati.chiaveCliente,
        nomeCliente: dati.nomeCliente,
        telefono: dati.telefono,
        testo: dati.testo,
        canale: "wame",
        esito: "preparato",
        listaId: dati.listaId ?? null,
        autore: sessione?.nome ?? "",
      },
    })
    .catch(() => {});
  return { ok: true };
}

export async function inviaWhatsAppALista(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const listaId = testo(fd, "listaId");
  const templateId = testo(fd, "templateId");
  const numeroId = testo(fd, "numeroId");
  const back = `/liste/${listaId}/whatsapp`;

  const [listaDb, template] = await Promise.all([
    prisma.listaClienti.findUnique({ where: { id: listaId }, include: { membri: true } }),
    prisma.templateWhatsApp.findUnique({ where: { id: templateId } }),
  ]);
  if (!listaDb) redirect("/liste");
  if (!template) redirect(conEsito(back, "Scegli un template WhatsApp."));

  const giaInviati = new Set(
    (
      await prisma.messaggioWhatsApp.findMany({
        where: { listaId, esito: "inviato" },
        select: { chiaveCliente: true },
      })
    ).map((m) => m.chiaveCliente),
  );

  const destinatari = listaDb.membri
    .map((m) => ({ m, numero: numeroWhatsApp(m.telefono) }))
    .filter((x) => x.numero && !giaInviati.has(x.m.chiaveCliente));
  const giro = destinatari.slice(0, TETTO_INVIO_LISTA);

  let inviati = 0;
  let falliti = 0;
  for (const { m, numero } of giro) {
    const corpo = sostituisciVariabili(template.testo, variabiliDaMembro(m), null);
    const esito = await inviaWA({ a: numero!, testo: corpo, numeroId: numeroId || undefined });
    await prisma.messaggioWhatsApp.create({
      data: {
        chiaveCliente: m.chiaveCliente,
        nomeCliente: m.nome,
        telefono: numero!,
        testo: corpo,
        canale: "api",
        esito: esito.ok ? "inviato" : "errore",
        errore: esito.ok ? null : esito.errore,
        listaId,
        autore: sessione?.nome ?? "",
      },
    });
    if (esito.ok) inviati++;
    else falliti++;
  }

  const messaggio =
    `Partiti ${inviati}, rifiutati ${falliti}` +
    (falliti > 0 ? " (di solito: finestra 24h chiusa — per quelli usa il canale assistito qui sotto)" : "") +
    ".";
  revalidatePath(back);
  redirect(`${back}?dettaglio=${encodeURIComponent(messaggio)}`);
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
