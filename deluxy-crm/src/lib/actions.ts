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
import { MAX_CLUSTER, normalizza, slug } from "./cluster";

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

// Più ricorrenze in un colpo (RicorrenzeMultiple): campi r<k>_giorno, r<k>_mese…
// con le k in `righe`. Ognuna si propone a Orders: si contano le riuscite e si
// riportano gli errori per riga — mai «fatto» se una è rimasta fuori.
export async function aggiungiRicorrenze(fd: FormData): Promise<void> {
  await richiediSessione();
  const back = ritorno(fd, "/");
  const cliente = testo(fd, "cliente");
  const righe = testo(fd, "righe").split(",").map((s) => s.trim()).filter(Boolean);
  if (!cliente || righe.length === 0) redirect(conEsito(back, "Nessuna ricorrenza da salvare."));

  let salvate = 0;
  const errori: string[] = [];
  for (const k of righe.slice(0, 10)) {
    const giorno = Number(testo(fd, `r${k}_giorno`));
    const mese = Number(testo(fd, `r${k}_mese`));
    if (!giorno || !mese) {
      errori.push(`riga ${salvate + errori.length + 1}: mancano giorno o mese`);
      continue;
    }
    const esito = await proponiRicorrenza({
      cliente,
      giorno,
      mese,
      destinatario: testo(fd, `r${k}_destinatario`) || undefined,
      titolo: testo(fd, `r${k}_titolo`) || undefined,
      tipo: testo(fd, `r${k}_tipo`) || undefined,
      note: testo(fd, `r${k}_note`) || undefined,
    });
    if (esito.ok) salvate++;
    else errori.push(`${giorno}/${mese}: ${esito.errore}`);
  }
  revalidatePath(back);
  if (errori.length === 0) redirect(conEsito(back, "ok"));
  redirect(
    conEsito(
      back,
      `${salvate} ${salvate === 1 ? "ricorrenza salvata" : "ricorrenze salvate"}, ${errori.length} no — ${errori.join("; ")}`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Profilo di relazione: come lo chiamiamo, professione, note, foto. È l'unica
// parte del cliente che vive QUI (standard §7): nome degli ordini, email,
// telefono e città restano in Orders e qui si leggono soltanto.

const FOTO_MAX_BYTES = 600 * 1024;

export async function salvaProfilo(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const back = ritorno(fd, "/");
  const chiaveCliente = testo(fd, "chiaveCliente");
  if (!chiaveCliente) redirect(conEsito(back, "Manca il cliente."));

  const dati: {
    nome: string;
    professione: string;
    autore: string;
    foto?: Uint8Array<ArrayBuffer> | null;
    fotoTipo?: string;
  } = {
    nome: testo(fd, "nome").slice(0, 120),
    professione: testo(fd, "professione").slice(0, 120),
    autore: sessione?.nome ?? "",
  };

  // La foto arriva come data URL (ridotta nel browser da FotoInput). Assente =
  // si lascia quella che c'è; `rimuoviFoto` = si toglie.
  const fotoDati = testo(fd, "fotoDati");
  if (testo(fd, "rimuoviFoto")) {
    dati.foto = null;
    dati.fotoTipo = "";
  } else if (fotoDati) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(fotoDati);
    if (!m) redirect(conEsito(back, "La foto non è in un formato accettato (JPG, PNG o WebP)."));
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > FOTO_MAX_BYTES) redirect(conEsito(back, "La foto è troppo grande anche dopo la riduzione (max 600 KB)."));
    dati.foto = Uint8Array.from(bytes);
    dati.fotoTipo = m[1];
  }

  await prisma.profiloCliente.upsert({
    where: { chiaveCliente },
    create: { chiaveCliente, ...dati },
    update: dati,
  });
  revalidatePath(back);
  redirect(conEsito(back, "ok"));
}

// «Unisci»: un'altra chiave di Orders (email o codice) diventa alias di questo
// cliente. Chi era già alias dell'altro passa sotto questo; un cliente che è
// già alias non può diventare principale (si separa prima).
export async function unisciClienti(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const back = ritorno(fd, "/");
  const principale = testo(fd, "chiaveCliente");
  const altroGrezzo = testo(fd, "altro").toLowerCase();
  if (!principale || !altroGrezzo) redirect(conEsito(back, "Scrivi l'email (o il codice) dell'altro cliente."));

  // L'altro deve esistere in Orders: la sua scheda dà il codice canonico.
  const scheda = await schedaCliente(altroGrezzo);
  if (!scheda.ok) redirect(conEsito(back, `L'altro cliente non si trova in Orders: ${scheda.errore}`));
  const alias = scheda.dati.cliente;
  if (alias === principale) redirect(conEsito(back, "È lo stesso cliente."));

  const questoEAlias = await prisma.unioneClienti.findUnique({ where: { chiaveAlias: principale } });
  if (questoEAlias) redirect(conEsito(back, "Questa scheda è già unita a un'altra: separala prima."));

  await prisma.$transaction([
    // chi era alias dell'altro segue l'altro sotto questo principale
    prisma.unioneClienti.updateMany({ where: { chiavePrincipale: alias }, data: { chiavePrincipale: principale } }),
    prisma.unioneClienti.upsert({
      where: { chiaveAlias: alias },
      create: { chiaveAlias: alias, chiavePrincipale: principale, autore: sessione?.nome ?? "" },
      update: { chiavePrincipale: principale, autore: sessione?.nome ?? "" },
    }),
  ]);
  revalidatePath(back);
  redirect(conEsito(back, "ok"));
}

export async function separaCliente(fd: FormData): Promise<void> {
  await richiediSessione();
  const back = ritorno(fd, "/");
  const alias = testo(fd, "alias");
  const r = alias ? await prisma.unioneClienti.deleteMany({ where: { chiaveAlias: alias } }) : { count: 0 };
  revalidatePath(back);
  redirect(r.count ? conEsito(back, "ok") : conEsito(back, "Questa unione non c'era già più."));
}

// Il punteggio del cliente (0-100), dato a mano: entra nei cluster.
export async function salvaPunteggio(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const back = ritorno(fd, "/");
  const chiaveCliente = testo(fd, "chiaveCliente");
  if (!chiaveCliente) redirect(conEsito(back, "Manca il cliente."));
  const t = testo(fd, "punteggio");
  const punteggio = t === "" ? null : Math.round(Number(t));
  if (punteggio != null && (!Number.isFinite(punteggio) || punteggio < 0 || punteggio > 100)) {
    redirect(conEsito(back, "Il punteggio va da 0 a 100."));
  }
  await prisma.profiloCliente.upsert({
    where: { chiaveCliente },
    create: { chiaveCliente, punteggio, autore: sessione?.nome ?? "" },
    update: { punteggio, autore: sessione?.nome ?? "" },
  });
  revalidatePath(back);
  redirect(conEsito(back, "ok"));
}

// Le soglie e i cluster (Impostazioni → Clienti del CRM). Le righe dei cluster
// arrivano come campi indicizzati k<i>_nome, k<i>_colore, k<i>_spesaTotaleMin…
// nell'ordine del form, che è anche l'ordine di priorità.
export async function salvaImpostazioniClienti(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const back = "/impostazioni#clienti";
  const cluster = [];
  for (let i = 0; i < MAX_CLUSTER; i++) {
    const nome = testo(fd, `k${i}_nome`);
    if (!nome) continue;
    cluster.push({
      chiave: slug(nome),
      nome,
      colore: testo(fd, `k${i}_colore`),
      spesaTotaleMin: numero(fd, `k${i}_spesaTotaleMin`),
      spesaAnnuaMin: numero(fd, `k${i}_spesaAnnuaMin`),
      ordiniAnnoMin: numero(fd, `k${i}_ordiniAnnoMin`),
      ordiniMin: numero(fd, `k${i}_ordiniMin`),
      punteggioMin: numero(fd, `k${i}_punteggioMin`),
    });
  }
  if (cluster.length === 0) redirect(conEsito(back, "Serve almeno un cluster."));
  const nomi = new Set(cluster.map((k) => k.chiave));
  if (nomi.size !== cluster.length) redirect(conEsito(back, "Due cluster hanno lo stesso nome."));
  const clienti = normalizza({
    soglie: {
      spesaTotaleMin: numero(fd, "spesaTotaleMin") ?? 0,
      spesaAnnuaMin: numero(fd, "spesaAnnuaMin") ?? 0,
      ordiniAnnoMin: numero(fd, "ordiniAnnoMin") ?? 0,
    },
    cluster,
  });
  await prisma.impostazioniCrm.upsert({
    where: { id: "crm" },
    create: { id: "crm", clienti, aggiornatoDa: sessione?.nome ?? "" },
    update: { clienti, aggiornatoDa: sessione?.nome ?? "" },
  });
  revalidatePath("/impostazioni");
  revalidatePath("/clienti");
  redirect(conEsito(back, "ok"));
}

// Le note del cliente: quante si vuole, ognuna modificabile. Chi le scrive resta
// scritto; chi le cambia le firma di nuovo.

export async function salvaNota(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const back = ritorno(fd, "/");
  const chiaveCliente = testo(fd, "chiaveCliente");
  const id = testo(fd, "id");
  const contenuto = testo(fd, "testo").slice(0, 5000);
  if (!chiaveCliente || !contenuto) redirect(conEsito(back, "La nota è vuota."));
  const autore = sessione?.nome ?? "";
  if (id) {
    // La chiave del cliente nel where: una nota si modifica solo dalla scheda a cui appartiene.
    const r = await prisma.notaCliente.updateMany({ where: { id, chiaveCliente }, data: { testo: contenuto, autore } });
    if (r.count === 0) redirect(conEsito(back, "Questa nota non c'è più."));
  } else {
    await prisma.notaCliente.create({ data: { chiaveCliente, testo: contenuto, autore } });
  }
  revalidatePath(back);
  redirect(conEsito(back, "ok"));
}

export async function eliminaNota(fd: FormData): Promise<void> {
  await richiediSessione();
  const back = ritorno(fd, "/");
  const id = testo(fd, "id");
  const chiaveCliente = testo(fd, "chiaveCliente");
  const r = id ? await prisma.notaCliente.deleteMany({ where: { id, chiaveCliente } }) : { count: 0 };
  revalidatePath(back);
  redirect(r.count ? conEsito(back, "ok") : conEsito(back, "Questa nota non c'era già più."));
}

// ---------------------------------------------------------------------------
// Programmazione: cosa faremo con un cliente in un giorno preciso. Vive qui
// (è relazione) e si spinge al Deluxy Calendario come le altre cose datate.

async function spingiProgrammazione(p: {
  id: string;
  titolo: string;
  dettaglio: string | null;
  nomeCliente: string;
  quando: Date;
  conOra: boolean;
  stato: string;
}): Promise<void> {
  const statoAgenda = p.stato === "fatta" ? "completato" : p.stato === "annullata" ? "annullato" : "programmato";
  await spingiEventoInAgenda({
    id: `prog:${p.id}`,
    titolo: p.nomeCliente ? `${p.titolo} — ${p.nomeCliente}` : p.titolo,
    descrizione: p.dettaglio,
    inizio: p.quando,
    fine: p.conOra ? new Date(p.quando.getTime() + 30 * 60_000) : null,
    // I tipi che il Calendario conosce: scadenza, consegna, appuntamento,
    // promemoria, evento (verificato il 10/09: «attivita» → 400).
    tipo: p.conOra ? "appuntamento" : "promemoria",
    stato: statoAgenda,
  });
}

export async function programmaConCliente(fd: FormData): Promise<void> {
  const sessione = await richiediSessione();
  const back = ritorno(fd, "/");
  const chiaveCliente = testo(fd, "chiaveCliente");
  const nomeCliente = testo(fd, "nomeCliente");
  const giorno = testo(fd, "giorno"); // "2026-09-15"
  const ora = testo(fd, "ora"); // "10:30" o vuoto
  const titolo = testo(fd, "titolo").slice(0, 200);
  if (!chiaveCliente || !titolo) redirect(conEsito(back, "Serve almeno cosa fare."));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) redirect(conEsito(back, "Scegli il giorno."));
  if (ora && !/^\d{2}:\d{2}$/.test(ora)) redirect(conEsito(back, "L'ora non è valida."));
  // Senza ora, la giornata «inizia» alle 9 di Roma: così sta nel giorno giusto
  // anche vista da Vercel (UTC) e nel Calendario.
  const quando = daOraItaliana(`${giorno}T${ora || "09:00"}`);
  if (!quando) redirect(conEsito(back, "La data non è valida."));

  const p = await prisma.programmazione.create({
    data: {
      chiaveCliente,
      nomeCliente,
      quando,
      conOra: Boolean(ora),
      titolo,
      dettaglio: testo(fd, "dettaglio").slice(0, 5000) || null,
      autore: sessione?.nome ?? "",
    },
  });
  await spingiProgrammazione(p);
  revalidatePath(back);
  revalidatePath("/calendario");
  redirect(conEsito(back, "ok"));
}

export async function cambiaStatoProgrammazione(fd: FormData): Promise<void> {
  await richiediSessione();
  const back = ritorno(fd, "/calendario");
  const id = testo(fd, "id");
  const stato = testo(fd, "stato");
  if (!id || !["da_fare", "fatta", "annullata"].includes(stato)) redirect(back);
  const p = await prisma.programmazione
    .update({ where: { id }, data: { stato, fattaIl: stato === "fatta" ? new Date() : null } })
    .catch(() => null);
  if (!p) redirect(conEsito(back, "Questa programmazione non c'è più."));
  await spingiProgrammazione(p);
  revalidatePath(back);
  revalidatePath("/calendario");
  redirect(conEsito(back, "ok"));
}

export async function eliminaProgrammazione(fd: FormData): Promise<void> {
  await richiediSessione();
  const back = ritorno(fd, "/calendario");
  const id = testo(fd, "id");
  const p = id ? await prisma.programmazione.delete({ where: { id } }).catch(() => null) : null;
  // Nel Calendario resta, ma annullata: là non si cancella (è il suo registro).
  if (p) await spingiProgrammazione({ ...p, stato: "annullata" });
  revalidatePath(back);
  revalidatePath("/calendario");
  redirect(p ? conEsito(back, "ok") : conEsito(back, "Questa programmazione non c'era già più."));
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
  // L'esito si dice: un delete che fallisce in silenzio lascia il template in
  // tabella e l'operatore convinto di averlo tolto (segnalazione UX 28/08).
  const r = id ? await prisma.templateMail.deleteMany({ where: { id } }) : { count: 0 };
  revalidatePath("/mail/template");
  redirect(r.count ? conEsito("/mail/template", "ok") : conEsito("/mail/template", "Questo template non c'era già più."));
}

// Archiviare = non proporlo più in Componi, senza perderlo (e senza toccare il
// registro delle mail che lo citano). Si ripristina quando serve.
export async function archiviaTemplate(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const ripristina = Boolean(testo(fd, "ripristina"));
  const r = id
    ? await prisma.templateMail.updateMany({ where: { id }, data: { archiviatoIl: ripristina ? null : new Date() } })
    : { count: 0 };
  revalidatePath("/mail/template");
  redirect(r.count ? conEsito("/mail/template", "ok") : conEsito("/mail/template", "Questo template non c'è più."));
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

// La lista A MANO: le condizioni le sceglie l'operatore in un form, senza AI.
// Stessa ricetta (CriteriLista) e stesso esecutore della lista AI: cambia solo
// chi scrive i criteri. Il brief diventa la descrizione delle condizioni.
function elenco(fd: FormData, campo: string): string[] | undefined {
  const v = fd.getAll(campo).map((x) => String(x).trim()).filter(Boolean);
  // Il campo può essere anche UN testo con virgole (città, brand, parole).
  const piatti = v.flatMap((x) => x.split(",").map((s) => s.trim()).filter(Boolean));
  return piatti.length ? [...new Set(piatti)] : undefined;
}

function numero(fd: FormData, campo: string): number | undefined {
  const t = testo(fd, campo);
  if (!t) return undefined;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function creaListaManuale(fd: FormData): Promise<void> {
  await richiediSessione();
  const nome = testo(fd, "nome").slice(0, 60);
  if (!nome) redirect(conEsito("/liste?modo=manuale", "Dai un nome alla lista."));

  const ordina = testo(fd, "ordina");
  const criteri: CriteriLista = {
    liste: elenco(fd, "liste"),
    escludiListe: elenco(fd, "escludiListe"),
    citta: elenco(fd, "citta"),
    brand: elenco(fd, "brand"),
    segmenti: elenco(fd, "segmenti"),
    tipologie: elenco(fd, "tipologie"),
    spesaMin: numero(fd, "spesaMin"),
    spesaMax: numero(fd, "spesaMax"),
    ordiniMin: numero(fd, "ordiniMin"),
    ordiniMax: numero(fd, "ordiniMax"),
    giorniUltimoMax: numero(fd, "giorniUltimoMax"),
    giorniUltimoMin: numero(fd, "giorniUltimoMin"),
    gustiContiene: elenco(fd, "gustiContiene"),
    soloEmail: Boolean(testo(fd, "soloEmail")),
    soloTelefono: Boolean(testo(fd, "soloTelefono")),
    soloConsensoEmail: Boolean(testo(fd, "soloConsensoEmail")),
    ordina: ordina === "recenti" || ordina === "ordini" ? ordina : "speso",
    limite: Math.min(500, Math.max(1, numero(fd, "limite") ?? 200)),
  };
  // Le chiavi vuote non si salvano: la ricetta deve leggersi.
  for (const k of Object.keys(criteri) as (keyof CriteriLista)[]) if (criteri[k] === undefined) delete criteri[k];

  const descrizione = descriviCriteri(criteri);
  const eseguita = await eseguiCriteri(criteri);
  if (!eseguita.ok) redirect(conEsito("/liste?modo=manuale", eseguita.errore));

  const listaDb = await prisma.listaClienti.create({
    data: {
      nome,
      brief: descrizione,
      criteri: criteri as object,
      spiegazione: "Condizioni impostate a mano dall'operatore (senza AI).",
      note: eseguita.note.join("\n"),
      modello: "manuale",
      membri: { create: membriDaClienti(eseguita.clienti) },
    },
  });
  revalidatePath("/liste");
  redirect(`/liste/${listaDb.id}`);
}

// Le condizioni in italiano, per la colonna «brief» e la pagina della lista.
function descriviCriteri(c: CriteriLista): string {
  const p: string[] = [];
  if (c.liste?.length) p.push(`base: ${c.liste.join(" + ")}`);
  if (c.escludiListe?.length) p.push(`esclusi: ${c.escludiListe.join(", ")}`);
  if (c.citta?.length) p.push(`città: ${c.citta.join(", ")}`);
  if (c.brand?.length) p.push(`siti: ${c.brand.join(", ")}`);
  if (c.segmenti?.length) p.push(`segmenti: ${c.segmenti.join(", ")}`);
  if (c.tipologie?.length) p.push(`tipologie: ${c.tipologie.join(", ")}`);
  if (c.spesaMin != null || c.spesaMax != null) p.push(`spesa ${c.spesaMin ?? 0}–${c.spesaMax ?? "∞"} €`);
  if (c.ordiniMin != null || c.ordiniMax != null) p.push(`ordini ${c.ordiniMin ?? 0}–${c.ordiniMax ?? "∞"}`);
  if (c.giorniUltimoMax != null) p.push(`ultimo ordine entro ${c.giorniUltimoMax} giorni`);
  if (c.giorniUltimoMin != null) p.push(`ultimo ordine da almeno ${c.giorniUltimoMin} giorni`);
  if (c.gustiContiene?.length) p.push(`gusti: ${c.gustiContiene.join(", ")}`);
  if (c.soloEmail) p.push("solo con email");
  if (c.soloTelefono) p.push("solo con telefono");
  if (c.soloConsensoEmail) p.push("solo con consenso email");
  p.push(`ordinati per ${c.ordina ?? "speso"}, max ${c.limite ?? 200}`);
  return `Condizioni a mano — ${p.join(" · ")}`;
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
  const r = id ? await prisma.templateWhatsApp.deleteMany({ where: { id } }) : { count: 0 };
  revalidatePath("/whatsapp");
  redirect(r.count ? conEsito("/whatsapp", "ok") : conEsito("/whatsapp", "Questo template non c'era già più."));
}

export async function archiviaTemplateWA(fd: FormData): Promise<void> {
  await richiediSessione();
  const id = testo(fd, "id");
  const ripristina = Boolean(testo(fd, "ripristina"));
  const r = id
    ? await prisma.templateWhatsApp.updateMany({ where: { id }, data: { archiviatoIl: ripristina ? null : new Date() } })
    : { count: 0 };
  revalidatePath("/whatsapp");
  redirect(r.count ? conEsito("/whatsapp", "ok") : conEsito("/whatsapp", "Questo template non c'è più."));
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
