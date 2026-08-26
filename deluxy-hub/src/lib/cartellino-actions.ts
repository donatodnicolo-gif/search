"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { richiediSessione, richiediAdmin } from "./sessione-server";
import { richiediDesktop } from "./solo-desktop";
import { emailValida, mandaEmail } from "./posta";
import { rapportoPresenze, riepilogoMese } from "./presenze";
import {
  MAX_CERTIFICATO_BYTE,
  giornoAData,
  giornoDi,
  isTipoAssenza,
  istanteInItalia,
  mimeAmmesso,
  prossimoVerso,
  statoIniziale,
} from "./cartellino";

// Server action del Cartellino. Ogni azione ricontrolla da sola due cose:
// chi sei (sessione) e da dove stai scrivendo (desktop). Nascondere il bottone
// non basta: una action è un endpoint POST, e da telefono si potrebbe chiamare
// a mano se il controllo stesse solo nella pagina.

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

async function chiSta() {
  await richiediDesktop();
  return richiediSessione();
}

// ---------- Timbratura ----------

// Il verso NON arriva dal form: si guarda l'ultima timbratura della giornata e
// si fa il gesto opposto. Così due click ravvicinati (o un tasto indietro) non
// possono aprire due turni o chiudere due volte lo stesso.
export async function timbra() {
  const sessione = await chiSta();
  const adesso = new Date();
  const giorno = giornoDi(adesso);

  const ultima = await prisma.timbratura.findFirst({
    where: { utenteId: sessione.uid, giorno },
    orderBy: { istante: "desc" },
    select: { verso: true },
  });

  await prisma.timbratura.create({
    data: {
      utenteId: sessione.uid,
      verso: prossimoVerso(ultima?.verso),
      istante: adesso,
      giorno,
      origine: "web",
    },
  });

  revalidatePath("/cartellino");
  revalidatePath("/");
  redirect(`/cartellino?ok=${prossimoVerso(ultima?.verso) === "entrata" ? "entrata" : "uscita"}`);
}

// Giornata inserita a mano: dimenticanza, lavoro fuori sede, rientro serale.
// Resta marcata `origine: "manuale"` — chi controlla il cartellino deve vedere
// a colpo d'occhio cosa è stato timbrato davvero e cosa è stato dichiarato.
export async function registraGiornata(fd: FormData) {
  const sessione = await chiSta();

  const giorno = testo(fd, "giorno");
  const entrata = testo(fd, "entrata");
  const uscita = testo(fd, "uscita");
  const note = testo(fd, "note").slice(0, 300);

  const inizio = istanteInItalia(giorno, entrata);
  if (!inizio) redirect("/cartellino?errore=orari");

  const oggi = giornoDi(new Date());
  // Non si registra una giornata nel futuro: sarebbe una previsione, non una presenza.
  if (giorno > oggi) redirect("/cartellino?errore=futuro");
  // Timbratura arretrata (giorno già passato): la motivazione è obbligatoria —
  // chi controlla il cartellino deve trovare il perché accanto alla dichiarazione.
  if (giorno < oggi && !note) redirect("/cartellino?errore=motivo-arretrata");

  const fine = uscita ? istanteInItalia(giorno, uscita) : null;
  if (uscita && !fine) redirect("/cartellino?errore=orari");
  if (fine && fine.getTime() <= inizio.getTime()) redirect("/cartellino?errore=ordine-orari");

  await prisma.timbratura.createMany({
    data: [
      { utenteId: sessione.uid, verso: "entrata", istante: inizio, giorno, origine: "manuale", note },
      ...(fine
        ? [
            {
              utenteId: sessione.uid,
              verso: "uscita",
              istante: fine,
              giorno,
              origine: "manuale",
              note,
            },
          ]
        : []),
    ],
  });

  revalidatePath("/cartellino");
  redirect("/cartellino?ok=giornata");
}

// ---------- Assenze ----------

export async function richiediAssenza(fd: FormData) {
  const sessione = await chiSta();

  const tipo = testo(fd, "tipo");
  const dalTxt = testo(fd, "dal");
  const alTxt = testo(fd, "al") || dalTxt;
  const motivo = testo(fd, "motivo").slice(0, 500);

  if (!isTipoAssenza(tipo)) redirect("/cartellino?errore=tipo");

  const dal = giornoAData(dalTxt);
  const al = giornoAData(alTxt);
  if (!dal || !al) redirect("/cartellino?errore=date");
  if (al.getTime() < dal.getTime()) redirect("/cartellino?errore=ordine-date");
  // Un anno intero di assenza non si chiede da un form: è un errore di battitura.
  if (al.getTime() - dal.getTime() > 366 * 86_400_000) redirect("/cartellino?errore=troppo-lunga");

  const file = fd.get("certificato");
  const conFile = file instanceof File && file.size > 0;
  if (conFile) {
    const problema = controllaFile(file);
    if (problema) redirect(`/cartellino?errore=${problema}`);
  }

  const assenza = await prisma.assenza.create({
    data: {
      utenteId: sessione.uid,
      tipo,
      dal,
      al,
      motivo,
      stato: statoIniziale(tipo),
    },
  });

  if (conFile) {
    await salvaCertificato(file, sessione.uid, assenza.id, testo(fd, "protocollo"));
  }

  revalidatePath("/cartellino");
  revalidatePath("/cartellino/gestione");
  redirect(`/cartellino?ok=${tipo === "malattia" ? "malattia" : "richiesta"}`);
}

// Certificato allegato dopo, a un'assenza già registrata (il medico lo manda il
// giorno dopo: è la norma, non l'eccezione).
export async function caricaCertificato(fd: FormData) {
  const sessione = await chiSta();

  const assenzaId = testo(fd, "assenzaId");
  const file = fd.get("certificato");
  if (!(file instanceof File) || file.size === 0) redirect("/cartellino?errore=file-mancante");

  const problema = controllaFile(file);
  if (problema) redirect(`/cartellino?errore=${problema}`);

  // Si allega solo alla PROPRIA assenza: l'id arriva dal form, quindi si verifica.
  const assenza = await prisma.assenza.findUnique({
    where: { id: assenzaId },
    select: { id: true, utenteId: true },
  });
  if (!assenza || assenza.utenteId !== sessione.uid) redirect("/cartellino?errore=non-tua");

  await salvaCertificato(file, sessione.uid, assenza.id, testo(fd, "protocollo"));

  revalidatePath("/cartellino");
  revalidatePath("/cartellino/gestione");
  redirect("/cartellino?ok=certificato");
}

// Ritirare una richiesta ancora senza risposta. Quelle già decise restano:
// sono la storia del cartellino, non si riscrive.
export async function annullaRichiesta(fd: FormData) {
  const sessione = await chiSta();
  const id = testo(fd, "id");

  const assenza = await prisma.assenza.findUnique({
    where: { id },
    select: { id: true, utenteId: true, stato: true },
  });
  if (!assenza || assenza.utenteId !== sessione.uid) redirect("/cartellino?errore=non-tua");
  if (assenza.stato !== "in-attesa") redirect("/cartellino?errore=gia-decisa");

  await prisma.assenza.delete({ where: { id } });

  revalidatePath("/cartellino");
  revalidatePath("/cartellino/gestione");
  redirect("/cartellino?ok=annullata");
}

// ---------- Decisione dell'amministratore ----------

// Due azioni distinte invece di un solo form con due bottoni: il `value` del
// bottone che invia NON arriva nella FormData di una server action (React
// costruisce i dati dal form, non dal submitter). Ogni bottone porta quindi la
// propria `formAction`, e la nota scritta nel form vale per entrambe.
export async function approvaAssenza(fd: FormData) {
  return decidi(fd, "approva");
}

export async function respingiAssenza(fd: FormData) {
  return decidi(fd, "respingi");
}

async function decidi(fd: FormData, decisione: "approva" | "respingi") {
  await richiediDesktop();
  const sessione = await richiediAdmin();

  const id = testo(fd, "id");
  const nota = testo(fd, "nota").slice(0, 300);

  const assenza = await prisma.assenza.findUnique({ where: { id }, select: { stato: true } });
  if (!assenza) redirect("/cartellino/gestione?errore=sparita");
  // La malattia registrata non si approva né si respinge: non è una richiesta.
  if (assenza.stato === "registrata") redirect("/cartellino/gestione?errore=non-decidibile");

  await prisma.assenza.update({
    where: { id },
    data: {
      stato: decisione === "approva" ? "approvata" : "respinta",
      decisaDa: sessione.uid,
      decisaDaNome: sessione.nome,
      decisaIl: new Date(),
      notaDecisione: nota,
    },
  });

  revalidatePath("/cartellino/gestione");
  revalidatePath("/cartellino");
  redirect(`/cartellino/gestione?ok=${decisione === "approva" ? "approvata" : "respinta"}`);
}

// ---------- Il riepilogo presenze via email ----------

// L'admin sceglie il destinatario: può essere il commercialista, il consulente
// del lavoro, chiunque. Non c'è una rubrica di indirizzi "fidati" perché il
// destinatario cambia ogni volta — quello che c'è è un'anteprima esatta di ciò
// che parte, sopra il bottone.
export async function mandaPresenze(fd: FormData) {
  await richiediDesktop();
  const sessione = await richiediAdmin();

  const destinatario = testo(fd, "destinatario");
  const mese = testo(fd, "mese");
  const nota = testo(fd, "nota").slice(0, 300);

  if (!/^\d{4}-\d{2}$/.test(mese)) redirect("/cartellino/gestione?errore=mese");
  if (!emailValida(destinatario)) {
    redirect(`/cartellino/gestione?mese=${mese}&errore=destinatario`);
  }

  const riepilogo = await riepilogoMese(mese);
  const rapporto = rapportoPresenze(riepilogo, { nota, daNome: sessione.nome });

  let problema: string | null = null;
  try {
    await mandaEmail({
      a: destinatario,
      oggetto: rapporto.oggetto,
      testo: rapporto.testo,
      html: rapporto.html,
    });
  } catch (e) {
    // Il motivo vero serve: "non è partita" senza spiegazione manda a indovinare.
    // La pagina è solo per admin, e un errore SMTP non contiene segreti.
    problema = e instanceof Error ? e.message.slice(0, 160) : "errore sconosciuto";
  }

  if (problema) {
    redirect(
      `/cartellino/gestione?mese=${mese}&errore=invio&dettaglio=${encodeURIComponent(problema)}`,
    );
  }
  redirect(
    `/cartellino/gestione?mese=${mese}&ok=inviata&a=${encodeURIComponent(destinatario)}`,
  );
}

// ---------- Aiutanti ----------

// Ritorna il codice d'errore da mostrare, oppure null se il file va bene.
function controllaFile(file: File): string | null {
  if (file.size > MAX_CERTIFICATO_BYTE) return "file-grande";
  if (!mimeAmmesso(file.type)) return "file-tipo";
  return null;
}

async function salvaCertificato(
  file: File,
  utenteId: string,
  assenzaId: string,
  protocollo: string,
) {
  const dati = Buffer.from(await file.arrayBuffer());
  await prisma.certificato.create({
    data: {
      utenteId,
      assenzaId,
      // Il nome arriva dal computer di chi carica: si tiene corto e senza
      // percorsi, perché finisce in un header Content-Disposition.
      nomeFile: file.name.replace(/[\\/]/g, "_").slice(0, 120) || "certificato",
      tipoMime: file.type,
      dimensione: file.size,
      dati,
      protocollo: protocollo.slice(0, 40),
    },
  });
}
