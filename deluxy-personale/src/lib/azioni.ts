"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authAttiva, leggiSessione, SESSION_COOKIE } from "./auth";
import { prisma } from "./db";
import { isAdmin } from "./ruoli";
import { parseData, parseImporto } from "./formato";
import { QUALIFICHE, FREQUENZE_ATTIVITA, MOTIVI_COMPENSO, TIPI_CONTRATTO } from "./organico";

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

export async function creaPersona(fd: FormData): Promise<void> {
  const negato = await richiediAdmin();
  if (negato) conErrore("/persone/nuova", negato);
  const dati = datiPersonaDaForm(fd, "/persone/nuova");
  const persona = await prisma.persona.create({ data: dati });
  revalidatePath("/");
  redirect(`/persone/${persona.id}`);
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

export async function assegnaMansione(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
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
  revalidatePath(percorso);
  redirect(percorso);
}

export async function rimuoviAssegnazione(fd: FormData): Promise<void> {
  const personaId = testo(fd, "personaId");
  const percorso = `/persone/${personaId}`;
  const negato = await richiediAdmin();
  if (negato) conErrore(percorso, negato);
  await prisma.assegnazione.delete({ where: { id: testo(fd, "id") } });
  revalidatePath(percorso);
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
