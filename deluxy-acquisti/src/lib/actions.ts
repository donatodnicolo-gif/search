"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";

// Server actions della UI. L'identità di chi agisce ("io") arriva dai campi
// nascosti del form (nome/email salvati nel browser): l'app è dietro la
// password unica del team, qui distinguiamo solo CHI fa cosa, non l'accesso.

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}
function data(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Chi può approvare/rifiutare: se ACQUISTI_APPROVATORI è impostata, solo quelle
// email; altrimenti chiunque nel team (ma mai chi ha creato la richiesta).
function puoApprovare(email: string | null, richiedenteEmail: string): { ok: boolean; motivo?: string } {
  const lista = (process.env.ACQUISTI_APPROVATORI || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (email && email.toLowerCase() === richiedenteEmail.toLowerCase()) {
    return { ok: false, motivo: "Non puoi approvare una richiesta che hai creato tu." };
  }
  if (lista.length && (!email || !lista.includes(email.toLowerCase()))) {
    return { ok: false, motivo: "Solo un responsabile abilitato può approvare." };
  }
  return { ok: true };
}

// ─── RICHIESTE ───
export async function creaRichiesta(fd: FormData) {
  const titolo = str(fd.get("titolo"));
  if (!titolo) throw new Error("Il titolo è obbligatorio.");
  await prisma.richiestaAcquisto.create({
    data: {
      titolo,
      descrizione: str(fd.get("descrizione")),
      categoria: str(fd.get("categoria")),
      fornitoreSuggerito: str(fd.get("fornitoreSuggerito")),
      importoStimato: num(fd.get("importoStimato")),
      valuta: str(fd.get("valuta")) ?? "EUR",
      priorita: str(fd.get("priorita")) ?? "media",
      dataNecessita: data(fd.get("dataNecessita")),
      richiedenteEmail: str(fd.get("ioEmail")) ?? "sconosciuto",
      richiedenteNome: str(fd.get("ioNome")),
      stato: "inviata",
    },
  });
  revalidatePath("/");
}

export async function decidiRichiesta(fd: FormData) {
  const id = str(fd.get("id"));
  const esito = str(fd.get("esito")); // "approvata" | "rifiutata"
  if (!id || (esito !== "approvata" && esito !== "rifiutata")) throw new Error("Dati non validi.");
  const richiesta = await prisma.richiestaAcquisto.findUnique({ where: { id } });
  if (!richiesta) throw new Error("Richiesta inesistente.");
  if (richiesta.stato !== "inviata") throw new Error("La richiesta è già stata decisa.");

  const ioEmail = str(fd.get("ioEmail"));
  const check = puoApprovare(ioEmail, richiesta.richiedenteEmail);
  if (!check.ok) throw new Error(check.motivo);

  await prisma.richiestaAcquisto.update({
    where: { id },
    data: {
      stato: esito,
      approvatoreEmail: ioEmail,
      approvatoreNome: str(fd.get("ioNome")),
      decisoIl: new Date(),
      notaDecisione: str(fd.get("nota")),
    },
  });
  revalidatePath("/");
}

// Converte una richiesta approvata in un Acquisto e le lega insieme.
export async function convertiRichiesta(fd: FormData) {
  const id = str(fd.get("id"));
  if (!id) throw new Error("Id mancante.");
  const richiesta = await prisma.richiestaAcquisto.findUnique({ where: { id } });
  if (!richiesta) throw new Error("Richiesta inesistente.");
  if (richiesta.stato !== "approvata") throw new Error("Solo una richiesta approvata può diventare acquisto.");

  const totale = num(fd.get("totale")) ?? richiesta.importoStimato ?? 0;
  const acquisto = await prisma.acquisto.create({
    data: {
      descrizione: str(fd.get("descrizione")) ?? richiesta.titolo,
      categoria: richiesta.categoria,
      fornitoreNome: str(fd.get("fornitoreNome")) ?? richiesta.fornitoreSuggerito ?? "Da definire",
      totale,
      imponibile: num(fd.get("imponibile")) ?? totale,
      iva: num(fd.get("iva")) ?? 0,
      valuta: richiesta.valuta,
      stato: "ordinato",
      creatoDa: str(fd.get("ioNome")) ?? str(fd.get("ioEmail")),
      note: richiesta.descrizione,
    },
  });
  await prisma.richiestaAcquisto.update({
    where: { id },
    data: { stato: "convertita", acquistoId: acquisto.id },
  });
  revalidatePath("/");
}

// ─── ACQUISTI ───
export async function creaAcquisto(fd: FormData) {
  const descrizione = str(fd.get("descrizione"));
  const fornitoreNome = str(fd.get("fornitoreNome"));
  if (!descrizione) throw new Error("La descrizione è obbligatoria.");
  if (!fornitoreNome) throw new Error("Il fornitore è obbligatorio.");
  const imponibile = num(fd.get("imponibile")) ?? 0;
  const iva = num(fd.get("iva")) ?? 0;
  const totale = num(fd.get("totale")) ?? imponibile + iva;
  await prisma.acquisto.create({
    data: {
      descrizione,
      fornitoreNome,
      fornitorePiva: str(fd.get("fornitorePiva")),
      categoria: str(fd.get("categoria")),
      imponibile,
      iva,
      totale,
      valuta: str(fd.get("valuta")) ?? "EUR",
      stato: str(fd.get("stato")) ?? "ordinato",
      numeroFattura: str(fd.get("numeroFattura")),
      dataFattura: data(fd.get("dataFattura")),
      dataConsegnaPrevista: data(fd.get("dataConsegnaPrevista")),
      note: str(fd.get("note")),
      creatoDa: str(fd.get("ioNome")) ?? str(fd.get("ioEmail")),
    },
  });
  revalidatePath("/");
}

export async function aggiornaStatoAcquisto(fd: FormData) {
  const id = str(fd.get("id"));
  const stato = str(fd.get("stato"));
  if (!id || !stato) throw new Error("Dati non validi.");
  await prisma.acquisto.update({ where: { id }, data: { stato } });
  revalidatePath("/");
}

// ─── MOVIMENTI ───
export async function registraMovimento(fd: FormData) {
  const acquistoId = str(fd.get("acquistoId"));
  const importo = num(fd.get("importo"));
  if (!acquistoId) throw new Error("Acquisto mancante.");
  if (importo == null || importo <= 0) throw new Error("Importo non valido.");
  const acquisto = await prisma.acquisto.findUnique({
    where: { id: acquistoId },
    include: { movimenti: true },
  });
  if (!acquisto) throw new Error("Acquisto inesistente.");

  await prisma.movimentoFinanziario.create({
    data: {
      acquistoId,
      tipo: str(fd.get("tipo")) ?? "pagamento",
      importo,
      valuta: acquisto.valuta,
      stato: str(fd.get("stato")) ?? "eseguito",
      metodo: str(fd.get("metodo")),
      riferimento: str(fd.get("riferimento")),
      data: data(fd.get("data")) ?? new Date(),
      scadenza: data(fd.get("scadenza")),
      note: str(fd.get("note")),
      creatoDa: str(fd.get("ioNome")) ?? str(fd.get("ioEmail")),
    },
  });

  // Ricalcola lo stato di pagamento dell'acquisto in base ai movimenti eseguiti
  // (i rimborsi/note di credito riducono il pagato).
  await ricalcolaStatoPagamento(acquistoId);
  revalidatePath("/");
}

export async function eliminaMovimento(fd: FormData) {
  const id = str(fd.get("id"));
  if (!id) throw new Error("Id mancante.");
  const mov = await prisma.movimentoFinanziario.findUnique({ where: { id } });
  if (!mov) return;
  await prisma.movimentoFinanziario.delete({ where: { id } });
  await ricalcolaStatoPagamento(mov.acquistoId);
  revalidatePath("/");
}

// Quanto è stato pagato (eseguito) di un acquisto: pagamenti/acconti/saldi in
// positivo, note di credito/rimborsi in negativo. Aggiorna lo stato se non è
// stato messo a mano su "annullato".
export async function ricalcolaStatoPagamento(acquistoId: string) {
  const acquisto = await prisma.acquisto.findUnique({
    where: { id: acquistoId },
    include: { movimenti: true },
  });
  if (!acquisto || acquisto.stato === "annullato") return;
  const pagato = acquisto.movimenti
    .filter((m) => m.stato === "eseguito")
    .reduce((s, m) => s + (["nota_credito", "rimborso"].includes(m.tipo) ? -m.importo : m.importo), 0);
  let stato = acquisto.stato;
  if (pagato <= 0) stato = acquisto.stato === "ricevuto" ? "ricevuto" : "ordinato";
  else if (pagato + 0.01 < acquisto.totale) stato = "pagato_parziale";
  else stato = "pagato";
  if (stato !== acquisto.stato) {
    await prisma.acquisto.update({ where: { id: acquistoId }, data: { stato } });
  }
}
