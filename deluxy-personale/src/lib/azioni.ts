"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authAttiva, leggiSessione, SESSION_COOKIE } from "./auth";
import { prisma } from "./db";
import { isAdmin } from "./ruoli";
import { parseData, parseImporto } from "./formato";
import {
  QUALIFICHE,
  FREQUENZE_ATTIVITA,
  MOTIVI_COMPENSO,
  normalizzaNome,
  TIPI_BENEFIT_BASE,
  TIPI_CONTRATTO,
} from "./organico";
import { proponiPersonaABudgets } from "./budgets";
import { presenzeDalHub } from "./presenze-hub";
import { inviaMail } from "./posta";

// Tutte le scritture dell'app passano da qui. Regole:
// - scrive solo un admin (l'ingresso con la password d'app vale admin);
// - un input non valido RIFIUTA con un messaggio, non si azzera in silenzio;
// - niente cancellazioni di ciò che ha storia: una persona si CESSA, non si
//   elimina; si eliminano solo righe puntuali (un'attività, una riga di
//   storico scritta per sbaglio).

async function richiediAdmin(): Promise<string | null> {
  if (!authAttiva()) return null; // sviluppo locale: aperto
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  if (!sessione) return "Sessione scaduta: rientra.";
  if (!isAdmin(sessione.ruolo)) return "Solo un amministratore può modificare questi dati.";
  return null;
}

function testo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim();
}

function conErrore(percorso: string, messaggio: string): never {
  const sep = percorso.includes("?") ? "&" : "?";
  redirect(`${percorso}${sep}err=${encodeURIComponent(messaggio)}`);
}

// ---------- Funzioni ----------

export async function creaFunzione(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  const nome = testo(fd, "nome");
  if (!nome) conErrore("/funzioni", "Il nome della funzione è obbligatorio.");
  try {
    await prisma.funzione.create({
      data: { nome, descrizione: testo(fd, "descrizione") },
    });
  } catch {
    conErrore("/funzioni", `Esiste già una funzione che si chiama «${nome}».`);
  }
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

export async function aggiornaFunzione(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  const id = testo(fd, "id");
  const nome = testo(fd, "nome");
  if (!id || !nome) conErrore("/funzioni", "Il nome della funzione è obbligatorio.");
  const responsabileId = testo(fd, "responsabileId") || null;
  try {
    await prisma.funzione.update({
      where: { id },
      data: { nome, descrizione: testo(fd, "descrizione"), responsabileId },
    });
  } catch {
    conErrore("/funzioni", "Non sono riuscito a salvare la funzione (nome doppio?).");
  }
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

export async function eliminaFunzione(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  const id = testo(fd, "id");
  const [persone, mansioni] = await Promise.all([
    prisma.persona.count({ where: { funzioneId: id } }),
    prisma.mansione.count({ where: { funzioneId: id } }),
  ]);
  if (persone > 0 || mansioni > 0) {
    conErrore(
      "/funzioni",
      `La funzione ha ${persone} person${persone === 1 ? "a" : "e"} e ${mansioni} mansion${mansioni === 1 ? "e" : "i"}: spostale prima di eliminarla.`,
    );
  }
  await prisma.funzione.delete({ where: { id } });
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

// ---------- Mansioni ----------

export async function creaMansione(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  const funzioneId = testo(fd, "funzioneId");
  const nome = testo(fd, "nome");
  if (!funzioneId || !nome) conErrore("/funzioni", "Il nome della mansione è obbligatorio.");
  try {
    await prisma.mansione.create({
      data: { funzioneId, nome, descrizione: testo(fd, "descrizione") },
    });
  } catch {
    conErrore("/funzioni", `In questa funzione esiste già la mansione «${nome}».`);
  }
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

export async function aggiornaMansione(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  const id = testo(fd, "id");
  const nome = testo(fd, "nome");
  if (!id || !nome) conErrore("/funzioni", "Il nome della mansione è obbligatorio.");
  try {
    await prisma.mansione.update({ where: { id }, data: { nome, descrizione: testo(fd, "descrizione") } });
  } catch {
    conErrore("/funzioni", `In questa funzione esiste già la mansione «${nome}».`);
  }
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

export async function eliminaMansione(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  const id = testo(fd, "id");
  const assegnate = await prisma.assegnazione.count({ where: { mansioneId: id } });
  if (assegnate > 0) {
    conErrore(
      "/funzioni",
      `La mansione è assegnata a ${assegnate} person${assegnate === 1 ? "a" : "e"}: togli prima le assegnazioni.`,
    );
  }
  await prisma.mansione.delete({ where: { id } }); // le attività seguono (cascade)
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

// ---------- Attività di mansione ----------

export async function creaAttivita(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  const mansioneId = testo(fd, "mansioneId");
  const nome = testo(fd, "nome");
  if (!mansioneId || !nome) conErrore("/funzioni", "Il nome dell'attività è obbligatorio.");
  const frequenza = testo(fd, "frequenza");
  const valida = (FREQUENZE_ATTIVITA as readonly string[]).includes(frequenza) ? frequenza : "";
  const ultime = await prisma.attivitaMansione.aggregate({
    where: { mansioneId },
    _max: { ordine: true },
  });
  await prisma.attivitaMansione.create({
    data: {
      mansioneId,
      nome,
      dettaglio: testo(fd, "dettaglio"),
      frequenza: valida,
      ordine: (ultime._max.ordine ?? 0) + 1,
    },
  });
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

export async function aggiornaAttivita(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  const id = testo(fd, "id");
  const nome = testo(fd, "nome");
  if (!id || !nome) conErrore("/funzioni", "Il nome dell'attività è obbligatorio.");
  const frequenza = testo(fd, "frequenza");
  await prisma.attivitaMansione.update({
    where: { id },
    data: {
      nome,
      dettaglio: testo(fd, "dettaglio"),
      frequenza: (FREQUENZE_ATTIVITA as readonly string[]).includes(frequenza) ? frequenza : "",
    },
  });
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

export async function eliminaAttivita(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/funzioni", negato);
  await prisma.attivitaMansione.delete({ where: { id: testo(fd, "id") } });
  revalidatePath("/funzioni");
  redirect("/funzioni");
}

// ---------- Persone ----------

function datiPersonaDaForm(fd: FormData, percorsoErrore: string) {
  const nome = testo(fd, "nome");
  if (!nome) conErrore(percorsoErrore, "Nome e cognome sono obbligatori.");
  const dataAssunzione = testo(fd, "dataAssunzione") ? parseData(testo(fd, "dataAssunzione")) : null;
  if (testo(fd, "dataAssunzione") && !dataAssunzione) {
    conErrore(percorsoErrore, "La data di assunzione non è una data valida.");
  }
  return {
    nome,
    email: testo(fd, "email").toLowerCase(),
    telefono: testo(fd, "telefono"),
    ruolo: testo(fd, "ruolo"),
    sede: testo(fd, "sede"),
    funzioneId: testo(fd, "funzioneId") || null,
    responsabileId: testo(fd, "responsabileId") || null,
    dataAssunzione,
    note: testo(fd, "note"),
  };
}

// L'organigramma è un albero: nessuno può riportare, direttamente o per
// catena, a sé stesso.
async function creaCicloOrganigramma(personaId: string, responsabileId: string | null): Promise<boolean> {
  let corrente = responsabileId;
  for (let passi = 0; corrente && passi < 100; passi++) {
    if (corrente === personaId) return true;
    const sopra: { responsabileId: string | null } | null = await prisma.persona.findUnique({
      where: { id: corrente },
      select: { responsabileId: true },
    });
    corrente = sopra?.responsabileId ?? null;
  }
  return false;
}

// I campi anagrafici che viaggiano nel giro di decisione sull'omonimia
// (redirect con query string: niente si perde, niente si riscrive).
const CAMPI_PERSONA = ["nome", "ruolo", "email", "telefono", "sede", "funzioneId", "responsabileId", "dataAssunzione", "note"] as const;

export async function creaPersona(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/persone/nuova", negato);
  const dati = datiPersonaDaForm(fd, "/persone/nuova");

  // Un'omonima esistente non si duplica in silenzio: si torna al form con la
  // proposta — aggiorna/ricongiungi la scheda che c'è, oppure crea comunque
  // (forza=1) se è davvero un'altra persona con lo stesso nome.
  if (fd.get("forza") !== "1") {
    const tutte = await prisma.persona.findMany({ select: { id: true, nome: true } });
    const chiave = normalizzaNome(dati.nome);
    const omonima = tutte.find((p) => normalizzaNome(p.nome) === chiave);
    if (omonima) {
      const parametri = new URLSearchParams({ doppione: omonima.id });
      for (const campo of CAMPI_PERSONA) {
        const valore = testo(fd, campo);
        if (valore) parametri.set(campo, valore);
      }
      redirect(`/persone/nuova?${parametri.toString()}`);
    }
  }

  const persona = await prisma.persona.create({ data: dati, include: { funzione: true } });
  revalidatePath("/");

  // Il ponte verso Budgets (regola del 24/08): la persona pubblicata qui si
  // PROPONE anche al roster di pianificazione. Un guasto là non blocca la
  // nascita qui: diventa un avviso sulla scheda.
  const esito = await proponiPersonaABudgets({
    nome: persona.nome,
    ruolo: persona.ruolo,
    team: persona.funzione?.nome ?? null,
  });
  const parametro = esito.ok
    ? `nota=${encodeURIComponent(esito.messaggio)}`
    : `err=${encodeURIComponent(`La persona è stata creata qui, ma NON è arrivata a Budgets: ${esito.messaggio}`)}`;
  redirect(`/persone/${persona.id}?${parametro}`);
}

export async function aggiornaPersona(fd: FormData): Promise<void> {
  const id = testo(fd, "id");
  const percorso = `/persone/${id}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  const dati = datiPersonaDaForm(fd, percorso);
  if (dati.responsabileId && (dati.responsabileId === id || (await creaCicloOrganigramma(id, dati.responsabileId)))) {
    conErrore(percorso, "Così l'organigramma girerebbe in cerchio: scegli un altro responsabile.");
  }
  await prisma.persona.update({ where: { id }, data: dati });
  revalidatePath(percorso);
  revalidatePath("/");
  revalidatePath("/organigramma");
  redirect(percorso);
}

// Collegamento «riporta a» fatto direttamente dall'organigramma: stessa
// scrittura del form della scheda, stessa guardia sui cicli.
export async function impostaResponsabile(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/organigramma", negato);
  const personaId = testo(fd, "personaId");
  if (!personaId) conErrore("/organigramma", "Persona mancante.");
  const responsabileId = testo(fd, "responsabileId") || null;
  if (responsabileId && (responsabileId === personaId || (await creaCicloOrganigramma(personaId, responsabileId)))) {
    conErrore("/organigramma", "Così l'organigramma girerebbe in cerchio: scegli un altro responsabile.");
  }
  await prisma.persona.update({ where: { id: personaId }, data: { responsabileId } });
  revalidatePath("/organigramma");
  revalidatePath("/");
  revalidatePath(`/persone/${personaId}`);
  redirect("/organigramma");
}

// RICONGIUNGIMENTO: i dati scritti nel form della persona nuova finiscono
// sulla scheda dell'omonima già esistente, invece di generare un doppione.
// Si aggiornano SOLO i campi compilati (un campo lasciato vuoto non cancella
// niente); se la scheda era cessata, torna attiva — ricongiungere vuol dire
// che la persona è qui.
export async function ricongiungiPersona(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/persone/nuova", negato);
  const id = testo(fd, "id");
  if (!id) conErrore("/persone/nuova", "Scheda da ricongiungere non indicata.");
  const percorso = `/persone/${id}`;

  const aggiornamenti: Record<string, unknown> = {};
  for (const campo of ["ruolo", "email", "telefono", "sede", "note"] as const) {
    const valore = testo(fd, campo);
    if (valore) aggiornamenti[campo] = campo === "email" ? valore.toLowerCase() : valore;
  }
  const funzioneId = testo(fd, "funzioneId");
  if (funzioneId) aggiornamenti.funzioneId = funzioneId;
  const responsabileId = testo(fd, "responsabileId");
  if (responsabileId) {
    if (responsabileId === id || (await creaCicloOrganigramma(id, responsabileId))) {
      conErrore(percorso, "Così l'organigramma girerebbe in cerchio: scegli un altro responsabile.");
    }
    aggiornamenti.responsabileId = responsabileId;
  }
  const dataAssunzione = testo(fd, "dataAssunzione") ? parseData(testo(fd, "dataAssunzione")) : null;
  if (dataAssunzione) aggiornamenti.dataAssunzione = dataAssunzione;

  await prisma.persona.update({
    where: { id },
    data: { ...aggiornamenti, stato: "attivo", dataCessazione: null },
  });
  revalidatePath(percorso);
  revalidatePath("/");
  revalidatePath("/organigramma");
  redirect(
    `${percorso}?nota=${encodeURIComponent("Ricongiunta: i dati compilati sono finiti su questa scheda, nessun doppione creato.")}`,
  );
}

export async function cessaPersona(fd: FormData): Promise<void> {
  const id = testo(fd, "id");
  const percorso = `/persone/${id}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  const dataCessazione = parseData(testo(fd, "dataCessazione"));
  if (!dataCessazione) conErrore(percorso, "Serve la data di cessazione.");
  // Chi riportava alla persona cessata risale al responsabile di lei: un ramo
  // d'organigramma non resta appeso a chi non c'è più.
  const persona = await prisma.persona.findUnique({ where: { id }, select: { responsabileId: true } });
  await prisma.$transaction([
    prisma.persona.update({ where: { id }, data: { stato: "cessato", dataCessazione } }),
    prisma.persona.updateMany({
      where: { responsabileId: id },
      data: { responsabileId: persona?.responsabileId ?? null },
    }),
  ]);
  revalidatePath(percorso);
  revalidatePath("/");
  revalidatePath("/organigramma");
  redirect(percorso);
}

export async function riattivaPersona(fd: FormData): Promise<void> {
  const id = testo(fd, "id");
  const percorso = `/persone/${id}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  await prisma.persona.update({ where: { id }, data: { stato: "attivo", dataCessazione: null } });
  revalidatePath(percorso);
  revalidatePath("/");
  redirect(percorso);
}

// ---------- Mansionario personale ----------

export async function creaAttivitaPersona(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  const nome = testo(fd, "nome");
  if (!nome) conErrore(percorso, "Scrivi cosa fa la persona: il nome dell'attività è obbligatorio.");
  const frequenza = testo(fd, "frequenza");
  const ultime = await prisma.attivitaPersona.aggregate({
    where: { personaId },
    _max: { ordine: true },
  });
  await prisma.attivitaPersona.create({
    data: {
      personaId,
      nome,
      dettaglio: testo(fd, "dettaglio"),
      frequenza: (FREQUENZE_ATTIVITA as readonly string[]).includes(frequenza) ? frequenza : "",
      ordine: (ultime._max.ordine ?? 0) + 1,
    },
  });
  revalidatePath(percorso);
  redirect(percorso);
}

export async function aggiornaAttivitaPersona(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  const id = testo(fd, "id");
  const nome = testo(fd, "nome");
  if (!id || !nome) conErrore(percorso, "Il nome dell'attività è obbligatorio.");
  const frequenza = testo(fd, "frequenza");
  await prisma.attivitaPersona.update({
    where: { id },
    data: {
      nome,
      dettaglio: testo(fd, "dettaglio"),
      frequenza: (FREQUENZE_ATTIVITA as readonly string[]).includes(frequenza) ? frequenza : "",
    },
  });
  revalidatePath(percorso);
  redirect(percorso);
}

export async function eliminaAttivitaPersona(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  await prisma.attivitaPersona.delete({ where: { id: testo(fd, "id") } });
  revalidatePath(percorso);
  redirect(percorso);
}

// ---------- Assegnazioni di mansione ----------
// Le stesse azioni servono DUE pagine: la scheda della persona e «Funzioni e
// mansioni» (campo `torna`): l'assegnazione deve potersi fare da tutte e due
// le direzioni — dalla persona verso il ruolo e dal ruolo verso la persona.

export async function assegnaMansione(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = testo(fd, "torna") || `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  if (!personaId) conErrore(percorso, "Scegli la persona a cui assegnare la mansione.");
  const mansioneId = testo(fd, "mansioneId");
  if (!mansioneId) conErrore(percorso, "Scegli la mansione da assegnare.");
  const principale = fd.get("principale") === "1";
  try {
    await prisma.$transaction(async (tx) => {
      if (principale) {
        await tx.assegnazione.updateMany({ where: { personaId }, data: { principale: false } });
      }
      await tx.assegnazione.create({ data: { personaId, mansioneId, principale } });
    });
  } catch {
    conErrore(percorso, "Questa mansione è già assegnata alla persona.");
  }
  revalidatePath(`/persone/${personaId}`);
  revalidatePath("/funzioni");
  redirect(percorso);
}

export async function rimuoviAssegnazione(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = testo(fd, "torna") || `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  await prisma.assegnazione.delete({ where: { id: testo(fd, "id") } });
  revalidatePath(`/persone/${personaId}`);
  revalidatePath("/funzioni");
  redirect(percorso);
}

// Mettere una persona in una funzione (o toglierla: funzioneId vuoto) anche
// dalla pagina delle funzioni. Una persona sta in UNA funzione: assegnarla da
// qui la SPOSTA, e il menu lo dice mostrando da dove arriva.
export async function spostaInFunzione(fd: FormData): Promise<void> {
  const percorso = testo(fd, "torna") || "/funzioni";
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  const personaId = testo(fd, "personaId");
  if (!personaId) conErrore(percorso, "Scegli la persona.");
  const funzioneId = testo(fd, "funzioneId") || null;
  await prisma.persona.update({ where: { id: personaId }, data: { funzioneId } });
  revalidatePath("/funzioni");
  revalidatePath("/");
  revalidatePath(`/persone/${personaId}`);
  redirect(percorso);
}

export async function segnaPrincipale(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  const id = testo(fd, "id");
  await prisma.$transaction([
    prisma.assegnazione.updateMany({ where: { personaId }, data: { principale: false } }),
    prisma.assegnazione.update({ where: { id }, data: { principale: true } }),
  ]);
  revalidatePath(percorso);
  redirect(percorso);
}

// ---------- Inquadramenti ----------

export async function creaInquadramento(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);

  const decorrenza = parseData(testo(fd, "decorrenza"));
  if (!decorrenza) conErrore(percorso, "Serve la data di decorrenza dell'inquadramento.");
  const tipoContratto = testo(fd, "tipoContratto");
  if (!TIPI_CONTRATTO.some((t) => t.chiave === tipoContratto)) {
    conErrore(percorso, "Scegli il tipo di contratto.");
  }
  const qualifica = testo(fd, "qualifica");
  const partTimeTesto = testo(fd, "partTimePct") || "100";
  const partTimePct = Number(partTimeTesto);
  if (!Number.isInteger(partTimePct) || partTimePct < 1 || partTimePct > 100) {
    conErrore(percorso, "Il part-time è una percentuale intera fra 1 e 100.");
  }
  const scadenza = testo(fd, "scadenza") ? parseData(testo(fd, "scadenza")) : null;
  if (testo(fd, "scadenza") && !scadenza) conErrore(percorso, "La scadenza non è una data valida.");

  await prisma.inquadramento.create({
    data: {
      personaId,
      decorrenza,
      tipoContratto,
      ccnl: testo(fd, "ccnl"),
      livello: testo(fd, "livello"),
      qualifica: (QUALIFICHE as readonly string[]).includes(qualifica) ? qualifica : "",
      partTimePct,
      scadenza,
      note: testo(fd, "note"),
    },
  });
  revalidatePath(percorso);
  revalidatePath("/inquadramenti");
  redirect(percorso);
}

export async function eliminaInquadramento(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  await prisma.inquadramento.delete({ where: { id: testo(fd, "id") } });
  revalidatePath(percorso);
  revalidatePath("/inquadramenti");
  redirect(percorso);
}

// ---------- Cartellini (presenze dal Hub → report al commercialista) ----------

export async function inviaReportPresenze(fd: FormData): Promise<void> {
  const mese = testo(fd, "mese");
  const percorso = `/cartellini?mese=${encodeURIComponent(mese)}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  if (!/^\d{4}-\d{2}$/.test(mese)) conErrore("/cartellini", "Mese non valido.");
  const destinatario = testo(fd, "destinatario").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
    conErrore(percorso, "L'email del destinatario non è valida.");
  }
  const nota = testo(fd, "nota");

  // Il rapporto lo impagina il Hub (stessa fonte della sua schermata): qui si
  // rilegge fresco al momento dell'invio, con l'eventuale nota in testa.
  const presenze = await presenzeDalHub(mese, nota || undefined);
  if (!presenze.ok) conErrore(percorso, `Rapporto non generato: ${presenze.messaggio}`);

  const esito = await inviaMail({
    a: destinatario,
    oggetto: presenze.dati.rapporto.oggetto,
    corpo: presenze.dati.rapporto.testo,
    corpoHtml: presenze.dati.rapporto.html,
  });
  if (!esito.ok) conErrore(percorso, `La mail non è partita: ${esito.errore}`);

  redirect(
    `${percorso}&nota=${encodeURIComponent(`Rapporto «${presenze.dati.rapporto.oggetto}» inviato a ${destinatario} (copia negli Inviati della casella).`)}`,
  );
}

// ---------- Compensi ----------

export async function creaCompenso(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);

  const decorrenza = parseData(testo(fd, "decorrenza"));
  if (!decorrenza) conErrore(percorso, "Serve la data di decorrenza del compenso.");
  const ral = parseImporto(testo(fd, "ral"));
  if (ral == null || ral <= 0) {
    conErrore(percorso, "La RAL non è un importo valido (es. 28.500 o 28.500,50).");
  }
  const mensilita = Number(testo(fd, "mensilita") || "13");
  if (![12, 13, 14].includes(mensilita)) conErrore(percorso, "Le mensilità sono 12, 13 o 14.");

  const nettoTesto = testo(fd, "nettoMensile");
  const nettoMensile = nettoTesto ? parseImporto(nettoTesto) : null;
  if (nettoTesto && (nettoMensile == null || nettoMensile <= 0)) {
    conErrore(percorso, "Il netto mensile non è un importo valido.");
  }
  const contributiTesto = testo(fd, "contributiPct");
  const contributiPct = contributiTesto ? parseImporto(contributiTesto) : null;
  if (contributiTesto && (contributiPct == null || contributiPct < 0 || contributiPct > 100)) {
    conErrore(percorso, "I contributi sono una percentuale fra 0 e 100.");
  }
  const motivo = testo(fd, "motivo");

  await prisma.compenso.create({
    data: {
      personaId,
      decorrenza,
      ral,
      mensilita,
      nettoMensile,
      contributiPct,
      benefit: testo(fd, "benefit"),
      motivo: MOTIVI_COMPENSO.some((m) => m.chiave === motivo) ? motivo : "",
      note: testo(fd, "note"),
    },
  });
  revalidatePath(percorso);
  revalidatePath("/stipendi");
  redirect(percorso);
}

export async function eliminaCompenso(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  await prisma.compenso.delete({ where: { id: testo(fd, "id") } });
  revalidatePath(percorso);
  revalidatePath("/stipendi");
  redirect(percorso);
}

// ---------- Benefit ----------
// Il VOCABOLARIO dei benefit (buoni pasto, cellulare, auto…) lo governa
// l'amministratore dalla pagina /benefit; l'assegnazione a una persona si fa
// sia da lì sia dalla sua scheda (campo `torna`, come per le mansioni).

export async function creaTipoBenefit(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/benefit", negato);
  const nome = testo(fd, "nome");
  if (!nome) conErrore("/benefit", "Il nome del benefit è obbligatorio.");
  const ultime = await prisma.tipoBenefit.aggregate({ _max: { ordine: true } });
  try {
    await prisma.tipoBenefit.create({
      data: { nome, descrizione: testo(fd, "descrizione"), ordine: (ultime._max.ordine ?? 0) + 1 },
    });
  } catch {
    conErrore("/benefit", `Esiste già un benefit che si chiama «${nome}».`);
  }
  revalidatePath("/benefit");
  redirect("/benefit");
}

// I quattro di partenza, con un click: crea solo quelli che ancora mancano
// (per nome), quindi rilanciarlo non duplica niente.
export async function creaTipiBenefitBase(): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/benefit", negato);
  const esistenti = await prisma.tipoBenefit.findMany({ select: { nome: true } });
  const gia = new Set(esistenti.map((t) => normalizzaNome(t.nome)));
  const nuovi = TIPI_BENEFIT_BASE.filter((t) => !gia.has(normalizzaNome(t.nome)));
  const ultime = await prisma.tipoBenefit.aggregate({ _max: { ordine: true } });
  let ordine = ultime._max.ordine ?? 0;
  if (nuovi.length > 0) {
    await prisma.tipoBenefit.createMany({
      data: nuovi.map((t) => ({ nome: t.nome, descrizione: t.descrizione, ordine: ++ordine })),
    });
  }
  revalidatePath("/benefit");
  redirect(
    `/benefit?nota=${encodeURIComponent(
      nuovi.length > 0
        ? `Creati ${nuovi.length} tipi di base: ${nuovi.map((t) => t.nome).join(", ")}.`
        : "I tipi di base esistono già tutti.",
    )}`,
  );
}

export async function eliminaTipoBenefit(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/benefit", negato);
  const id = testo(fd, "id");
  const assegnati = await prisma.benefitPersona.count({ where: { tipoId: id } });
  if (assegnati > 0) {
    conErrore(
      "/benefit",
      `Questo benefit è assegnato a ${assegnati} person${assegnati === 1 ? "a" : "e"}: togli prima le assegnazioni.`,
    );
  }
  await prisma.tipoBenefit.delete({ where: { id } });
  revalidatePath("/benefit");
  redirect("/benefit");
}

function datiBenefitDaForm(fd: FormData, percorso: string) {
  const dettaglio = testo(fd, "dettaglio");
  const valoreTesto = testo(fd, "valoreMensile");
  const valoreMensile = valoreTesto ? parseImporto(valoreTesto) : null;
  if (valoreTesto && (valoreMensile == null || valoreMensile <= 0)) {
    conErrore(percorso, "Il valore mensile non è un importo valido (es. 160 o 160,50).");
  }
  const dal = testo(fd, "dal") ? parseData(testo(fd, "dal")) : null;
  if (testo(fd, "dal") && !dal) conErrore(percorso, "La data «dal» non è una data valida.");
  return { dettaglio, valoreMensile, dal };
}

export async function assegnaBenefit(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = testo(fd, "torna") || `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  if (!personaId) conErrore(percorso, "Scegli la persona a cui assegnare il benefit.");
  const tipoId = testo(fd, "tipoId");
  if (!tipoId) conErrore(percorso, "Scegli quale benefit assegnare.");
  await prisma.benefitPersona.create({
    data: { personaId, tipoId, ...datiBenefitDaForm(fd, percorso) },
  });
  revalidatePath(`/persone/${personaId}`);
  revalidatePath("/benefit");
  redirect(percorso);
}

export async function aggiornaBenefitPersona(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = testo(fd, "torna") || `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  await prisma.benefitPersona.update({
    where: { id: testo(fd, "id") },
    data: datiBenefitDaForm(fd, percorso),
  });
  revalidatePath(`/persone/${personaId}`);
  revalidatePath("/benefit");
  redirect(percorso);
}

export async function rimuoviBenefit(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = testo(fd, "torna") || `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  await prisma.benefitPersona.delete({ where: { id: testo(fd, "id") } });
  revalidatePath(`/persone/${personaId}`);
  revalidatePath("/benefit");
  redirect(percorso);
}
