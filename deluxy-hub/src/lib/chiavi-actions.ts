"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { cifra } from "./cifratura";
import { hashToken } from "./token-api";
import { idAppValidi } from "./apps";
import { richiediAdmin } from "./sessione-server";
import { mandaEmail, provaCollegamento } from "./posta";

// Server action della pagina /chiavi (solo admin). Come per gli utenti, il
// middleware blocca la rotta ma ogni azione ricontrolla il ruolo lato server.

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

function suffissoDi(valore: string): string {
  return valore.slice(-4);
}

export async function creaChiave(fd: FormData) {
  await richiediAdmin();

  const progetto = testo(fd, "progetto");
  const nome = testo(fd, "nome");
  const valore = String(fd.get("valore") ?? "").trim();
  const note = testo(fd, "note");

  if (!progetto || !nome || !valore) redirect("/chiavi?errore=dati");

  const esiste = await prisma.chiave.findUnique({
    where: { progetto_nome: { progetto, nome } },
  });
  if (esiste) redirect("/chiavi?errore=esiste");

  let valoreCifrato: string;
  try {
    valoreCifrato = cifra(valore);
  } catch {
    redirect("/chiavi?errore=segreto");
  }

  await prisma.chiave.create({
    data: { progetto, nome, valoreCifrato, suffisso: suffissoDi(valore), note },
  });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=creata");
}

export async function aggiornaChiave(fd: FormData) {
  await richiediAdmin();

  const id = testo(fd, "id");
  const valore = String(fd.get("valore") ?? "").trim();
  const note = testo(fd, "note");

  if (!id) redirect("/chiavi?errore=dati");

  // Valore vuoto = invariato: si possono aggiornare solo le note.
  const dati: { note: string; valoreCifrato?: string; suffisso?: string } = { note };
  if (valore) {
    try {
      dati.valoreCifrato = cifra(valore);
    } catch {
      redirect("/chiavi?errore=segreto");
    }
    dati.suffisso = suffissoDi(valore);
  }

  await prisma.chiave.update({ where: { id }, data: dati });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=aggiornata");
}

export async function eliminaChiave(fd: FormData) {
  await richiediAdmin();

  const id = testo(fd, "id");
  if (!id) redirect("/chiavi?errore=dati");

  await prisma.chiave.delete({ where: { id } });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=eliminata");
}

// --- Token di servizio per l'API di lettura (GET /api/chiavi) ---

// Il token in chiaro lo genera il browser (crypto sicuro) e arriva qui già
// pronto: noi salviamo solo il suo SHA-256, così sul database non c'è mai il
// valore. `progetti` limita cosa può leggere (nessuna spunta = tutti).
export async function creaToken(fd: FormData) {
  await richiediAdmin();

  const nome = testo(fd, "nome");
  const token = String(fd.get("token") ?? "").trim();
  const progetti = idAppValidi(fd.getAll("progetti").map((v) => String(v)));

  // Il token deve essere lungo: se il campo è vuoto o corto, il browser non ha
  // generato nulla (JS disattivato) — non salviamo un token debole.
  if (!nome || token.length < 24) redirect("/chiavi?errore=token");

  // Uno scope vuoto vale «tutti i progetti» (vedi le rotte /api/chiavi e
  // /api/presenze): un token creato senza spunte diventa una chiave maestra su
  // TUTTI i segreti di tutte le app. Deny-by-default: almeno un progetto, così
  // la master key non nasce per distrazione.
  if (progetti.length === 0) redirect("/chiavi?errore=scope");

  const hash = hashToken(token);
  if (await prisma.tokenApi.findUnique({ where: { hash } })) {
    redirect("/chiavi?errore=token-esiste");
  }

  await prisma.tokenApi.create({ data: { nome, hash, progetti } });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=token-creato");
}

export async function revocaToken(fd: FormData) {
  await richiediAdmin();

  const id = testo(fd, "id");
  if (!id) redirect("/chiavi?errore=dati");

  await prisma.tokenApi.delete({ where: { id } });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=token-revocato");
}

/**
 * Configura in un colpo solo la posta del portale (progetto «hub»).
 *
 * Perché un’azione dedicata invece del modulo generico: le chiavi della posta
 * sono CINQUE con nomi esatti, e chiederle una alla volta significa indovinare
 * ogni volta progetto e nome — è il motivo per cui la posta è rimasta non
 * configurata. Qui si compila un modulo solo e le righe le scrive l’app.
 *
 * Le voci vuote non si toccano: chi vuole cambiare la sola password lascia il
 * resto in bianco e non perde quello che c’era.
 */
export async function salvaPosta(fd: FormData) {
  await richiediAdmin();

  const valori: Record<string, string> = {
    SMTP_HOST: testo(fd, "host"),
    SMTP_PORT: testo(fd, "porta"),
    SMTP_USER: testo(fd, "utente"),
    SMTP_PASS: String(fd.get("password") ?? "").trim(),
    SMTP_FROM: testo(fd, "mittente"),
  };

  const daScrivere = Object.entries(valori).filter(([, v]) => v !== "");
  if (daScrivere.length === 0) redirect("/chiavi?errore=dati");

  for (const [nome, valore] of daScrivere) {
    let valoreCifrato: string;
    try {
      valoreCifrato = cifra(valore);
    } catch {
      redirect("/chiavi?errore=segreto");
    }
    // Upsert: la prima volta crea, le successive aggiorna — cambiare la
    // password della casella non deve costringere a cancellare la riga.
    await prisma.chiave.upsert({
      where: { progetto_nome: { progetto: "hub", nome } },
      create: {
        progetto: "hub",
        nome,
        valoreCifrato,
        suffisso: suffissoDi(valore),
        note: "Posta del portale",
      },
      update: { valoreCifrato, suffisso: suffissoDi(valore) },
    });
  }

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=posta");
}

/**
 * «Prova il collegamento»: autentica sul server di posta senza spedire nulla.
 * Risponde nella pagina con l'esito vero — compreso il motivo del rifiuto, che
 * è l'unica cosa utile quando le credenziali non vanno.
 */
export async function provaPosta() {
  await richiediAdmin();
  const esito = await provaCollegamento();
  if (esito.ok) redirect("/chiavi?ok=posta-collegata");
  redirect(`/chiavi?errore=posta-prova&dettaglio=${encodeURIComponent(esito.motivo)}`);
}

/**
 * «Mandami una prova»: spedisce un messaggio VERO alla casella dell'admin che
 * preme il bottone. Il destinatario non si sceglie da un campo: si prende dalla
 * sessione, così questo bottone non può diventare un modo per mandare posta a
 * terzi da dentro il pannello.
 */
export async function mandaProvaPosta() {
  const sessione = await richiediAdmin();
  const utente = await prisma.utente.findUnique({
    where: { id: sessione.uid },
    select: { email: true, nome: true },
  });
  if (!utente) redirect("/chiavi?errore=posta-prova&dettaglio=utente%20non%20trovato");

  try {
    await mandaEmail({
      a: utente.email,
      oggetto: "Deluxy Hub — prova di posta",
      testo: [
        `Ciao ${utente.nome},`,
        "",
        "questa è una prova: la posta del portale funziona.",
        "Da adesso partono il recupero password e il riepilogo presenze,",
        "e le altre app possono chiedere al Hub di spedire per loro.",
        "",
        "Deluxy Hub",
      ].join(String.fromCharCode(10)),
    });
  } catch (e) {
    const motivo = e instanceof Error ? e.message.slice(0, 300) : "errore sconosciuto";
    redirect(`/chiavi?errore=posta-prova&dettaglio=${encodeURIComponent(motivo)}`);
  }

  redirect(`/chiavi?ok=posta-inviata&a=${encodeURIComponent(utente.email)}`);
}
